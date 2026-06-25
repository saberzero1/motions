import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type { VimApi, CmAdapter } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { getCmAdapter } from '../vim/vim-api';
import { setTextwidth, parseGuicursor } from '../vim/options';
import { parseLine } from './parser';
import type { CursorShapes } from '../settings';

function getVimrcPath(app: App): string {
    return `${app.vault.configDir}.vimrc`;
}

async function readVimrcFile(app: App, path: string): Promise<string | null> {
    try {
        return await app.vault.adapter.read(path);
    } catch {
        return null;
    }
}

function executeCommandById(app: App, commandId: string): void {
    (
        app as unknown as {
            commands: { executeCommandById: (id: string) => void };
        }
    ).commands.executeCommandById(commandId);
}

export function registerVimrcExCommands(vim: VimApi, app: App): void {
    vim.defineEx('noremap', '', (_cm, params) => {
        if (params.args?.length >= 2) {
            vim.noremap(params.args[0]!, params.args.slice(1).join(' '));
        }
    });

    vim.defineEx('iunmap', '', (_cm, params) => {
        if (params.argString.trim()) {
            vim.unmap(params.argString.trim(), 'insert');
        }
    });

    vim.defineEx('nunmap', '', (_cm, params) => {
        if (params.argString.trim()) {
            vim.unmap(params.argString.trim(), 'normal');
        }
    });

    vim.defineEx('vunmap', '', (_cm, params) => {
        if (params.argString.trim()) {
            vim.unmap(params.argString.trim(), 'visual');
        }
    });

    vim.defineEx('exmap', '', (_cm, params) => {
        if (!params.args?.length || params.args.length < 2) return;
        const name = params.args[0]!;
        const rest = params.args.slice(1).join(' ');
        vim.defineEx(name, '', (cm2) => {
            vim.handleEx(cm2, rest);
        });
    });

    vim.defineEx('obcommand', '', (_cm, params) => {
        if (params.args?.[0]) {
            executeCommandById(app, params.args[0]);
        }
    });
}

export async function resolveLeaderKey(
    app: App,
    leaderRegistry: LeaderRegistry,
): Promise<void> {
    const path = getVimrcPath(app);
    await resolveLeaderFromFile(app, path, leaderRegistry);
}

async function resolveLeaderFromFile(
    app: App,
    path: string,
    leaderRegistry: LeaderRegistry,
): Promise<void> {
    const content = await readVimrcFile(app, path);
    if (content === null) return;

    for (const rawLine of content.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('"')) continue;

        const parsed = parseLine(trimmed);

        if (
            parsed?.type === 'let' &&
            parsed.key === 'mapleader' &&
            parsed.value
        ) {
            leaderRegistry.setLeaderKey(parsed.value);
            continue;
        }

        if (parsed?.type === 'source' && parsed.path) {
            await resolveLeaderFromFile(app, parsed.path, leaderRegistry);
        }
    }
}

export interface VimrcLoadResult {
    found: boolean;
    ready: boolean;
    commandCount: number;
    path: string;
    maps: DeferredMap[];
}

export function applyVimrcMaps(vim: VimApi, maps: DeferredMap[]): void {
    for (const m of maps) {
        try {
            if (m.noremap) {
                vim.noremap(m.lhs, m.rhs, m.context);
            } else {
                vim.map(m.lhs, m.rhs, m.context);
            }
        } catch {
            /* intentional: skip malformed mapping */
        }
    }
}

export async function loadVimrc(
    app: App,
    vim: VimApi,
    leaderRegistry?: LeaderRegistry,
    onCursorShapeChange?: (shapes: Partial<CursorShapes>) => void,
): Promise<VimrcLoadResult> {
    const path = getVimrcPath(app);

    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view ? getCmAdapter(view) : null;
    if (!cm) {
        return { found: true, ready: false, commandCount: 0, path, maps: [] };
    }

    registerVimrcExCommands(vim, app);

    const result = await loadVimrcFile(
        app,
        vim,
        cm,
        path,
        '\\',
        leaderRegistry,
        onCursorShapeChange,
    );

    return {
        found: result.found,
        ready: true,
        commandCount: result.commandCount,
        path,
        maps: result.deferredMaps,
    };
}

interface DeferredMap {
    lhs: string;
    rhs: string;
    noremap: boolean;
    context?: 'normal' | 'visual' | 'insert';
}

interface LoadFileResult {
    found: boolean;
    commandCount: number;
    deferredMaps: DeferredMap[];
}

async function loadVimrcFile(
    app: App,
    vim: VimApi,
    cm: CmAdapter,
    path: string,
    leaderKey = '\\',
    leaderRegistry?: LeaderRegistry,
    onCursorShapeChange?: (shapes: Partial<CursorShapes>) => void,
): Promise<LoadFileResult> {
    const content = await readVimrcFile(app, path);
    if (content === null) {
        return { found: false, commandCount: 0, deferredMaps: [] };
    }

    let currentLeader = leaderKey;
    let applied = 0;
    const deferredMaps: DeferredMap[] = [];

    for (const rawLine of content.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('"')) continue;

        const parsed = parseLine(trimmed);

        if (
            parsed?.type === 'let' &&
            parsed.key === 'mapleader' &&
            parsed.value
        ) {
            currentLeader = parsed.value;
            if (leaderRegistry) leaderRegistry.setLeaderKey(currentLeader);
            applied++;
            continue;
        }

        if (parsed?.type === 'source' && parsed.path) {
            const sub = await loadVimrcFile(
                app,
                vim,
                cm,
                parsed.path,
                currentLeader,
                leaderRegistry,
            );
            applied += sub.commandCount;
            deferredMaps.push(...sub.deferredMaps);
            continue;
        }

        const processedLine = trimmed.replace(/<leader>/gi, currentLeader);

        if (parsed?.type === 'map' && parsed.lhs && parsed.rhs) {
            const lhs = parsed.lhs.replace(/<leader>/gi, currentLeader);
            const rhs = parsed.rhs.replace(/<leader>/gi, currentLeader);
            if (leaderRegistry) leaderRegistry.addBinding(lhs, rhs);
            deferredMaps.push({
                lhs,
                rhs,
                noremap: parsed.noremap ?? false,
                context: parsed.context,
            });
        }

        const isTextwidthSet =
            parsed?.type === 'set' &&
            (parsed.key === 'textwidth' || parsed.key === 'tw') &&
            parsed.value;

        if (isTextwidthSet) {
            const tw = Number(parsed.value);
            if (!isNaN(tw) && tw > 0) {
                setTextwidth(tw);
                vim.setOption('textwidth', tw);
            }
            applied++;
            continue;
        }

        const isGuicursorSet =
            parsed?.type === 'set' &&
            parsed.key === 'guicursor' &&
            parsed.value;
        if (isGuicursorSet && onCursorShapeChange) {
            const partial = parseGuicursor(parsed.value as string);
            onCursorShapeChange(partial);
            applied++;
            continue;
        }

        try {
            vim.handleEx(cm, processedLine);
            applied++;
        } catch {
            /* intentional: skip malformed vimrc lines */
        }
    }

    return { found: true, commandCount: applied, deferredMaps };
}
