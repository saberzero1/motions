import { MarkdownView, Notice, type App } from 'obsidian';
import type { CmAdapter } from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import { getCmAdapter } from '../vim/vim-api';
import { utf16ToNeovimByte, type NeovimDocumentSync } from './document-sync';
import type { MsgpackRpcClient } from './msgpack-rpc';

const NOTIFICATION = 'obsidian_action';
const MAPPING_NAMES = new Set([
    'pickerFiles',
    'pickerGrep',
    'pickerBuffers',
    'pickerHeadings',
    'pickerOutline',
    'pickerBacklinks',
    'pickerTags',
    'pickerRecent',
    'pickerMarks',
    'pickerRegisters',
    'pickerResume',
    'harpoonAdd',
    'harpoonRemove',
    'harpoonToggle',
    'harpoonPicker',
    'harpoonNext',
    'harpoonPrevious',
    'harpoonSelect1',
    'harpoonSelect2',
    'harpoonSelect3',
    'harpoonSelect4',
    'harpoonSelect5',
    'harpoonSelect6',
    'harpoonSelect7',
    'harpoonSelect8',
    'harpoonSelect9',
    'jumpListWalk',
    'focusPaneLeft',
    'focusPaneDown',
    'focusPaneUp',
    'focusPaneRight',
    'splitVertical',
    'splitHorizontal',
    'closeTab',
    'closeOtherTabs',
    'nextTab',
    'gt',
    'prevTab',
    'gotoTab',
    'cyclePaneNext',
    'cyclePanePrev',
    'focusPreviousPane',
    'splitAlternateFile',
    'moveToNewTab',
    'gotoDefinition',
    'gotoDefinitionNewTab',
    'gotoDefinitionSplitH',
    'gotoDefinitionSplitV',
    // The overlay itself already works under RPC: it captures on the document
    // in capture phase, ahead of the delegation listener on the editor, and
    // stops propagation. Only the trigger had to cross.
    'hintMode',
]);
const EX_COMMAND_NAMES = new Set([
    'Oil',
    'sidebar',
    'focuspaneleft',
    'focuspanedown',
    'focuspaneup',
    'focuspaneright',
    'splitvertical',
    'splithorizontal',
    'closetab',
    'closeothertabs',
    'nexttab',
    'prevtab',
    'gototab',
    'buffers',
    'ls',
    'files',
    'commands',
    // Reaches commands this allowlist cannot enumerate, including other plugins'.
    'ob',
    'obcommand',
    'headings',
    'outline',
    'tags',
    'recent',
    'resume',
    'livegrep',
    'backlinks',
    'grep',
    'Picker',
    'registers',
    'marks',
    'delmarks',
    'jumps',
    'HarpoonAdd',
    'HarpoonRemove',
    'Harpoon',
    'HarpoonSelect',
    'HarpoonNext',
    'HarpoonPrev',
    'UndoTreeToggle',
    'UndoTreeShow',
    'UndoTreeHide',
    'hintactivate',
    'hintopennew',
    'hintyank',
    'hintclose',
    'hintcontextmenu',
    // Its edit reaches Neovim like any host edit (src/rpc/host-edits.ts).
    'image',
]);

// Shown by `:map`, `:command`, and any which-key plugin the user runs, so it
// reads as a label rather than an internal id. The prefix is what identifies
// a generated entry.
const DESC_PREFIX = 'Vim Motions: ';

const ACTION_LABELS: Record<string, string> = {
    ob: 'Run an Obsidian command',
    obcommand: 'Run an Obsidian command',
    hintMode: 'Hints: activate',
    hintactivate: 'Hints: activate',
    hintopennew: 'Hints: open in a new tab',
    hintyank: 'Hints: yank a link',
    hintclose: 'Hints: close a tab',
    hintcontextmenu: 'Hints: open the context menu',
    gt: 'Go to tab by count',
    gototab: 'Go to tab by number',
    ls: 'List buffers',
    Picker: 'Open a named picker source',
    Oil: 'Open the Oil file explorer',
    jumpListWalk: 'Walk the cross-note jump list',
};

const LEADER_GROUP_LABELS: Record<string, string> = {
    f: '+find',
    h: '+harpoon',
};

/**
 * Prefixes of the installed leader bindings, so a which-key plugin renders
 * them as groups instead of a flat list. Nothing executes these: Neovim
 * resolves the longer mapping, and the stub exists only for its description.
 *
 * The leader itself is excluded deliberately. Mapping it would turn it into a
 * complete binding and break every leader sequence.
 */
export function leaderGroupPrefixes(
    keys: readonly string[],
    leader: string,
): string[] {
    if (!leader) return [];
    const prefixes = new Set<string>();
    for (const key of keys) {
        if (!key.startsWith(leader)) continue;
        for (let length = leader.length + 1; length < key.length; length += 1) {
            prefixes.add(key.slice(0, length));
        }
    }
    return [...prefixes].sort();
}

export function leaderGroupLabel(prefix: string, leader: string): string {
    const suffix = prefix.slice(leader.length);
    return LEADER_GROUP_LABELS[suffix] ?? (suffix === leader ? '+more' : '+…');
}

export function bridgeActionLabel(name: string): string {
    const explicit = ACTION_LABELS[name];
    if (explicit) return explicit;
    const words = name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .split(' ');
    const [first = '', ...rest] = words;
    return [
        first.charAt(0).toUpperCase() + first.slice(1),
        ...rest.map((word) => word.toLowerCase()),
    ].join(' ');
}
const CURSOR_NAV_MAPPING_NAMES = new Set([
    'harpoonNext',
    'harpoonPrevious',
    'harpoonSelect1',
    'harpoonSelect2',
    'harpoonSelect3',
    'harpoonSelect4',
    'harpoonSelect5',
    'harpoonSelect6',
    'harpoonSelect7',
    'harpoonSelect8',
    'harpoonSelect9',
    'jumpListWalk',
]);
const CURSOR_NAV_COMMAND_NAMES = new Set([
    'HarpoonSelect',
    'HarpoonNext',
    'HarpoonPrev',
]);

interface DispatchPayload {
    args?: unknown;
    count?: unknown;
}

export interface HostNavigationTarget {
    filePath: string;
    line: number;
    ch: number;
}

type BridgeAction =
    | {
          id: string;
          kind: 'mapping';
          name: string;
          keys: string;
          mode: string;
          run: ActionRun;
      }
    | {
          id: string;
          kind: 'command';
          name: string;
          run: ActionRun;
      };

/**
 * `started` opens the next action's turn; it is called once the action itself
 * has run, so only the cursor settling that follows overlaps the next one.
 */
type ActionRun = (
    payload: DispatchPayload,
    started: () => void,
) => Promise<void>;

interface ActiveEditor {
    view: MarkdownView;
    cm: CmAdapter;
}

type NotificationPayload = DispatchPayload & { id?: unknown };

function neovimMode(context: string | undefined): string {
    switch (context) {
        case 'insert':
            return 'i';
        case 'visual':
            return 'x';
        case 'select':
            return 's';
        case 'operatorPending':
            return 'o';
        default:
            return 'n';
    }
}

function uppercaseCommand(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

export class NeovimObsidianFeatureBridge {
    private actions = new Map<string, BridgeAction>();
    private cleanupNotification: (() => void) | null = null;
    private installedMappings: Array<{ mode: string; keys: string }> = [];
    private installedCommands: string[] = [];
    private installedAbbreviations: string[] = [];
    private turn: Promise<void> = Promise.resolve();

    constructor(
        private readonly app: App,
        private readonly rpc: MsgpackRpcClient,
        private readonly documentSync: NeovimDocumentSync,
        private readonly getRegistration: () => VimRegistration | null,
        private readonly channelId: number,
        private readonly getNavigationTarget: (
            actionName: string,
        ) => HostNavigationTarget | null,
        private readonly getLeaderKey: () => string,
    ) {}

    async start(): Promise<void> {
        await this.stop();
        const registration = this.getRegistration();
        if (!registration) return;
        const actions = this.buildActions(registration);
        this.actions = new Map(actions.map((action) => [action.id, action]));
        this.cleanupNotification = this.rpc.onNotification(
            NOTIFICATION,
            (args) => this.onNotification(args),
        );
        try {
            for (const action of actions) await this.install(action);
            await this.installLeaderGroups();
        } catch (error) {
            await this.stop();
            throw error;
        }
    }

    private async installLeaderGroups(): Promise<void> {
        const leader = this.getLeaderKey();
        const prefixes = leaderGroupPrefixes(
            this.installedMappings
                .filter((mapping) => mapping.mode === 'n')
                .map((mapping) => mapping.keys),
            leader,
        );
        for (const prefix of prefixes) {
            await this.rpc.request('nvim_exec_lua', [
                "local lhs, desc = ...; vim.keymap.set('n', lhs, '<Nop>', { desc = desc })",
                [prefix, leaderGroupLabel(prefix, leader)],
            ]);
            this.installedMappings.push({ mode: 'n', keys: prefix });
        }
    }

    async stop(): Promise<void> {
        const cleanupNotification = this.cleanupNotification;
        this.cleanupNotification = null;
        const mappings = this.installedMappings;
        const commands = this.installedCommands;
        const abbreviations = this.installedAbbreviations;
        this.installedMappings = [];
        this.installedCommands = [];
        this.installedAbbreviations = [];
        this.actions.clear();
        cleanupNotification?.();
        await Promise.all([
            ...mappings.map(({ mode, keys }) =>
                this.rpc
                    .request('nvim_del_keymap', [mode, keys])
                    .catch(() => {}),
            ),
            ...commands.map((name) =>
                this.rpc
                    .request('nvim_del_user_command', [name])
                    .catch(() => {}),
            ),
            ...abbreviations.map((name) =>
                this.rpc
                    .request('nvim_command', [`silent! cunabbrev ${name}`])
                    .catch(() => {}),
            ),
        ]);
    }

    private buildActions(registration: VimRegistration): BridgeAction[] {
        const actions: BridgeAction[] = [];
        for (const mapping of registration.getMapCommands(MAPPING_NAMES)) {
            if (
                mapping.name === 'jumpListWalk' &&
                mapping.keys !== '<C-o>' &&
                mapping.keys !== '<C-i>'
            )
                continue;
            const id =
                mapping.name === 'jumpListWalk'
                    ? `mapping:${mapping.name}:${mapping.keys}`
                    : `mapping:${mapping.name}`;
            const run: ActionRun = async (payload, started) => {
                const editor = await this.resolveActiveEditor();
                if (!editor) return;
                const { view, cm } = editor;
                const initialFile = view.file?.path ?? null;
                const initialCursor = cm.getCursor();
                const count =
                    typeof payload.count === 'number' && payload.count > 0
                        ? payload.count
                        : 1;
                const actionArgs = {
                    ...mapping.args,
                    repeat: count,
                    repeatIsExplicit:
                        typeof payload.count === 'number' && payload.count > 0,
                };
                if (mapping.actionFn) {
                    const navigates = CURSOR_NAV_MAPPING_NAMES.has(
                        mapping.name,
                    );
                    // Held from before the action, so no cursor copy from
                    // Neovim can land between the action's own write into
                    // CodeMirror and the restore that brings Neovim level.
                    const release = navigates
                        ? this.documentSync.holdHostCursor()
                        : null;
                    try {
                        mapping.actionFn(cm, actionArgs, cm.state.vim ?? {});
                        started();
                        if (navigates) {
                            await this.syncHostCursorAfterNavigation(
                                initialFile,
                                initialCursor,
                                mapping.name,
                                release ?? undefined,
                            );
                        }
                    } finally {
                        release?.();
                    }
                    return;
                }
                if (!mapping.motionFn) return;
                const head = cm.getCursor();
                const pending = mapping.motionFn(
                    cm,
                    head,
                    actionArgs,
                    cm.state.vim ?? {},
                    null,
                );
                // Before the await, so an asynchronous motion cannot hold up
                // every bridged action behind it.
                started();
                const result = await pending;
                const target = Array.isArray(result) ? result[1] : result;
                if (!target) return;
                const line = cm.getLine(target.line);
                const cursor: [number, number] = [
                    target.line + 1,
                    utf16ToNeovimByte(line, target.ch),
                ];
                await this.rpc.request('nvim_win_set_cursor', [0, cursor]);
                this.documentSync.syncCursor(cursor[0], cursor[1]);
            };
            actions.push({
                id,
                kind: 'mapping',
                name: mapping.name,
                keys: mapping.keys,
                mode: neovimMode(mapping.context),
                run,
            });
        }
        for (const command of registration.getExCommands(EX_COMMAND_NAMES)) {
            const id = `command:${command.name}`;
            actions.push({
                id,
                kind: 'command',
                name: command.name,
                run: async (payload, started) => {
                    const editor = await this.resolveActiveEditor();
                    if (!editor) return;
                    const { view, cm } = editor;
                    const initialFile = view.file?.path ?? null;
                    const initialCursor = cm.getCursor();
                    const args =
                        typeof payload.args === 'string' ? payload.args : '';
                    const navigates = CURSOR_NAV_COMMAND_NAMES.has(
                        command.name,
                    );
                    const release = navigates
                        ? this.documentSync.holdHostCursor()
                        : null;
                    try {
                        command.fn(cm, {
                            args: args ? args.split(/\s+/) : [],
                            argString: args,
                            commandName: command.name,
                            input: `${command.name}${args ? ` ${args}` : ''}`,
                        });
                        started();
                        if (navigates) {
                            await this.syncHostCursorAfterNavigation(
                                initialFile,
                                initialCursor,
                                command.name,
                                release ?? undefined,
                            );
                        }
                    } finally {
                        release?.();
                    }
                },
            });
        }
        return actions;
    }

    /**
     * The active Markdown editor, once its pane can take an action. A split
     * activates its new pane before the note in it has loaded — Obsidian
     * defers the load — so the second half of `<C-w>v<C-w>h` found no editor
     * and was dropped, leaving focus in the new pane. Only a pane that is
     * still loading is waited for, and not past the cursor sync's 1.5 s.
     */
    private async resolveActiveEditor(): Promise<ActiveEditor | null> {
        for (let attempt = 0; attempt < 60; attempt++) {
            const leaf = this.app.workspace.getMostRecentLeaf();
            if (!leaf?.working && !leaf?.isDeferred) {
                const view =
                    this.app.workspace.getActiveViewOfType(MarkdownView);
                const cm = view ? getCmAdapter(view) : null;
                return view && cm ? { view, cm } : null;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 25));
        }
        return null;
    }

    private async syncHostCursorAfterNavigation(
        initialFile: string | null,
        initialCursor: { line: number; ch: number },
        actionName: string,
        releaseHostCursor?: () => void,
    ): Promise<void> {
        for (let attempt = 0; attempt < 60; attempt++) {
            await new Promise((resolve) => window.setTimeout(resolve, 25));
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) continue;
            const cursor = view.editor.getCursor();
            if (
                view.file?.path === initialFile &&
                cursor.line === initialCursor.line &&
                cursor.ch === initialCursor.ch
            ) {
                // Nothing moved within 300 ms, such as <C-o> with no older
                // entry: stop holding the cursor, so keys typed meanwhile
                // keep moving it, rather than stalling for the loop's 1.5 s.
                if (attempt === 11) releaseHostCursor?.();
                continue;
            }
            await this.documentSync.waitForActivation();
            await new Promise((resolve) => window.setTimeout(resolve, 25));
            const currentView =
                this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!currentView) return;
            const current =
                this.getNavigationTarget(actionName) ??
                currentView.editor.getCursor();
            if (
                'filePath' in current &&
                currentView.file?.path !== current.filePath
            )
                continue;
            const lineNumber = Math.min(
                current.line,
                currentView.editor.lineCount() - 1,
            );
            const currentLine = currentView.editor.getLine(lineNumber);
            const column = Math.min(current.ch, currentLine.length);
            currentView.editor.setCursor(lineNumber, column);
            const neovimCursor: [number, number] = [
                lineNumber + 1,
                utf16ToNeovimByte(currentLine, column),
            ];
            await this.rpc.request('nvim_win_set_cursor', [0, neovimCursor]);
            this.documentSync.syncCursor(neovimCursor[0], neovimCursor[1]);
            return;
        }
    }

    private async install(action: BridgeAction): Promise<void> {
        if (action.kind === 'mapping') {
            await this.rpc.request('nvim_exec_lua', [
                "local mode, lhs, chan, id, desc = ...; vim.keymap.set(mode, lhs, function() vim.rpcnotify(chan, 'obsidian_action', { id = id, count = vim.v.count }) end, { noremap = true, silent = true, desc = desc })",
                [
                    action.mode,
                    action.keys,
                    this.channelId,
                    action.id,
                    DESC_PREFIX + bridgeActionLabel(action.name),
                ],
            ]);
            this.installedMappings.push({
                mode: action.mode,
                keys: action.keys,
            });
            return;
        }
        const commandName = uppercaseCommand(action.name);
        await this.rpc.request('nvim_exec_lua', [
            "local name, chan, id, desc = ...; vim.api.nvim_create_user_command(name, function(opts) vim.rpcnotify(chan, 'obsidian_action', { id = id, args = opts.args }) end, { nargs = '*', desc = desc })",
            [
                commandName,
                this.channelId,
                action.id,
                DESC_PREFIX + bridgeActionLabel(action.name),
            ],
        ]);
        this.installedCommands.push(commandName);
        if (commandName === action.name) return;
        const position = action.name.length + 1;
        await this.rpc.request('nvim_command', [
            `cnoreabbrev <expr> ${action.name} getcmdtype() ==# ':' && getcmdpos() == ${position} ? '${commandName}' : '${action.name}'`,
        ]);
        this.installedAbbreviations.push(action.name);
    }

    private onNotification(args: unknown[]): void {
        const payload = args[0] as NotificationPayload | undefined;
        const id = payload?.id;
        if (typeof id !== 'string') return;
        const action = this.actions.get(id);
        if (!action) return;
        // Actions start in the order Neovim sent them: one that waits for a
        // loading pane must not be overtaken by the keys typed after it.
        const previous = this.turn;
        let started!: () => void;
        this.turn = new Promise((resolve) => (started = resolve));
        void previous
            .then(() => action.run(payload ?? {}, started))
            .catch((error: unknown) => {
                const message =
                    error instanceof Error ? error.message : String(error);
                new Notice(`Vim Motions: Obsidian action failed: ${message}`);
            })
            .finally(started);
    }
}
