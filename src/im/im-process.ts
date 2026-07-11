import { Platform } from 'obsidian';
import {
    isAbsolutePath,
    expandTilde,
    externalFileExists,
} from '../util/external-fs';

type ExecFileError = {
    code?: string | number;
    signal?: string | null;
    message?: string;
};

type ExecFileOptions = {
    timeout?: number;
    killSignal?: string | number;
};

type ChildProcessHandle = {
    kill(signal?: string | number): void;
};

type ChildProcessType = {
    execFile(
        file: string,
        args: readonly string[],
        options: ExecFileOptions,
        callback: (
            error: ExecFileError | null,
            stdout: string,
            stderr: string,
        ) => void,
    ): ChildProcessHandle;
};

export interface ImProcessConfig {
    binary: string;
    args: string[];
    timeoutMs: number;
}

let childProcessCache: ChildProcessType | null = null;
let pendingProcess: ChildProcessHandle | null = null;
let disabled = false;
let errorTimestamps: number[] = [];

const ERROR_WINDOW_MS = 60_000;
const ERROR_THRESHOLD = 3;

function getModule<T>(name: string): T {
    const requireFn = (
        window as Window & { require?: (module: string) => unknown }
    ).require;
    if (!requireFn) {
        throw new Error('Node modules unavailable');
    }
    return requireFn(name) as T;
}

function getChildProcess(): ChildProcessType {
    if (!childProcessCache) {
        childProcessCache = getModule<ChildProcessType>('child_process');
    }
    return childProcessCache;
}

function recordError(message: string, error?: ExecFileError): void {
    const now = Date.now();
    errorTimestamps = errorTimestamps.filter((t) => now - t <= ERROR_WINDOW_MS);
    errorTimestamps.push(now);

    if (error) {
        console.warn(`IM process error: ${message}`, error);
    } else {
        console.warn(`IM process error: ${message}`);
    }

    if (errorTimestamps.length >= ERROR_THRESHOLD && !disabled) {
        disabled = true;
        console.warn('IM process disabled after repeated errors');
    }
}

function recordSuccess(): void {
    errorTimestamps = [];
    disabled = false;
}

function isFatalExecError(error: ExecFileError): boolean {
    return error.code === 'ENOENT' || Boolean(error.signal);
}

function replaceImPlaceholder(args: string[], imId: string): string[] {
    return args.map((arg) =>
        arg.includes('{im}') ? arg.split('{im}').join(imId) : arg,
    );
}

function terminatePendingProcess(): void {
    if (pendingProcess) {
        pendingProcess.kill();
        pendingProcess = null;
    }
}

export function parseImArgs(argsString: string): string[] {
    const trimmed = argsString.trim();
    if (!trimmed) return [];
    return trimmed.split(/\s+/);
}

export function isValidImIdentifier(id: string): boolean {
    if (!id || id.length > 256) return false;
    // eslint-disable-next-line no-control-regex -- deliberately rejects control characters for IM identifier security validation
    return /^[^\x00-\x1f\x7f;&|$`'"\\(){}<>!]+$/.test(id);
}

export async function validateImBinary(binary: string): Promise<boolean> {
    if (!Platform.isDesktop) return false;
    if (!isAbsolutePath(binary)) return false;

    const resolved = expandTilde(binary);
    return await externalFileExists(resolved);
}

export async function executeImGet(
    config: ImProcessConfig,
): Promise<string | null> {
    if (!Platform.isDesktop) return null;
    if (disabled) return null;

    const timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : 5000;
    const binary = expandTilde(config.binary);

    terminatePendingProcess();

    return await new Promise((resolve) => {
        let childProcess: ChildProcessType;

        try {
            childProcess = getChildProcess();
        } catch (error) {
            recordError('Failed to load child_process', {
                message: (error as Error).message,
            });
            resolve(null);
            return;
        }

        try {
            pendingProcess = childProcess.execFile(
                binary,
                config.args,
                { timeout: timeoutMs, killSignal: 'SIGTERM' },
                (error, stdout) => {
                    pendingProcess = null;

                    if (error && isFatalExecError(error)) {
                        recordError('execFile failed', error);
                        resolve(null);
                        return;
                    }

                    recordSuccess();
                    resolve(stdout.trim());
                },
            );
        } catch (error) {
            pendingProcess = null;
            recordError('execFile threw', {
                message: (error as Error).message,
            });
            resolve(null);
        }
    });
}

export async function executeImSet(
    config: ImProcessConfig,
    imId: string,
): Promise<boolean> {
    if (!Platform.isDesktop) return false;
    if (disabled) return false;
    if (!isValidImIdentifier(imId)) return false;

    const timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : 5000;
    const binary = expandTilde(config.binary);
    const args = replaceImPlaceholder(config.args, imId);

    terminatePendingProcess();

    return await new Promise((resolve) => {
        let childProcess: ChildProcessType;

        try {
            childProcess = getChildProcess();
        } catch (error) {
            recordError('Failed to load child_process', {
                message: (error as Error).message,
            });
            resolve(false);
            return;
        }

        try {
            pendingProcess = childProcess.execFile(
                binary,
                args,
                { timeout: timeoutMs, killSignal: 'SIGTERM' },
                (error) => {
                    pendingProcess = null;

                    if (error && isFatalExecError(error)) {
                        recordError('execFile failed', error);
                        resolve(false);
                        return;
                    }

                    recordSuccess();
                    resolve(true);
                },
            );
        } catch (error) {
            pendingProcess = null;
            recordError('execFile threw', {
                message: (error as Error).message,
            });
            resolve(false);
        }
    });
}
