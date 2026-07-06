import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type { VimApi, CmAdapter } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { getCmAdapter } from '../vim/vim-api';
import {
    setTextwidth,
    setClipboardOption,
    parseGuicursor,
} from '../vim/options';
import { parseLine } from './parser';

type SettingOverrideFn = (
    key: string,
    value: unknown,
    directive?: string,
) => void;

interface BoolOpt {
    type: 'boolean';
    settingsKey: string;
}
interface NumOpt {
    type: 'number';
    settingsKey: string;
    min?: number;
    max?: number;
}
interface StrOpt {
    type: 'string';
    settingsKey: string;
    validValues?: string[];
}

type KnownOpt = BoolOpt | NumOpt | StrOpt;

export const KNOWN_SET_OPTIONS: Record<string, KnownOpt> = {
    textobjects: { type: 'boolean', settingsKey: 'enableTextObjects' },
    to: { type: 'boolean', settingsKey: 'enableTextObjects' },
    navigation: { type: 'boolean', settingsKey: 'enableNavigation' },
    nav: { type: 'boolean', settingsKey: 'enableNavigation' },
    hardwrap: { type: 'boolean', settingsKey: 'enableHardWrap' },
    hw: { type: 'boolean', settingsKey: 'enableHardWrap' },
    listcontinuation: {
        type: 'boolean',
        settingsKey: 'listContinuationOnOpen',
    },
    lc: { type: 'boolean', settingsKey: 'listContinuationOnOpen' },
    tablenav: { type: 'boolean', settingsKey: 'enableTableNav' },
    tn: { type: 'boolean', settingsKey: 'enableTableNav' },
    workspacenav: { type: 'boolean', settingsKey: 'enableWorkspaceNav' },
    wn: { type: 'boolean', settingsKey: 'enableWorkspaceNav' },
    easymotion: { type: 'boolean', settingsKey: 'enableEasyMotion' },
    em: { type: 'boolean', settingsKey: 'enableEasyMotion' },
    easymotiondimming: { type: 'boolean', settingsKey: 'easyMotionDimming' },
    emd: { type: 'boolean', settingsKey: 'easyMotionDimming' },
    hintmode: { type: 'boolean', settingsKey: 'enableHintMode' },
    hm: { type: 'boolean', settingsKey: 'enableHintMode' },
    statusbar: { type: 'boolean', settingsKey: 'enableStatusBar' },
    sb: { type: 'boolean', settingsKey: 'enableStatusBar' },
    chorddisplay: { type: 'boolean', settingsKey: 'enableChordDisplay' },
    cd: { type: 'boolean', settingsKey: 'enableChordDisplay' },
    powerline: { type: 'boolean', settingsKey: 'enablePowerline' },
    pl: { type: 'boolean', settingsKey: 'enablePowerline' },
    expandtab: { type: 'boolean', settingsKey: 'expandtab' },
    et: { type: 'boolean', settingsKey: 'expandtab' },
    scrolloff: {
        type: 'number',
        settingsKey: 'scrolloffLines',
        min: 0,
        max: 9999,
    },
    so: { type: 'number', settingsKey: 'scrolloffLines', min: 0, max: 9999 },
    scanlimit: {
        type: 'number',
        settingsKey: 'multilineScanLimit',
        min: 5,
        max: 200,
    },
    sl: { type: 'number', settingsKey: 'multilineScanLimit', min: 5, max: 200 },
    labelfontsize: {
        type: 'number',
        settingsKey: 'labelFontSize',
        min: 10,
        max: 20,
    },
    lfs: { type: 'number', settingsKey: 'labelFontSize', min: 10, max: 20 },
    tabstop: { type: 'number', settingsKey: 'tabstop' },
    ts: { type: 'number', settingsKey: 'tabstop' },
    shiftwidth: { type: 'number', settingsKey: 'shiftwidth' },
    sw: { type: 'number', settingsKey: 'shiftwidth' },
    easymotionlabels: { type: 'string', settingsKey: 'easyMotionLabels' },
    eml: { type: 'string', settingsKey: 'easyMotionLabels' },
    hintlabels: { type: 'string', settingsKey: 'hintModeLabels' },
    hl: { type: 'string', settingsKey: 'hintModeLabels' },
    insertmodeescape: { type: 'string', settingsKey: 'insertmodeescape' },
    ime: { type: 'string', settingsKey: 'insertmodeescape' },
    insertmodeescapetimeout: {
        type: 'number',
        settingsKey: 'insertmodeescapetimeout',
        min: 100,
        max: 5000,
    },
    imet: {
        type: 'number',
        settingsKey: 'insertmodeescapetimeout',
        min: 100,
        max: 5000,
    },
    tablewidget: {
        type: 'string',
        settingsKey: 'tableWidgetMode',
        validValues: ['off', 'cursor', 'always'],
    },
    formattingmarkmode: {
        type: 'string',
        settingsKey: 'formattingMarkMode',
        validValues: ['off', 'cursor'],
    },
    whichkey: {
        type: 'string',
        settingsKey: 'whichKeyMode',
        validValues: ['off', 'leader', 'all'],
    },
    wk: {
        type: 'string',
        settingsKey: 'whichKeyMode',
        validValues: ['off', 'leader', 'all'],
    },
    whichkeygrouping: {
        type: 'string',
        settingsKey: 'whichKeyGrouping',
        validValues: ['flat', 'grouped'],
    },
    wkg: {
        type: 'string',
        settingsKey: 'whichKeyGrouping',
        validValues: ['flat', 'grouped'],
    },
    whichkeydelay: {
        type: 'number',
        settingsKey: 'whichKeyDelay',
        min: 0,
        max: 2000,
    },
    wkd: {
        type: 'number',
        settingsKey: 'whichKeyDelay',
        min: 0,
        max: 2000,
    },
    updatetime: { type: 'number', settingsKey: 'updatetime' },
};

function applyKnownSetOption(
    optName: string,
    optValue: string | boolean | number | undefined,
    vim: VimApi,
    onSettingOverride?: SettingOverrideFn,
): boolean {
    const spec = KNOWN_SET_OPTIONS[optName];
    if (!spec) return false;

    if (spec.type === 'boolean') {
        const enabled = optValue !== false;
        onSettingOverride?.(
            spec.settingsKey,
            enabled,
            `set ${enabled ? '' : 'no'}${optName}`,
        );
        try {
            vim.setOption(optName, enabled);
        } catch {
            /* option may not be registered in fork */
        }
        return true;
    }

    if (spec.type === 'number') {
        const n = typeof optValue === 'number' ? optValue : Number(optValue);
        if (isNaN(n)) return true;
        if (spec.min !== undefined && n < spec.min) return true;
        if (spec.max !== undefined && n > spec.max) return true;
        onSettingOverride?.(spec.settingsKey, n, `set ${optName}=${n}`);
        try {
            vim.setOption(optName, n);
        } catch {
            /* option may not be registered in fork */
        }
        return true;
    }

    const str = typeof optValue === 'string' ? optValue : '';
    if (spec.validValues && !spec.validValues.includes(str)) return true;
    onSettingOverride?.(spec.settingsKey, str, `set ${optName}=${str}`);
    try {
        vim.setOption(optName, str);
    } catch {
        /* option may not be registered in fork */
    }
    return true;
}

/**
 * Fallback chain for vimrc file resolution (first match wins).
 * The `.obsidian.*` variants are last because they rely on a linter
 * workaround (`app.vault.configDir` concatenation) and Obsidian Sync
 * skips dotfiles.
 */
const VIMRC_FALLBACK_PATHS: readonly string[] = [
    'vimrc',
    '.vimrc',
    'init.vim',
    '.init.vim',
    'obsidian.vimrc',
    'obsidian.vim',
];

/**
 * Fallback paths that depend on `app.vault.configDir` (e.g. `.obsidian`).
 * Kept separate because the value is only available at runtime.
 */
function getVimrcFallbackPaths(app: App): readonly string[] {
    const dir = app.vault.configDir;
    return [...VIMRC_FALLBACK_PATHS, `${dir}.vimrc`, `${dir}.vim`];
}

async function resolveVimrcPath(
    app: App,
    customPath?: string,
): Promise<{ path: string; found: boolean }> {
    if (customPath) {
        const exists = await fileExists(app, customPath);
        return { path: customPath, found: exists };
    }
    for (const candidate of getVimrcFallbackPaths(app)) {
        if (await fileExists(app, candidate)) {
            return { path: candidate, found: true };
        }
    }
    // No file found — return the first fallback as the canonical default
    return { path: VIMRC_FALLBACK_PATHS[0]!, found: false };
}

export { VIMRC_FALLBACK_PATHS, getVimrcFallbackPaths, resolveVimrcPath };

async function fileExists(app: App, path: string): Promise<boolean> {
    try {
        await app.vault.adapter.read(path);
        return true;
    } catch {
        return false;
    }
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
    customPath?: string,
): Promise<void> {
    const { path, found } = await resolveVimrcPath(app, customPath);
    if (found) {
        await resolveLeaderFromFile(app, path, leaderRegistry);
    }
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
    globalMaps: DeferredGlobalMap[];
    globalUnmaps: string[];
    globalWhichKeyLabels: Array<{ key: string; label: string }>;
    globalWhichKeyGroups: Array<{ key: string; label: string }>;
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
    onSettingOverride?: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void,
    customPath?: string,
): Promise<VimrcLoadResult> {
    const { path, found } = await resolveVimrcPath(app, customPath);

    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view ? getCmAdapter(view) : null;
    if (!cm) {
        return {
            found,
            ready: false,
            commandCount: 0,
            path,
            maps: [],
            globalMaps: [],
            globalUnmaps: [],
            globalWhichKeyLabels: [],
            globalWhichKeyGroups: [],
        };
    }

    registerVimrcExCommands(vim, app);

    const result = await loadVimrcFile(
        app,
        vim,
        cm,
        path,
        '\\',
        leaderRegistry,
        onSettingOverride,
    );

    return {
        found: found && result.found,
        ready: true,
        commandCount: result.commandCount,
        path,
        maps: result.deferredMaps,
        globalMaps: result.deferredGlobalMaps,
        globalUnmaps: result.globalUnmaps,
        globalWhichKeyLabels: result.globalWhichKeyLabels,
        globalWhichKeyGroups: result.globalWhichKeyGroups,
    };
}

interface DeferredMap {
    lhs: string;
    rhs: string;
    noremap: boolean;
    context?: 'normal' | 'visual' | 'insert';
}

export interface DeferredGlobalMap {
    lhs: string;
    rhs: string;
    noremap: boolean;
}

interface LoadFileResult {
    found: boolean;
    commandCount: number;
    deferredMaps: DeferredMap[];
    deferredGlobalMaps: DeferredGlobalMap[];
    globalUnmaps: string[];
    globalWhichKeyLabels: Array<{ key: string; label: string }>;
    globalWhichKeyGroups: Array<{ key: string; label: string }>;
}

async function loadVimrcFile(
    app: App,
    vim: VimApi,
    cm: CmAdapter,
    path: string,
    leaderKey = '\\',
    leaderRegistry?: LeaderRegistry,
    onSettingOverride?: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void,
): Promise<LoadFileResult> {
    const content = await readVimrcFile(app, path);
    if (content === null) {
        return {
            found: false,
            commandCount: 0,
            deferredMaps: [],
            deferredGlobalMaps: [],
            globalUnmaps: [],
            globalWhichKeyLabels: [],
            globalWhichKeyGroups: [],
        };
    }

    let currentLeader = leaderKey;
    let applied = 0;
    const deferredMaps: DeferredMap[] = [];
    const deferredGlobalMaps: DeferredGlobalMap[] = [];
    const globalUnmaps: string[] = [];
    const globalWhichKeyLabels: Array<{ key: string; label: string }> = [];
    const globalWhichKeyGroups: Array<{ key: string; label: string }> = [];

    vim.defineEx('whichkeygroup', 'whichkeyg', (_cm, params) => {
        if (!params.args?.length || params.args.length < 2) return;
        const key = params.args[0]!.replace(/<leader>/gi, currentLeader);
        const label = params.args.slice(1).join(' ');
        onSettingOverride?.(
            'whichKeyGroupLabel',
            { key, label },
            `whichkeygroup ${key} ${label}`,
        );
    });

    vim.defineEx('whichkeylabel', 'whichkeyl', (_cm, params) => {
        if (!params.args?.length || params.args.length < 2) return;
        const key = params.args[0]!.replace(/<leader>/gi, currentLeader);
        const label = params.args.slice(1).join(' ');
        onSettingOverride?.(
            'whichKeyCommandLabel',
            { key, label },
            `whichkeylabel ${key} ${label}`,
        );
    });

    for (const rawLine of content.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('"')) continue;

        const parsed = parseLine(trimmed);

        if (
            parsed?.type === 'let' &&
            parsed.key?.startsWith('g:mode_prompt_') &&
            typeof parsed.value === 'string'
        ) {
            const mode = parsed.key.replace('g:mode_prompt_', '');
            const VIMRC_MODE_MAP: Record<string, string> = {
                normal: 'normal',
                insert: 'insert',
                visual: 'visual',
                replace: 'replace',
                visual_line: 'visualLine',
                visual_block: 'visualBlock',
                select: 'select',
                vreplace: 'vreplace',
                command: 'command',
                search: 'search',
                insert_normal: 'insertNormal',
            };
            const camelMode = VIMRC_MODE_MAP[mode];
            if (camelMode) {
                onSettingOverride?.(
                    `modePrompts.${camelMode}`,
                    parsed.value,
                    trimmed,
                );
                applied++;
                continue;
            }
        }

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
                onSettingOverride,
            );
            applied += sub.commandCount;
            deferredMaps.push(...sub.deferredMaps);
            deferredGlobalMaps.push(...sub.deferredGlobalMaps);
            globalUnmaps.push(...sub.globalUnmaps);
            globalWhichKeyLabels.push(...sub.globalWhichKeyLabels);
            globalWhichKeyGroups.push(...sub.globalWhichKeyGroups);
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
            applied++;
            continue;
        }

        if (parsed?.type === 'gmap' && parsed.lhs && parsed.rhs) {
            const lhs = parsed.lhs.replace(/<leader>/gi, currentLeader);
            const rhs = parsed.rhs.replace(/<leader>/gi, currentLeader);
            deferredGlobalMaps.push({
                lhs,
                rhs,
                noremap: parsed.noremap ?? false,
            });
            applied++;
            continue;
        }

        if (parsed?.type === 'gunmap' && parsed.lhs) {
            const lhs = parsed.lhs.replace(/<leader>/gi, currentLeader);
            globalUnmaps.push(lhs);
            applied++;
            continue;
        }

        if (parsed?.type === 'gwhichkeylabel' && parsed.lhs && parsed.rhs) {
            const key = parsed.lhs.replace(/<leader>/gi, currentLeader);
            globalWhichKeyLabels.push({ key, label: parsed.rhs });
            applied++;
            continue;
        }

        if (parsed?.type === 'gwhichkeygroup' && parsed.lhs && parsed.rhs) {
            const key = parsed.lhs.replace(/<leader>/gi, currentLeader);
            globalWhichKeyGroups.push({ key, label: parsed.rhs });
            applied++;
            continue;
        }

        if (parsed?.type === 'surroundmap' && parsed.lhs && parsed.rhs) {
            const [open, close] = parsed.rhs.split('\x00');
            if (open && close) {
                if (typeof vim.registerSurroundPair !== 'function') {
                    console.warn(
                        'Vim Motions: surroundmap requires fork mode (disable built-in Vim)',
                    );
                } else {
                    try {
                        vim.registerSurroundPair(parsed.lhs, open, close);
                        applied++;
                    } catch (e) {
                        console.warn(
                            `Vim Motions: surroundmap ${parsed.lhs} error:`,
                            e instanceof Error ? e.message : e,
                        );
                    }
                }
            }
            continue;
        }

        if (parsed?.type === 'surroundunmap' && parsed.lhs) {
            if (typeof vim.unregisterSurroundPair === 'function') {
                vim.unregisterSurroundPair(parsed.lhs);
            }
            applied++;
            continue;
        }

        if (parsed?.type === 'set') {
            let optName = parsed.key ?? '';
            let optValue: string | boolean | number | undefined = parsed.value;

            const isNoPrefix = !optValue && optName.startsWith('no');
            if (isNoPrefix) {
                optName = optName.substring(2);
                optValue = false;
            }

            if (optName === 'textwidth' || optName === 'tw') {
                const tw = Number(optValue);
                if (!isNaN(tw) && tw > 0) {
                    setTextwidth(tw);
                    vim.setOption('textwidth', tw);
                }
                applied++;
                continue;
            }

            if (optName === 'clipboard' || optName === 'clip') {
                const str = typeof optValue === 'string' ? optValue : '';
                setClipboardOption(str);
                vim.setOption('clipboard', str);
                applied++;
                continue;
            }

            if (optName === 'guicursor') {
                const str = typeof optValue === 'string' ? optValue : '';
                const partial = parseGuicursor(str);
                if (Object.keys(partial).length > 0) {
                    onSettingOverride?.(
                        'cursorShapes',
                        partial,
                        `set guicursor=${str}`,
                    );
                }
                applied++;
                continue;
            }

            const handled = applyKnownSetOption(
                optName,
                optValue,
                vim,
                onSettingOverride,
            );
            if (handled) {
                applied++;
                continue;
            }

            try {
                vim.handleEx(cm, processedLine);
            } catch {
                /* intentional: skip unknown set options */
            }
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

    return {
        found: true,
        commandCount: applied,
        deferredMaps,
        deferredGlobalMaps,
        globalUnmaps,
        globalWhichKeyLabels,
        globalWhichKeyGroups,
    };
}
