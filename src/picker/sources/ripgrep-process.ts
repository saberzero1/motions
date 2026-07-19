import { Platform, type App } from 'obsidian';
import {
    expandTilde,
    isAbsolutePath,
    externalFileExists,
} from '../../util/external-fs';

type ExecFileError = {
    code?: string | number;
    signal?: string | null;
    message?: string;
};

type ExecFileOptions = {
    timeout?: number;
    killSignal?: string | number;
    cwd?: string;
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

export interface RipgrepConfig {
    binary: string;
    args: string[];
    timeoutMs: number;
    mode: 'ripgrep' | 'grep';
}

export interface RipgrepMatch {
    path: string;
    lineNumber: number;
    lineText: string;
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
        console.warn(`Ripgrep process error: ${message}`, error);
    } else {
        console.warn(`Ripgrep process error: ${message}`);
    }

    if (errorTimestamps.length >= ERROR_THRESHOLD && !disabled) {
        disabled = true;
        console.warn('Ripgrep process disabled after repeated errors');
    }
}

function recordSuccess(): void {
    errorTimestamps = [];
    disabled = false;
}

export function isFatalExecError(error: ExecFileError): boolean {
    return error.code === 'ENOENT' || Boolean(error.signal);
}

export function parseRipgrepOutput(
    stdout: string,
    maxResults: number,
): RipgrepMatch[] {
    const results: RipgrepMatch[] = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        if (results.length >= maxResults) break;
        try {
            const parsed = JSON.parse(line) as {
                type?: string;
                data?: {
                    path?: { text?: string };
                    line_number?: number;
                    lines?: { text?: string };
                };
            };
            if (parsed.type === 'match') {
                results.push({
                    path: parsed.data?.path?.text ?? '',
                    lineNumber: parsed.data?.line_number ?? 0,
                    lineText: (parsed.data?.lines?.text ?? '').trimEnd(),
                });
            }
        } catch {
            // Skip malformed JSON (partial output on kill)
        }
    }
    return results;
}

/**
 * Parse GNU/BSD grep output in the format: file:line_number:content
 * Produced by `grep -rn` or similar.
 */
export function parseGrepOutput(
    stdout: string,
    maxResults: number,
): RipgrepMatch[] {
    const results: RipgrepMatch[] = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        if (results.length >= maxResults) break;
        // GNU grep format: file:lineNumber:content
        // Handle paths with colons by matching the first numeric segment after a colon
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
            const [, filePath, lineNum, content] = match;
            if (filePath && lineNum) {
                results.push({
                    path: filePath,
                    lineNumber: parseInt(lineNum, 10),
                    lineText: (content ?? '').trimEnd(),
                });
            }
        }
    }
    return results;
}

export function buildArgs(config: RipgrepConfig, query: string): string[] {
    if (config.mode === 'grep') {
        // GNU/BSD grep: -rn for recursive + line numbers, user args, then pattern and directory
        return ['-rn', ...config.args, '--', query, '.'];
    }
    // ripgrep: --json for structured output, --max-count per-file limit, user args, then pattern and directory
    return ['--json', '--max-count', '100', ...config.args, '--', query, '.'];
}

function parseOutput(
    config: RipgrepConfig,
    stdout: string,
    maxResults: number,
): RipgrepMatch[] {
    if (config.mode === 'grep') {
        return parseGrepOutput(stdout, maxResults);
    }
    return parseRipgrepOutput(stdout, maxResults);
}

export function terminatePendingRipgrep(): void {
    if (pendingProcess) {
        pendingProcess.kill();
        pendingProcess = null;
    }
}

export async function validateRipgrepBinary(binary: string): Promise<boolean> {
    if (!Platform.isDesktop) return false;
    if (!isAbsolutePath(binary)) return false;

    const resolved = expandTilde(binary);
    return await externalFileExists(resolved);
}

export async function executeRipgrep(
    config: RipgrepConfig,
    query: string,
    cwd: string,
): Promise<RipgrepMatch[]> {
    if (!Platform.isDesktop) return [];
    if (disabled) return [];

    const timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : 10000;
    const binary = expandTilde(config.binary);
    const args = buildArgs(config, query);

    terminatePendingRipgrep();

    return await new Promise((resolve) => {
        let childProcess: ChildProcessType;

        try {
            childProcess = getChildProcess();
        } catch (error) {
            recordError('Failed to load child_process', {
                message: (error as Error).message,
            });
            resolve([]);
            return;
        }

        try {
            pendingProcess = childProcess.execFile(
                binary,
                args,
                { timeout: timeoutMs, killSignal: 'SIGTERM', cwd },
                (error, stdout) => {
                    pendingProcess = null;

                    if (error && isFatalExecError(error)) {
                        recordError('execFile failed', error);
                        resolve([]);
                        return;
                    }

                    recordSuccess();
                    resolve(parseOutput(config, stdout, 200));
                },
            );
        } catch (error) {
            pendingProcess = null;
            recordError('execFile threw', {
                message: (error as Error).message,
            });
            resolve([]);
        }
    });
}

export function getVaultBasePath(app: App): string | null {
    const adapter = app.vault.adapter;
    if ('getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
        return (adapter as { getBasePath(): string }).getBasePath();
    }
    return null;
}
