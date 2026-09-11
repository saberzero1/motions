import { MarkdownView, Notice, type App } from 'obsidian';
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
]);
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
          keys: string;
          mode: string;
          run: (payload: DispatchPayload) => Promise<void>;
      }
    | {
          id: string;
          kind: 'command';
          name: string;
          run: (payload: DispatchPayload) => Promise<void>;
      };

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

    constructor(
        private readonly app: App,
        private readonly rpc: MsgpackRpcClient,
        private readonly documentSync: NeovimDocumentSync,
        private readonly getRegistration: () => VimRegistration | null,
        private readonly channelId: number,
        private readonly getNavigationTarget: (
            actionName: string,
        ) => HostNavigationTarget | null,
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
        } catch (error) {
            await this.stop();
            throw error;
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
            const run = async (payload: DispatchPayload): Promise<void> => {
                const view =
                    this.app.workspace.getActiveViewOfType(MarkdownView);
                const cm = view ? getCmAdapter(view) : null;
                if (!cm) return;
                const initialFile = view?.file?.path ?? null;
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
                    mapping.actionFn(cm, actionArgs, cm.state.vim ?? {});
                    if (CURSOR_NAV_MAPPING_NAMES.has(mapping.name)) {
                        await this.syncHostCursorAfterNavigation(
                            initialFile,
                            initialCursor,
                            mapping.name,
                        );
                    }
                    return;
                }
                if (!mapping.motionFn) return;
                const head = cm.getCursor();
                const result = await mapping.motionFn(
                    cm,
                    head,
                    actionArgs,
                    cm.state.vim ?? {},
                    null,
                );
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
                run: async (payload: DispatchPayload) => {
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    const cm = view ? getCmAdapter(view) : null;
                    if (!cm) return;
                    const initialFile = view?.file?.path ?? null;
                    const initialCursor = cm.getCursor();
                    const args =
                        typeof payload.args === 'string' ? payload.args : '';
                    command.fn(cm, {
                        args: args ? args.split(/\s+/) : [],
                        argString: args,
                        commandName: command.name,
                        input: `${command.name}${args ? ` ${args}` : ''}`,
                    });
                    if (CURSOR_NAV_COMMAND_NAMES.has(command.name)) {
                        await this.syncHostCursorAfterNavigation(
                            initialFile,
                            initialCursor,
                            command.name,
                        );
                    }
                },
            });
        }
        return actions;
    }

    private async syncHostCursorAfterNavigation(
        initialFile: string | null,
        initialCursor: { line: number; ch: number },
        actionName: string,
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
            )
                continue;
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
                "local mode, lhs, chan, id = ...; vim.keymap.set(mode, lhs, function() vim.rpcnotify(chan, 'obsidian_action', { id = id, count = vim.v.count }) end, { noremap = true, silent = true, desc = 'vim-motions-rpc:' .. id })",
                [action.mode, action.keys, this.channelId, action.id],
            ]);
            this.installedMappings.push({
                mode: action.mode,
                keys: action.keys,
            });
            return;
        }
        const commandName = uppercaseCommand(action.name);
        await this.rpc.request('nvim_exec_lua', [
            "local name, chan, id = ...; vim.api.nvim_create_user_command(name, function(opts) vim.rpcnotify(chan, 'obsidian_action', { id = id, args = opts.args }) end, { nargs = '*', desc = 'vim-motions-rpc:' .. id })",
            [commandName, this.channelId, action.id],
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
        void action.run(payload ?? {}).catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : String(error);
            new Notice(`Vim Motions: Obsidian action failed: ${message}`);
        });
    }
}
