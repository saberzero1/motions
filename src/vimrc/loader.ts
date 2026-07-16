import { MarkdownView, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { VimApi, CmAdapter } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { getCmAdapter } from '../vim/vim-api';
import {
    setTextwidth,
    setClipboardOption,
    parseGuicursor,
} from '../vim/options';
import { parseLine, parseVimrc } from './parser';
import type { VimrcCommand } from './parser';
import {
    isAbsolutePath,
    readExternalFile,
    externalFileExists,
} from '../util/external-fs';

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

interface SideEffectOpt {
    type: 'sideEffect';
    apply: (
        value: unknown,
        onSettingOverride: SettingOverrideFn | undefined,
        directive: string,
    ) => void;
}

type KnownOpt = BoolOpt | NumOpt | StrOpt | SideEffectOpt;

export const KNOWN_SET_OPTIONS: Record<string, KnownOpt> = {
    textobjects: { type: 'boolean', settingsKey: 'enableTextObjects' },
    to: { type: 'boolean', settingsKey: 'enableTextObjects' },
    navigation: { type: 'boolean', settingsKey: 'enableNavigation' },
    nav: { type: 'boolean', settingsKey: 'enableNavigation' },
    hardwrap: { type: 'boolean', settingsKey: 'enableHardWrap' },
    hw: { type: 'boolean', settingsKey: 'enableHardWrap' },
    replacewithregister: {
        type: 'boolean',
        settingsKey: 'enableReplaceWithRegister',
    },
    rwr: { type: 'boolean', settingsKey: 'enableReplaceWithRegister' },
    listcontinuation: {
        type: 'boolean',
        settingsKey: 'listContinuationOnOpen',
    },
    lc: { type: 'boolean', settingsKey: 'listContinuationOnOpen' },
    tablenav: { type: 'boolean', settingsKey: 'enableTableNav' },
    tn: { type: 'boolean', settingsKey: 'enableTableNav' },
    workspacenav: { type: 'boolean', settingsKey: 'enableWorkspaceNav' },
    wn: { type: 'boolean', settingsKey: 'enableWorkspaceNav' },
    workspacenavviewtypes: {
        type: 'string',
        settingsKey: 'workspaceNavViewTypes',
    },
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
        validValues: ['off', 'cursor', 'always', 'embedded'],
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
    whichkeysort: {
        type: 'string',
        settingsKey: 'whichKeySortOrder',
        validValues: ['which-key', 'groups-first'],
    },
    wks: {
        type: 'string',
        settingsKey: 'whichKeySortOrder',
        validValues: ['which-key', 'groups-first'],
    },
    whichkeyicons: { type: 'boolean', settingsKey: 'whichKeyIcons' },
    wki: { type: 'boolean', settingsKey: 'whichKeyIcons' },
    updatetime: { type: 'number', settingsKey: 'updatetime' },
    number: { type: 'boolean', settingsKey: 'number' },
    nu: { type: 'boolean', settingsKey: 'number' },
    relativenumber: { type: 'boolean', settingsKey: 'relativenumber' },
    rnu: { type: 'boolean', settingsKey: 'relativenumber' },
    numberwidth: {
        type: 'number',
        settingsKey: 'numberwidth',
        min: 1,
        max: 20,
    },
    nuw: { type: 'number', settingsKey: 'numberwidth', min: 1, max: 20 },
    linenumbermode: {
        type: 'string',
        settingsKey: 'linenumbermode',
        validValues: ['hybrid', 'dual', 'dual-rel-abs'],
    },
    lnm: {
        type: 'string',
        settingsKey: 'linenumbermode',
        validValues: ['hybrid', 'dual', 'dual-rel-abs'],
    },
    cursorline: { type: 'boolean', settingsKey: 'cursorline' },
    cul: { type: 'boolean', settingsKey: 'cursorline' },
    cursorlineopt: {
        type: 'string',
        settingsKey: 'cursorlineopt',
        validValues: ['number', 'line', 'both'],
    },
    culopt: {
        type: 'string',
        settingsKey: 'cursorlineopt',
        validValues: ['number', 'line', 'both'],
    },
    signcolumn: {
        type: 'string',
        settingsKey: 'signcolumn',
    },
    scl: {
        type: 'string',
        settingsKey: 'signcolumn',
    },
    markgutter: {
        type: 'sideEffect',
        apply: (value, onSettingOverride, directive) => {
            const mode = value !== false ? 'auto' : 'no';
            onSettingOverride?.('signcolumn', mode, directive);
        },
    },
    statuscolumn: { type: 'string', settingsKey: 'statuscolumn' },
    stc: { type: 'string', settingsKey: 'statuscolumn' },
    foldcolumn: { type: 'boolean', settingsKey: 'foldcolumn' },
    fdc: { type: 'boolean', settingsKey: 'foldcolumn' },
    snippets: { type: 'boolean', settingsKey: 'enableSnippets' },
    snippetbundled: { type: 'boolean', settingsKey: 'snippetBundled' },
    snippetdir: { type: 'string', settingsKey: 'snippetDirectory' },
    snippettrigger: {
        type: 'string',
        settingsKey: 'snippetTriggerMode',
        validValues: ['completion', 'tab', 'both'],
    },
    vimtextareas: { type: 'boolean', settingsKey: 'enableVimTextareas' },
    vta: { type: 'boolean', settingsKey: 'enableVimTextareas' },
};

const clipboardOpt: SideEffectOpt = {
    type: 'sideEffect',
    apply: (value, onSettingOverride, directive) => {
        const str = typeof value === 'string' ? value : '';
        setClipboardOption(str);
        onSettingOverride?.('clipboard', str, directive);
    },
};
const textwidthOpt: SideEffectOpt = {
    type: 'sideEffect',
    apply: (value, onSettingOverride, directive) => {
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n > 0) {
            setTextwidth(n);
            onSettingOverride?.('textwidth', n, directive);
        }
    },
};
const guicursorOpt: SideEffectOpt = {
    type: 'sideEffect',
    apply: (value, onSettingOverride, directive) => {
        const str = typeof value === 'string' ? value : '';
        const partial = parseGuicursor(str);
        if (Object.keys(partial).length > 0) {
            onSettingOverride?.('cursorShapes', partial, directive);
        }
    },
};

KNOWN_SET_OPTIONS['clipboard'] = clipboardOpt;
KNOWN_SET_OPTIONS['clip'] = clipboardOpt;
KNOWN_SET_OPTIONS['textwidth'] = textwidthOpt;
KNOWN_SET_OPTIONS['tw'] = textwidthOpt;
KNOWN_SET_OPTIONS['guicursor'] = guicursorOpt;

function applyKnownSetOption(
    optName: string,
    optValue: string | boolean | number | undefined,
    vim: VimApi,
    onSettingOverride?: SettingOverrideFn,
): boolean {
    const spec = KNOWN_SET_OPTIONS[optName];
    if (!spec) return false;

    if (spec.type === 'sideEffect') {
        spec.apply(
            optValue,
            (sKey, sValue, sDirective) => {
                onSettingOverride?.(sKey, sValue, sDirective);
                try {
                    vim.setOption(optName, sValue);
                } catch {
                    return;
                }
            },
            `set ${optName}=${String(optValue ?? '')}`,
        );
        return true;
    }

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
    if (isAbsolutePath(path)) {
        return externalFileExists(path);
    }
    try {
        const stat = await app.vault.adapter.stat(path);
        return stat !== null;
    } catch {
        return false;
    }
}

async function readVimrcFile(app: App, path: string): Promise<string | null> {
    if (isAbsolutePath(path)) {
        return readExternalFile(path);
    }

    // Readiness probe: verify file exists in vault index before reading
    let stat: { size: number } | null = null;
    try {
        stat = await app.vault.adapter.stat(path);
    } catch {
        // stat() failed — vault adapter not ready or file doesn't exist
    }
    if (!stat) return null;

    try {
        const content = await app.vault.adapter.read(path);
        if (content !== null && content.trim().length > 0) {
            return content;
        }

        // File exists (stat succeeded) but read returned empty — timing issue.
        if (stat.size === 0) {
            // File is genuinely empty — no retry needed
            return content;
        }

        // File has content (stat.size > 0) but read returned empty — retry
        const delays = [50, 100, 200, 400];
        for (const delay of delays) {
            await new Promise((r) => window.setTimeout(r, delay));
            const retry = await app.vault.adapter.read(path);
            if (retry !== null && retry.trim().length > 0) {
                return retry;
            }
        }

        // All retries exhausted on a non-empty file
        console.warn(
            `Vim Motions: vimrc file "${path}" has ${stat.size} bytes but read returned empty after retries`,
        );
        new Notice(
            'Vim Motions: vimrc found but could not be read — try reloading the plugin.',
        );
        return content;
    } catch (e) {
        console.warn(`Vim Motions: failed to read vimrc "${path}"`, e);
        return null;
    }
}

export function registerVimrcExCommands(vim: VimApi): void {
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
    globalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    globalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    pendingExCommands: string[];
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

export interface ParsedVimrcResult {
    found: boolean;
    commands: VimrcCommand[];
    path: string;
}

export async function readAndParseVimrcFile(
    app: App,
    path: string,
): Promise<ParsedVimrcResult> {
    const content = await readVimrcFile(app, path);
    if (content === null) {
        return { found: false, commands: [], path };
    }
    const rawCommands = parseVimrc(content);
    const commands: VimrcCommand[] = [];
    for (const cmd of rawCommands) {
        if (cmd.type === 'source' && cmd.path) {
            const sub = await readAndParseVimrcFile(app, cmd.path);
            commands.push(...sub.commands);
            continue;
        }
        commands.push(cmd);
    }
    return { found: true, commands, path };
}

interface ApplyResult {
    commandCount: number;
    deferredMaps: DeferredMap[];
    deferredGlobalMaps: DeferredGlobalMap[];
    globalUnmaps: string[];
    globalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    globalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    pendingExCommands: string[];
}

export function applyVimrcCommands(
    commands: VimrcCommand[],
    vim: VimApi,
    cm: CmAdapter | null,
    leaderKey: string,
    leaderRegistry?: LeaderRegistry,
    onSettingOverride?: SettingOverrideFn,
): ApplyResult {
    let currentLeader = leaderKey;
    let applied = 0;
    const deferredMaps: DeferredMap[] = [];
    const deferredGlobalMaps: DeferredGlobalMap[] = [];
    const globalUnmaps: string[] = [];
    const globalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    const globalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    const pendingExCommands: string[] = [];

    vim.defineEx('whichkeygroup', 'whichkeyg', (_cm, params) => {
        if (!params.args?.length || params.args.length < 2) return;
        const key = params.args[0]!.replace(/<leader>/gi, currentLeader);
        const { label, icon, color } = extractIconColorFromArgs(
            params.args.slice(1),
        );
        if (!label) return;
        onSettingOverride?.(
            'whichKeyGroupLabel',
            { key, label, icon, color },
            `whichkeygroup ${key} ${params.args.slice(1).join(' ')}`,
        );
    });

    vim.defineEx('whichkeylabel', 'whichkeyl', (_cm, params) => {
        if (!params.args?.length || params.args.length < 2) return;
        const key = params.args[0]!.replace(/<leader>/gi, currentLeader);
        const { label, icon, color } = extractIconColorFromArgs(
            params.args.slice(1),
        );
        if (!label) return;
        onSettingOverride?.(
            'whichKeyCommandLabel',
            { key, label, icon, color },
            `whichkeylabel ${key} ${params.args.slice(1).join(' ')}`,
        );
    });

    for (const parsed of commands) {
        const processedLine = parsed.raw.replace(/<leader>/gi, currentLeader);

        if (
            parsed.type === 'let' &&
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
                    parsed.raw,
                );
                applied++;
                continue;
            }
        }

        if (
            parsed.type === 'let' &&
            parsed.key === 'mapleader' &&
            parsed.value
        ) {
            currentLeader = parsed.value;
            if (leaderRegistry) leaderRegistry.setLeaderKey(currentLeader);
            applied++;
            continue;
        }

        if (parsed.type === 'map' && parsed.lhs && parsed.rhs) {
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

        if (parsed.type === 'unmap' && parsed.lhs) {
            const lhs = parsed.lhs.replace(/<leader>/gi, currentLeader);
            if (cm) {
                try {
                    vim.unmap(lhs, parsed.context);
                } catch {
                    /* skip */
                }
            } else {
                pendingExCommands.push(processedLine);
            }
            applied++;
            continue;
        }

        if (parsed.type === 'gmap' && parsed.lhs && parsed.rhs) {
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

        if (parsed.type === 'gunmap' && parsed.lhs) {
            const lhs = parsed.lhs.replace(/<leader>/gi, currentLeader);
            globalUnmaps.push(lhs);
            applied++;
            continue;
        }

        if (parsed.type === 'gwhichkeylabel' && parsed.lhs && parsed.rhs) {
            const key = parsed.lhs.replace(/<leader>/gi, currentLeader);
            globalWhichKeyLabels.push({
                key,
                label: parsed.rhs,
                icon: parsed.icon,
                color: parsed.color,
            });
            applied++;
            continue;
        }

        if (parsed.type === 'gwhichkeygroup' && parsed.lhs && parsed.rhs) {
            const key = parsed.lhs.replace(/<leader>/gi, currentLeader);
            globalWhichKeyGroups.push({
                key,
                label: parsed.rhs,
                icon: parsed.icon,
                color: parsed.color,
            });
            applied++;
            continue;
        }

        if (parsed.type === 'surroundmap' && parsed.lhs && parsed.rhs) {
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

        if (parsed.type === 'surroundunmap' && parsed.lhs) {
            if (typeof vim.unregisterSurroundPair === 'function') {
                vim.unregisterSurroundPair(parsed.lhs);
            }
            applied++;
            continue;
        }

        if (parsed.type === 'set') {
            let optName = parsed.key ?? '';
            let optValue: string | boolean | number | undefined = parsed.value;
            const isNoPrefix = !optValue && optName.startsWith('no');
            if (isNoPrefix) {
                optName = optName.substring(2);
                optValue = false;
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
            if (cm) {
                try {
                    vim.handleEx(cm, processedLine);
                } catch {
                    /* skip unknown set options */
                }
            } else {
                pendingExCommands.push(processedLine);
            }
            applied++;
            continue;
        }

        // exmap: does NOT need cm — only calls vim.defineEx (global)
        if (parsed.type === 'exmap' && parsed.name && parsed.args) {
            const exName = parsed.name;
            const exArgs = parsed.args;
            vim.defineEx(exName, '', (cm2) => {
                vim.handleEx(cm2, exArgs);
            });
            applied++;
            continue;
        }

        // obcommand: standalone lines go through handleEx which structurally needs cm
        if (parsed.type === 'obcommand' && parsed.args) {
            if (cm) {
                try {
                    vim.handleEx(cm, processedLine);
                } catch {
                    /* skip */
                }
            } else {
                pendingExCommands.push(processedLine);
            }
            applied++;
            continue;
        }

        // source: already flattened by readAndParseVimrcFile — defensive skip
        if (parsed.type === 'source') {
            continue;
        }

        // unknown: catch-all, needs cm
        if (cm) {
            try {
                vim.handleEx(cm, processedLine);
                applied++;
            } catch {
                /* skip malformed vimrc lines */
            }
        } else {
            pendingExCommands.push(processedLine);
            applied++;
        }
    }

    return {
        commandCount: applied,
        deferredMaps,
        deferredGlobalMaps,
        globalUnmaps,
        globalWhichKeyLabels,
        globalWhichKeyGroups,
        pendingExCommands,
    };
}

export function applyPendingExCommands(
    vim: VimApi,
    cm: CmAdapter,
    commands: string[],
): void {
    for (const cmd of commands) {
        try {
            vim.handleEx(cm, cmd);
        } catch {
            /* skip malformed deferred commands */
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
    const { path } = await resolveVimrcPath(app, customPath);

    const parsed = await readAndParseVimrcFile(app, path);
    if (!parsed.found) {
        return {
            found: false,
            ready: true,
            commandCount: 0,
            path,
            maps: [],
            globalMaps: [],
            globalUnmaps: [],
            globalWhichKeyLabels: [],
            globalWhichKeyGroups: [],
            pendingExCommands: [],
        };
    }

    registerVimrcExCommands(vim);

    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view ? getCmAdapter(view) : null;
    const leaderKey = leaderRegistry?.getLeaderKey() ?? '\\';

    const result = applyVimrcCommands(
        parsed.commands,
        vim,
        cm,
        leaderKey,
        leaderRegistry,
        onSettingOverride,
    );

    return {
        found: true,
        ready: true,
        commandCount: result.commandCount,
        path,
        maps: result.deferredMaps,
        globalMaps: result.deferredGlobalMaps,
        globalUnmaps: result.globalUnmaps,
        globalWhichKeyLabels: result.globalWhichKeyLabels,
        globalWhichKeyGroups: result.globalWhichKeyGroups,
        pendingExCommands: result.pendingExCommands,
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

function extractIconColorFromArgs(args: string[]): {
    label: string;
    icon?: string;
    color?: string;
} {
    let icon: string | undefined;
    let color: string | undefined;
    let end = args.length;
    while (end > 0) {
        const token = args[end - 1];
        if (token?.startsWith('icon=')) {
            icon = token.slice('icon='.length);
            end -= 1;
            continue;
        }
        if (token?.startsWith('color=')) {
            color = token.slice('color='.length);
            end -= 1;
            continue;
        }
        break;
    }
    const label = args.slice(0, end).join(' ');
    return { label, icon, color };
}
