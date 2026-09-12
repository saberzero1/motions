import { Notice, Platform, type App } from 'obsidian';
import { runCleanups } from '../util/cleanup';
import { expandTilde } from '../util/external-fs';
import { parentDirOf } from '../util/open-path';
import { MsgpackRpcClient } from './msgpack-rpc';
import {
    NeovimDocumentSync,
    neovimByteToUtf16,
    utf16ToNeovimByte,
} from './document-sync';
import { NeovimKeyDelegation } from './key-delegation';
import { NeovimDecorationBridge } from './decorations';
import { NeovimMessageRouter } from './messages';
import { NeovimRedrawDispatcher } from './redraw';
import { NeovimCmdlineOverlay } from './cmdline';
import {
    NeovimObsidianFeatureBridge,
    type HostNavigationTarget,
} from './obsidian-feature-bridge';
import type { VimRegistration } from '../vim/registration';

type ProcessError = Error & { code?: string | number; signal?: string | null };

type ChildStream = {
    on(event: 'data', listener: (data: Uint8Array) => void): void;
    removeListener(event: 'data', listener: (data: Uint8Array) => void): void;
};

type ChildInput = {
    write(data: Uint8Array): boolean;
};

type ChildProcessHandle = {
    pid?: number;
    exitCode: number | null;
    signalCode: string | null;
    stdin: ChildInput;
    stdout: ChildStream;
    once(event: 'spawn', listener: () => void): void;
    once(event: 'error', listener: (error: ProcessError) => void): void;
    once(
        event: 'close',
        listener: (code: number | null, signal: string | null) => void,
    ): void;
    on(
        event: 'close',
        listener: (code: number | null, signal: string | null) => void,
    ): void;
    removeListener(event: 'spawn', listener: () => void): void;
    removeListener(
        event: 'error',
        listener: (error: ProcessError) => void,
    ): void;
    removeListener(
        event: 'close',
        listener: (code: number | null, signal: string | null) => void,
    ): void;
    kill(signal?: string | number): boolean;
};

type ChildProcessModule = {
    spawn(
        command: string,
        args: readonly string[],
        options: { stdio: ['pipe', 'pipe', 'pipe'] },
    ): ChildProcessHandle;
};

type ApiMetadata = {
    version?: { api_level?: number };
};

export interface NeovimConnectionState {
    connected: boolean;
    pid: number | null;
    apiLevel: number | null;
    binaryPath: string | null;
    configPath: string | null;
    mode: string | null;
}

const REQUIRED_API_LEVEL = 12;
const REQUIRED_VERSION = '0.12';
const CONNECT_TIMEOUT_MS = 10_000;
const GRACEFUL_EXIT_TIMEOUT_MS = 2_000;

let childProcessCache: ChildProcessModule | null = null;

function getModule<T>(name: string): T {
    const requireFn = (
        window as Window & { require?: (module: string) => unknown }
    ).require;
    if (!requireFn) throw new Error('Node modules unavailable');
    return requireFn(name) as T;
}

function getChildProcess(): ChildProcessModule {
    if (!childProcessCache)
        childProcessCache = getModule<ChildProcessModule>('child_process');
    return childProcessCache;
}

function formatProcessError(error: ProcessError): string {
    if (error.code === 'ENOENT') return 'the binary was not found';
    if (error.code === 'EACCES') return 'the binary is not executable';
    if (error.signal) return `the process ended with signal ${error.signal}`;
    return error.message || String(error);
}

function apiLevelFromInfo(value: unknown): number | null {
    if (!Array.isArray(value)) return null;
    const metadata = value[1] as ApiMetadata | undefined;
    const apiLevel = metadata?.version?.api_level;
    return typeof apiLevel === 'number' ? apiLevel : null;
}

function channelIdFromInfo(value: unknown): number | null {
    if (!Array.isArray(value)) return null;
    return typeof value[0] === 'number' ? value[0] : null;
}

export function resolveNeovimBinaryPath(configuredPath: string): string {
    const trimmed = configuredPath.trim();
    return trimmed ? expandTilde(trimmed) : 'nvim';
}

export class NeovimConnection {
    private child: ChildProcessHandle | null = null;
    private rpc: MsgpackRpcClient | null = null;
    private connected = false;
    private apiLevel: number | null = null;
    private binaryPath: string | null = null;
    private configPath: string | null = null;
    private mode: string | null = null;
    private expectedExit = false;
    private operation = 0;
    private disconnectPromise: Promise<void> | null = null;

    private documentSync: NeovimDocumentSync | null = null;
    private keyDelegation: NeovimKeyDelegation | null = null;
    private decorationBridge: NeovimDecorationBridge | null = null;
    private redrawDispatcher: NeovimRedrawDispatcher | null = null;
    private messageRouter: NeovimMessageRouter | null = null;
    private cmdlineOverlay: NeovimCmdlineOverlay | null = null;
    private featureBridge: NeovimObsidianFeatureBridge | null = null;

    constructor(
        private readonly app: App,
        private readonly getRegistration: () => VimRegistration | null,
        private readonly getNavigationTarget: (
            actionName: string,
        ) => HostNavigationTarget | null = () => null,
    ) {}

    async connect(
        configuredPath: string,
        configuredConfigPath: string,
        textwidth: number,
    ): Promise<boolean> {
        if (!Platform.isDesktop) return false;
        const binaryPath = resolveNeovimBinaryPath(configuredPath);
        const configPath = configuredConfigPath.trim()
            ? expandTilde(configuredConfigPath.trim())
            : null;
        if (
            this.connected &&
            this.binaryPath === binaryPath &&
            this.configPath === configPath
        )
            return true;
        await this.disconnect();
        const operation = ++this.operation;
        this.expectedExit = false;
        this.binaryPath = binaryPath;
        this.configPath = configPath;

        let child: ChildProcessHandle;
        try {
            const args = ['--embed', '--headless'];
            if (configPath) {
                args.push(
                    '--clean',
                    '--cmd',
                    `lua vim.opt.runtimepath:prepend(${JSON.stringify(parentDirOf(configPath))})`,
                    '-u',
                    configPath,
                );
            }
            child = getChildProcess().spawn(binaryPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
        } catch (error) {
            this.showStartFailure(binaryPath, error);
            this.resetState();
            return false;
        }

        this.child = child;
        const rpc = new MsgpackRpcClient(child.stdin, child.stdout);
        this.rpc = rpc;
        child.on('close', (code, signal) =>
            this.handleClose(child, code, signal),
        );

        try {
            await this.waitForSpawn(child);
            const info = await this.withTimeout(
                rpc.request('nvim_get_api_info', []),
                CONNECT_TIMEOUT_MS,
            );
            const apiLevel = apiLevelFromInfo(info);
            const channelId = channelIdFromInfo(info);
            if (
                apiLevel === null ||
                apiLevel < REQUIRED_API_LEVEL ||
                channelId === null
            ) {
                new Notice(
                    `Vim Motions: Neovim ${REQUIRED_VERSION} or newer is required at "${binaryPath}".`,
                );
                await this.disconnectChild(child, rpc);
                return false;
            }
            if (operation !== this.operation || this.child !== child) {
                await this.disconnectChild(child, rpc);
                return false;
            }
            const documentSync = new NeovimDocumentSync(
                this.app,
                rpc,
                textwidth,
            );
            this.documentSync = documentSync;
            await documentSync.start();
            if (operation !== this.operation || this.child !== child) {
                documentSync.dispose();
                await this.disconnectChild(child, rpc);
                return false;
            }
            const initialMode = await rpc.request('nvim_get_mode', []);
            if (
                typeof initialMode === 'object' &&
                initialMode !== null &&
                typeof (initialMode as { mode?: unknown }).mode === 'string'
            )
                this.mode = (initialMode as { mode: string }).mode;
            const decorationBridge = new NeovimDecorationBridge(
                rpc,
                documentSync,
            );
            this.decorationBridge = decorationBridge;
            const redrawDispatcher = new NeovimRedrawDispatcher(rpc);
            this.redrawDispatcher = redrawDispatcher;
            this.messageRouter = new NeovimMessageRouter(redrawDispatcher);
            this.cmdlineOverlay = new NeovimCmdlineOverlay(
                this.app,
                redrawDispatcher,
            );
            redrawDispatcher.start();
            await decorationBridge.start();
            const featureBridge = new NeovimObsidianFeatureBridge(
                this.app,
                rpc,
                documentSync,
                this.getRegistration,
                channelId,
                this.getNavigationTarget,
            );
            this.featureBridge = featureBridge;
            await featureBridge.start();
            const keyDelegation = new NeovimKeyDelegation(
                this.app,
                rpc,
                documentSync,
                (mode) => {
                    this.mode = mode;
                },
            );
            keyDelegation.start();
            this.keyDelegation = keyDelegation;
            this.apiLevel = apiLevel;
            this.connected = true;
            return true;
        } catch (error) {
            if (operation === this.operation) {
                this.showStartFailure(binaryPath, error);
            }
            if (this.child === child) {
                await this.disconnectChild(child, rpc);
            } else {
                rpc.dispose();
            }
            return false;
        }
    }

    disconnect(): Promise<void> {
        if (!Platform.isDesktop) return Promise.resolve();
        if (this.disconnectPromise) return this.disconnectPromise;
        ++this.operation;
        const child = this.child;
        const rpc = this.rpc;
        this.connected = false;
        this.apiLevel = null;
        if (!child || !rpc) {
            this.resetState();
            return Promise.resolve();
        }
        this.disconnectPromise = this.disconnectChild(child, rpc).finally(
            () => {
                this.disconnectPromise = null;
            },
        );
        return this.disconnectPromise;
    }

    isConnected(): boolean {
        return this.connected;
    }

    getState(): NeovimConnectionState {
        return {
            connected: this.connected,
            pid: this.child?.pid ?? null,
            apiLevel: this.apiLevel,
            binaryPath: this.binaryPath,
            configPath: this.configPath,
            mode: this.mode,
        };
    }

    async request(method: string, args: unknown[]): Promise<unknown> {
        if (!this.connected || !this.rpc)
            throw new Error('Neovim is not connected');
        await this.documentSync?.waitForActivation();
        await this.keyDelegation?.flush();
        return this.rpc.request(method, args);
    }

    async setTextwidth(textwidth: number): Promise<void> {
        await this.documentSync?.setTextwidth(textwidth);
    }

    isKeyDelegating(): boolean {
        return this.keyDelegation?.isActive() ?? false;
    }

    getKeyDelegationState(): {
        active: boolean;
        handlerAttached: boolean;
        keyInterceptActive: boolean;
    } {
        return (
            this.keyDelegation?.getHandlerState() ?? {
                active: false,
                handlerAttached: false,
                keyInterceptActive: false,
            }
        );
    }

    async refreshFeatureBridge(): Promise<void> {
        if (!this.connected) return;
        await this.featureBridge?.start();
    }

    byteToUtf16(text: string, column: number): number {
        return neovimByteToUtf16(text, column);
    }

    utf16ToByte(text: string, column: number): number {
        return utf16ToNeovimByte(text, column);
    }

    private waitForSpawn(child: ChildProcessHandle): Promise<void> {
        return new Promise((resolve, reject) => {
            const onSpawn = (): void => {
                runCleanups(
                    [
                        () => child.removeListener('error', onError),
                        () => child.removeListener('spawn', onSpawn),
                    ],
                    'Neovim spawn listeners',
                );
                resolve();
            };
            const onError = (error: ProcessError): void => {
                runCleanups(
                    [
                        () => child.removeListener('spawn', onSpawn),
                        () => child.removeListener('error', onError),
                    ],
                    'Neovim spawn listeners',
                );
                reject(error);
            };
            child.once('spawn', onSpawn);
            child.once('error', onError);
        });
    }

    private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(
                () => reject(new Error('RPC attach timed out')),
                timeoutMs,
            );
            promise.then(
                (value) => {
                    window.clearTimeout(timer);
                    resolve(value);
                },
                (error: unknown) => {
                    window.clearTimeout(timer);
                    reject(
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                    );
                },
            );
        });
    }

    private async disconnectChild(
        child: ChildProcessHandle,
        rpc: MsgpackRpcClient,
    ): Promise<void> {
        await this.featureBridge?.stop();
        this.featureBridge = null;
        this.keyDelegation?.dispose();
        this.keyDelegation = null;
        this.decorationBridge?.dispose();
        this.decorationBridge = null;
        this.messageRouter?.dispose();
        this.messageRouter = null;
        this.cmdlineOverlay?.dispose();
        this.cmdlineOverlay = null;
        this.redrawDispatcher?.dispose();
        this.redrawDispatcher = null;
        this.documentSync?.dispose();
        this.documentSync = null;
        this.expectedExit = true;
        this.connected = false;
        this.apiLevel = null;
        if (child.exitCode !== null || child.signalCode !== null) {
            rpc.dispose();
            if (this.child === child) this.resetState();
            return;
        }

        try {
            rpc.notify('nvim_command', ['qa!']);
        } catch (error) {
            console.warn(
                'Vim Motions: Neovim graceful shutdown failed:',
                error,
            );
        }

        await new Promise<void>((resolve) => {
            let forceTimer = 0;
            const onClose = (): void => {
                if (forceTimer) window.clearTimeout(forceTimer);
                child.removeListener('close', onClose);
                resolve();
            };
            child.once('close', onClose);
            forceTimer = window.setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null)
                    child.kill('SIGKILL');
            }, GRACEFUL_EXIT_TIMEOUT_MS);
        });
        rpc.dispose();
        if (this.child === child) this.resetState();
    }

    private handleClose(
        child: ChildProcessHandle,
        code: number | null,
        signal: string | null,
    ): void {
        if (this.child !== child) return;
        const unexpected = this.connected && !this.expectedExit;
        const binaryPath = this.binaryPath ?? 'nvim';
        this.rpc?.dispose(new Error('Neovim process exited'));
        this.resetState();
        if (unexpected) {
            const reason = signal
                ? `signal ${signal}`
                : `exit code ${code ?? 0}`;
            new Notice(
                `Vim Motions: Neovim at "${binaryPath}" exited unexpectedly (${reason}).`,
            );
        }
    }

    private showStartFailure(binaryPath: string, error: unknown): void {
        const processError =
            error instanceof Error
                ? (error as ProcessError)
                : new Error(String(error));
        new Notice(
            `Vim Motions: could not start Neovim at "${binaryPath}": ${formatProcessError(processError)}. Check the configured path and permissions.`,
        );
    }

    private resetState(): void {
        void this.featureBridge?.stop();
        this.featureBridge = null;
        this.keyDelegation?.dispose();
        this.keyDelegation = null;
        this.decorationBridge?.dispose();
        this.decorationBridge = null;
        this.messageRouter?.dispose();
        this.messageRouter = null;
        this.cmdlineOverlay?.dispose();
        this.cmdlineOverlay = null;
        this.redrawDispatcher?.dispose();
        this.redrawDispatcher = null;
        this.documentSync?.dispose();
        this.documentSync = null;
        this.rpc = null;
        this.child = null;
        this.connected = false;
        this.apiLevel = null;
        this.mode = null;
        this.binaryPath = null;
        this.configPath = null;
        this.expectedExit = false;
    }
}
