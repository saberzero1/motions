import { Notice, Platform, type App } from 'obsidian';
import { runCleanups } from '../util/cleanup';
import { expandTilde } from '../util/external-fs';
import { parentDirOf } from '../util/open-path';
import { MsgpackRpcClient } from './msgpack-rpc';
import {
    NeovimDocumentSync,
    neovimByteToUtf16,
    utf16ToNeovimByte,
    type NeovimEditorOptions,
} from './document-sync';
import { NeovimKeyDelegation } from './key-delegation';
import { NeovimDecorationBridge } from './decorations';
import { NeovimMessageRouter } from './messages';
import { NeovimRedrawDispatcher } from './redraw';
import { NeovimCmdlineOverlay } from './cmdline';
import { NeovimPopupMenuOverlay } from './popupmenu';
import {
    NeovimObsidianFeatureBridge,
    type HostNavigationTarget,
} from './obsidian-feature-bridge';
import type { VimRegistration } from '../vim/registration';
import type { VimModeTracker } from '../vim/mode-tracker';
import { neovimModeToVimMode, setExternalVimMode } from '../vim/external-mode';
import { NeovimModeStatus } from './mode-status';

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
    removeAllListeners(): void;
    unref(): void;
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

// Neovim 0.12 is api_level 14, not 12. 12 is 0.10 and 13 is 0.11, both of
// which used to clear this gate and then fail inside the decoration bridge on
// `on_range`, a key `nvim_set_decoration_provider` only learned in 0.12.
// test/unit/rpc/neovim-api-floor.test.ts holds the floor against the keys
// companion.lua actually passes.
export const REQUIRED_API_LEVEL = 14;
export const REQUIRED_VERSION = '0.12';
const CONNECT_TIMEOUT_MS = 10_000;
const SIGKILL_ESCALATION_MS = 2_000;

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

// libuv's Windows error mapping read backwards (`uv_translate_sys_error`,
// src/win/error.c): EACCES there is ERROR_ELEVATION_REQUIRED or
// ERROR_CANT_ACCESS_FILE, while a plain ERROR_ACCESS_DENIED arrives as EPERM.
// Reporting EACCES as "not executable" is therefore wrong on Windows, and is
// what sent issue #199 hunting a file-permission problem that did not exist.
function describeSpawnFailure(error: ProcessError, isWindows: boolean): string {
    const code = typeof error.code === 'string' ? error.code : null;
    if (code === 'ENOENT')
        return 'the binary was not found (ENOENT). Leave the path empty to use nvim from your PATH.';
    if (code === 'EACCES')
        return isWindows
            ? 'Windows refused to run it (EACCES). That usually means the executable is marked "Run this program as an administrator" under Properties → Compatibility, or that the path is not a native Windows executable — a WSL or mapped-drive path cannot be launched directly.'
            : 'the binary is not executable (EACCES).';
    if (code === 'EPERM')
        return 'the operating system denied access (EPERM). Check the file permissions and any antivirus or endpoint-protection software.';
    if (error.signal) return `the process ended with signal ${error.signal}.`;
    return `${error.message || String(error)}${code ? ` (${code})` : ''}`;
}

export function neovimStartFailureNotice(
    binaryPath: string,
    error: unknown,
    isWindows: boolean,
): string {
    const processError =
        error instanceof Error
            ? (error as ProcessError)
            : new Error(String(error));
    return `Vim Motions: could not start Neovim at "${binaryPath}": ${describeSpawnFailure(processError, isWindows)}`;
}

// Separate from the spawn notice on purpose. The process is already running by
// the time this can fire, so the configured path and its permissions are
// proven good and saying otherwise misdirects.
export function neovimHandshakeFailureNotice(
    binaryPath: string,
    error: unknown,
): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Vim Motions: Neovim started at "${binaryPath}" but the connection failed: ${message}. The path is fine — this is a Neovim-side error, so check your Neovim configuration.`;
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

// The only filesystem path this may carry is the user's own neovimConfigPath.
// Nothing derived from pluginAutoFetch, which writes into the vault's lua/
// tree, may reach Neovim's runtimepath: that would make the plugin install
// executable dependencies for the real runtime, which the Developer Policies
// forbid. test/unit/rpc/plugin-autofetch-boundary.test.ts holds this.
export function buildNeovimSpawnArgs(configPath: string | null): string[] {
    const args = ['--embed', '--headless'];
    if (configPath) {
        args.push(
            '--clean',
            '--cmd',
            `lua vim.opt.runtimepath:prepend(${JSON.stringify(parentDirOf(configPath))})`,
            // --clean strips the user packpath, which silently breaks
            // vim.pack: it clones the plugin to disk and then never puts it on
            // the runtimepath, so require() still fails. Measured. Restoring
            // only the standard site directory re-enables packages without
            // bringing back the wrapper-injected runtimepath that --clean is
            // here to exclude.
            '--cmd',
            "lua vim.opt.packpath:append(vim.fs.joinpath(vim.fn.stdpath('data'), 'site'))",
            '-u',
            configPath,
        );
    }
    return args;
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
    private popupMenuOverlay: NeovimPopupMenuOverlay | null = null;
    private modeStatus: NeovimModeStatus | null = null;
    private featureBridge: NeovimObsidianFeatureBridge | null = null;

    constructor(
        private readonly app: App,
        private readonly getRegistration: () => VimRegistration | null,
        private readonly getNavigationTarget: (
            actionName: string,
        ) => HostNavigationTarget | null = () => null,
        private readonly getModeTracker: () => VimModeTracker | null = () =>
            null,
        private readonly getLeaderKey: () => string = () => '\\',
    ) {}

    async connect(
        configuredPath: string,
        configuredConfigPath: string,
        editorOptions: NeovimEditorOptions,
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
            const args = buildNeovimSpawnArgs(configPath);
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

        let spawned = false;
        try {
            await this.waitForSpawn(child);
            spawned = true;
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
                editorOptions,
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
            ) {
                this.mode = (initialMode as { mode: string }).mode;
                // Published here as well as on every key, so the per-mode host
                // features do not read the stood-down fork in the window
                // between connecting and the first keystroke.
                setExternalVimMode(neovimModeToVimMode(this.mode));
            }
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
            this.popupMenuOverlay = new NeovimPopupMenuOverlay(
                this.app,
                this.cmdlineOverlay,
                redrawDispatcher,
            );
            documentSync.setMirrorObserver(() =>
                this.popupMenuOverlay?.reanchor(),
            );
            this.modeStatus = new NeovimModeStatus(
                redrawDispatcher,
                this.getModeTracker,
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
                this.getLeaderKey,
            );
            this.featureBridge = featureBridge;
            await featureBridge.start();
            const keyDelegation = new NeovimKeyDelegation(
                this.app,
                rpc,
                documentSync,
                (mode) => {
                    this.mode = mode;
                    setExternalVimMode(neovimModeToVimMode(mode));
                },
            );
            keyDelegation.start();
            this.keyDelegation = keyDelegation;
            this.apiLevel = apiLevel;
            this.connected = true;
            return true;
        } catch (error) {
            if (operation === this.operation) {
                this.showStartFailure(binaryPath, error, spawned);
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

    async setEditorOptions(options: NeovimEditorOptions): Promise<void> {
        await this.documentSync?.setEditorOptions(options);
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
        // Published before the awaits, not after. stop() issues one request per
        // installed mapping, command and abbreviation to a Neovim that is
        // already on its way out, and a request that never settles is not
        // caught by its .catch -- it waits out the request timeout, leaving
        // observers reading connected === true for that entire window.
        this.expectedExit = true;
        this.connected = false;
        this.apiLevel = null;

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
        this.popupMenuOverlay?.dispose();
        this.popupMenuOverlay = null;
        this.modeStatus?.dispose();
        this.modeStatus = null;
        this.redrawDispatcher?.dispose();
        this.redrawDispatcher = null;
        this.documentSync?.dispose();
        this.documentSync = null;
        if (child.exitCode !== null || child.signalCode !== null) {
            rpc.dispose();
            if (this.child === child) this.resetState();
            return;
        }

        child.removeAllListeners();
        child.unref();
        this.scheduleChildShutdown(child);

        rpc.dispose();
        if (this.child === child) this.resetState();
    }

    /**
     * Ends the child without awaiting it.
     *
     * This used to defer the whole shutdown by three seconds, as a mitigation
     * for a renderer SIGSEGV on disconnect. That crash has since been root
     * caused -- a leaked `web-tree-sitter` `TreeCursor` whose GC finalizer
     * freed a tree the CM6 bridge had already deleted, nothing to do with
     * teardown -- and the deferral is gone with it. The measurement that
     * justified it was confounded: both of its arms contained the leak. With
     * the leak fixed, the reproducer spec measures 0 segfaults in 16 runs both
     * with the deferral and with the original synchronous quit-and-wait, which
     * used to crash 24 of 46.
     *
     * What is kept is not the mitigation but the shape, which is better on its
     * own merits. Nothing is awaited, so disconnect returns immediately instead
     * of blocking for up to four seconds. No `qa!`: that made Neovim exit
     * immediately, while SIGTERM lets it exit on its own terms. Both paths
     * self-check `exitCode`/`signalCode`, so a child that has already gone is
     * left alone, and if the window dies first the pipes close with it and
     * `nvim --embed` exits on channel close regardless.
     */
    private scheduleChildShutdown(child: ChildProcessHandle): void {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM');
        window.setTimeout(() => {
            if (child.exitCode !== null || child.signalCode !== null) return;
            child.kill('SIGKILL');
        }, SIGKILL_ESCALATION_MS);
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

    private showStartFailure(
        binaryPath: string,
        error: unknown,
        spawned = false,
    ): void {
        new Notice(
            spawned
                ? neovimHandshakeFailureNotice(binaryPath, error)
                : neovimStartFailureNotice(binaryPath, error, Platform.isWin),
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
        this.popupMenuOverlay?.dispose();
        this.popupMenuOverlay = null;
        this.modeStatus?.dispose();
        this.modeStatus = null;
        this.redrawDispatcher?.dispose();
        this.redrawDispatcher = null;
        this.documentSync?.dispose();
        this.documentSync = null;
        this.rpc = null;
        this.child = null;
        this.connected = false;
        this.apiLevel = null;
        this.mode = null;
        setExternalVimMode(null);
        this.binaryPath = null;
        this.configPath = null;
        this.expectedExit = false;
    }
}
