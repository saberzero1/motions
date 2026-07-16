import { App, Notice, SuggestModal } from 'obsidian';
import { executeCommand } from '../workspace/navigation';
import type {
    GlobalMapAction,
    GlobalMappingRegistry,
} from '../workspace/global-mapping-registry';
import { VimInfoModal } from './vim-info-modal';
import type { OilManager } from '../oil/manager';
import { getViewFileBasename } from '../util/leaf';
import { navigateWithJump } from '../workspace/navigate';

export type GlobalExFn = (app: App, args: string) => void;

export interface GlobalExEntry {
    name: string;
    shortName: string;
    fn: GlobalExFn;
    description?: string;
}

type OpenPicker = (
    source: string,
    opts?: { query?: string; resumeSelectedId?: string },
) => void;

export function buildGlobalExCommands(
    app: App,
    globalRegistry?: GlobalMappingRegistry,
    openPicker?: OpenPicker,
    oilManager?: OilManager,
): GlobalExEntry[] {
    const cmd =
        (commandId: string): GlobalExFn =>
        () =>
            executeCommand(app, commandId);

    const closeOthers: GlobalExFn = () => {
        const active = app.workspace.getLeaf(false);
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf !== active) leaf.detach();
        });
    };

    const closeAll: GlobalExFn = () => {
        app.workspace.iterateAllLeaves((leaf) => leaf.detach());
    };

    const writeQuit: GlobalExFn = () => {
        executeCommand(app, 'editor:save-file');
        executeCommand(app, 'workspace:close');
    };

    const editFile: GlobalExFn = (_app, args) => {
        const filename = args.trim();
        if (filename) void navigateWithJump(app, filename, '');
    };

    const enew: GlobalExFn = () => {
        const tryCreate = (n: number): void => {
            const name = n === 0 ? 'Untitled.md' : `Untitled ${n}.md`;
            if (app.vault.getAbstractFileByPath(name)) {
                tryCreate(n + 1);
                return;
            }
            void app.vault.create(name, '').then(() => {
                void navigateWithJump(app, name, '');
            });
        };
        tryCreate(0);
    };

    const findFile: GlobalExFn = (_app, args) => {
        const query = args.trim().toLowerCase();
        if (!query) {
            executeCommand(app, 'switcher:open');
            return;
        }
        const files = app.vault.getMarkdownFiles();
        const match = files.find(
            (f) =>
                f.basename.toLowerCase().includes(query) ||
                f.path.toLowerCase().includes(query),
        );
        if (match) {
            void navigateWithJump(app, match.path, '');
        } else {
            new Notice(`File not found: ${query}`);
        }
    };

    const bufferSwitch: GlobalExFn = (_app, args) => {
        const query = args.trim().toLowerCase();
        if (!query) return;
        let found = false;
        app.workspace.iterateAllLeaves((leaf) => {
            if (found) return;
            if (leaf.view.getViewType() === 'markdown') {
                const basename = getViewFileBasename(leaf.view);
                if (basename?.toLowerCase().includes(query)) {
                    app.workspace.setActiveLeaf(leaf, { focus: true });
                    found = true;
                }
            }
        });
        if (!found) new Notice(`No buffer matching: ${query}`);
    };

    const bufferFirstLast = (first: boolean): GlobalExFn => {
        return () => {
            const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') leaves.push(leaf);
            });
            const target = first ? leaves[0] : leaves[leaves.length - 1];
            if (target) app.workspace.setActiveLeaf(target, { focus: true });
        };
    };

    const splitCmd = (vertical: boolean): GlobalExFn => {
        return () =>
            executeCommand(
                app,
                vertical
                    ? 'workspace:split-vertical'
                    : 'workspace:split-horizontal',
            );
    };

    const tabNew: GlobalExFn = (_app, args) => {
        const filename = args.trim();
        app.workspace.getLeaf(true);
        if (filename)
            void navigateWithJump(app, filename, '', { newTab: true });
    };

    const sidebar: GlobalExFn = (_app, args) => {
        const side = args.trim().toLowerCase();
        if (side === 'left') {
            executeCommand(app, 'app:toggle-left-sidebar');
        } else if (side === 'right') {
            executeCommand(app, 'app:toggle-right-sidebar');
        }
    };

    const explorer: GlobalExFn = () =>
        executeCommand(app, 'file-explorer:reveal-active-file');

    const ob: GlobalExFn = (_app, args) => {
        const commandId = args.trim();
        if (commandId) {
            executeCommand(app, commandId);
        } else if (openPicker) {
            openPicker('commands');
        }
    };

    const version: GlobalExFn = () => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { manifest: { version: string; name: string } }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        const v = plugin?.manifest?.version ?? 'unknown';
        const name = plugin?.manifest?.name ?? 'Vim Motions';
        new Notice(`${name} v${v}`);
    };

    return [
        {
            name: 'quit',
            shortName: 'q',
            fn: cmd('workspace:close'),
            description: 'Close the current pane',
        },
        {
            name: 'write',
            shortName: 'w',
            fn: cmd('editor:save-file'),
            description: 'Save the current file',
        },
        {
            name: 'wq',
            shortName: '',
            fn: writeQuit,
            description: 'Save the current file and close the pane',
        },
        {
            name: 'xit',
            shortName: 'x',
            fn: writeQuit,
            description: 'Save the current file and close the pane',
        },
        {
            name: 'xall',
            shortName: 'xa',
            fn: writeQuit,
            description: 'Save all files and close all panes',
        },
        {
            name: 'update',
            shortName: 'up',
            fn: cmd('editor:save-file'),
            description: 'Save the current file',
        },
        {
            name: 'wall',
            shortName: 'wa',
            fn: cmd('editor:save-file'),
            description: 'Save all files',
        },
        {
            name: 'edit',
            shortName: 'e',
            fn: editFile,
            description: 'Open a file in the current pane',
        },
        {
            name: 'enew',
            shortName: 'ene',
            fn: enew,
            description: 'Create a new untitled file',
        },
        {
            name: 'find',
            shortName: 'fin',
            fn: findFile,
            description: 'Find and open a file by name',
        },
        {
            name: 'bnext',
            shortName: 'bn',
            fn: cmd('workspace:next-tab'),
            description: 'Switch to the next buffer',
        },
        {
            name: 'bprevious',
            shortName: 'bp',
            fn: cmd('workspace:previous-tab'),
            description: 'Switch to the previous buffer',
        },
        {
            name: 'buffer',
            shortName: 'b',
            fn: bufferSwitch,
            description: 'Switch to a buffer by name',
        },
        {
            name: 'bfirst',
            shortName: 'bf',
            fn: bufferFirstLast(true),
            description: 'Switch to the first buffer',
        },
        {
            name: 'blast',
            shortName: 'bl',
            fn: bufferFirstLast(false),
            description: 'Switch to the last buffer',
        },
        {
            name: 'bdelete',
            shortName: 'bd',
            fn: cmd('workspace:close'),
            description: 'Close the current buffer',
        },
        {
            name: 'bclose',
            shortName: 'bc',
            fn: cmd('workspace:close'),
            description: 'Close the current buffer',
        },
        {
            name: 'bwipeout',
            shortName: 'bw',
            fn: cmd('workspace:close'),
            description: 'Close the current buffer',
        },
        {
            name: 'only',
            shortName: 'on',
            fn: closeOthers,
            description: 'Close all other panes',
        },
        {
            name: 'quitall',
            shortName: 'qa',
            fn: closeAll,
            description: 'Close all panes',
        },
        {
            name: 'split',
            shortName: 'sp',
            fn: splitCmd(false),
            description: 'Split the current pane horizontally',
        },
        {
            name: 'vsplit',
            shortName: 'vs',
            fn: splitCmd(true),
            description: 'Split the current pane vertically',
        },
        {
            name: 'tabnew',
            shortName: 'tabn',
            fn: tabNew,
            description: 'Open a new tab',
        },
        {
            name: 'tabedit',
            shortName: 'tabe',
            fn: tabNew,
            description: 'Open a new tab',
        },
        {
            name: 'tabclose',
            shortName: 'tabc',
            fn: cmd('workspace:close'),
            description: 'Close the current tab',
        },
        {
            name: 'tabonly',
            shortName: 'tabo',
            fn: closeOthers,
            description: 'Close all other tabs',
        },
        {
            name: 'tabfirst',
            shortName: 'tabf',
            fn: bufferFirstLast(true),
            description: 'Switch to the first tab',
        },
        {
            name: 'tablast',
            shortName: 'tabl',
            fn: bufferFirstLast(false),
            description: 'Switch to the last tab',
        },
        {
            name: 'sidebar',
            shortName: 'sid',
            fn: sidebar,
            description:
                'Toggle the left or right sidebar (use "left" or "right" as argument)',
        },
        {
            name: 'explorer',
            shortName: 'exp',
            fn: explorer,
            description: 'Reveal the active file in the file explorer',
        },
        {
            name: 'ob',
            shortName: '',
            fn: ob,
            description: 'Execute an Obsidian command (use ":ob <commandId>")',
        },
        {
            name: 'back',
            shortName: 'bac',
            fn: cmd('app:go-back'),
            description: 'Go back in navigation history',
        },
        {
            name: 'forward',
            shortName: 'fo',
            fn: cmd('app:go-forward'),
            description: 'Go forward in navigation history',
        },
        {
            name: 'version',
            shortName: 've',
            fn: version,
            description: 'Show the version of the Vim Motions plugin',
        },
        {
            name: 'gmaps',
            shortName: '',
            fn: () => {
                if (!globalRegistry) return;
                const allEntries = globalRegistry.getAllEntries();
                const rows = allEntries.map((e) => {
                    let actionStr = '';
                    if (e.action.type === 'obcommand')
                        actionStr = ':ob ' + e.action.commandId;
                    else if (e.action.type === 'ex')
                        actionStr = ':' + e.action.command;
                    else actionStr = '(builtin)';
                    return [e.keys, actionStr, e.source];
                });
                new VimInfoModal(
                    app,
                    'Global Mappings',
                    [
                        { header: 'Keys' },
                        { header: 'Action' },
                        { header: 'Source' },
                    ],
                    rows,
                ).open();
            },
            description: 'List all global mappings',
        },
        {
            name: 'gmap',
            shortName: '',
            fn: (_app, args) => {
                if (!globalRegistry) return;
                const parts = args.trim().split(/\s+/);
                if (parts.length < 2 || !parts[0] || !parts[1]) {
                    new Notice('Usage: :gmap <key> <:command>');
                    return;
                }
                const lhs = parts[0].replace(/ /g, '<Space>');
                const rhs = parts.slice(1).join(' ');
                let action: GlobalMapAction;
                if (rhs.startsWith(':obcommand ')) {
                    action = {
                        type: 'obcommand',
                        commandId: rhs.slice(':obcommand '.length).trim(),
                    };
                } else if (rhs.startsWith(':')) {
                    action = { type: 'ex', command: rhs.slice(1).trim() };
                } else {
                    new Notice(
                        'Gmap rhs must start with : (e.g., :files, :obcommand app:reload)',
                    );
                    return;
                }
                globalRegistry.addMapping(lhs, action, {
                    source: 'user',
                    gate: 'standard',
                });
            },
            description: 'Add a global mapping (e.g., :gmap <key> <:command>)',
        },
        {
            name: 'gunmap',
            shortName: 'gunm',
            fn: (_app, args) => {
                if (!globalRegistry) return;
                const key = args.trim().replace(/ /g, '<Space>');
                if (!key) {
                    new Notice('Usage: :gunmap <key>');
                    return;
                }
                if (!globalRegistry.removeMapping(key)) {
                    new Notice(`No global mapping for: ${key}`);
                }
            },
            description: 'Remove a global mapping (e.g., :gunmap <key>)',
        },
        ...(openPicker
            ? ([
                  {
                      name: 'files',
                      shortName: '',
                      fn: () => openPicker('files'),
                      description: 'Open the file picker',
                  },
                  {
                      name: 'commands',
                      shortName: '',
                      fn: () => openPicker('commands'),
                      description: 'Open the command picker',
                  },
                  {
                      name: 'buffers',
                      shortName: 'buf',
                      fn: () => openPicker('buffers'),
                      description: 'Open the buffer picker',
                  },
                  {
                      name: 'headings',
                      shortName: '',
                      fn: () => openPicker('headings'),
                      description: 'Open the headings picker',
                  },
                  {
                      name: 'outline',
                      shortName: '',
                      fn: () => openPicker('outline'),
                      description: 'Open the outline picker',
                  },
                  {
                      name: 'backlinks',
                      shortName: 'backl',
                      fn: () => openPicker('backlinks'),
                      description: 'Open the backlinks picker',
                  },
                  {
                      name: 'tags',
                      shortName: '',
                      fn: () => openPicker('tags'),
                      description: 'Open the tags picker',
                  },
                  {
                      name: 'recent',
                      shortName: '',
                      fn: () => openPicker('recent'),
                      description: 'Open the recent files picker',
                  },
                  {
                      name: 'resume',
                      shortName: 'res',
                      fn: () => openPicker('resume'),
                      description: 'Resume the last picker',
                  },
                  {
                      name: 'grep',
                      shortName: 'gre',
                      fn: (_app, args) => {
                          const query = args.trim();
                          if (query) openPicker('grep', { query });
                      },
                      description:
                          'Open the grep picker with an optional query',
                  },
                  {
                      name: 'livegrep',
                      shortName: 'liveg',
                      fn: () => openPicker('livegrep'),
                      description: 'Open the live grep picker',
                  },
                  {
                      name: 'registers',
                      shortName: 'reg',
                      fn: () => openPicker('registers'),
                      description: 'Open the registers picker',
                  },
              ] satisfies GlobalExEntry[])
            : []),
        ...(oilManager
            ? ([
                  {
                      name: 'Oil',
                      shortName: '',
                      fn: (_app, args) => {
                          let dirPath = args.trim();
                          if (!dirPath || dirPath === '.' || dirPath === '/') {
                              const activeFile = _app.workspace.getActiveFile();
                              if (activeFile) {
                                  dirPath = activeFile.path.includes('/')
                                      ? activeFile.path.substring(
                                            0,
                                            activeFile.path.lastIndexOf('/'),
                                        )
                                      : '';
                              } else {
                                  dirPath = '';
                              }
                          }
                          void oilManager.openOil(dirPath);
                      },
                      description:
                          'Open the Oil file manager in a directory (default: current file directory)',
                  },
              ] satisfies GlobalExEntry[])
            : []),
    ];
}

export function matchCommand(
    input: string,
    entries: GlobalExEntry[],
): { entry: GlobalExEntry; args: string } | null {
    const spaceIdx = input.indexOf(' ');
    const cmd = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1);

    for (const entry of entries) {
        if (entry.name === cmd) return { entry, args };
    }
    for (const entry of entries) {
        if (
            entry.shortName &&
            cmd.startsWith(entry.shortName) &&
            entry.name.startsWith(cmd)
        ) {
            return { entry, args };
        }
    }
    return null;
}

interface ExSuggestion {
    command: string;
    fullInput: string;
    description: string;
}

export function executeGlobalExCommand(
    app: App,
    command: string,
    globalRegistry?: GlobalMappingRegistry,
    openPicker?: OpenPicker,
): void {
    const entries = buildGlobalExCommands(app, globalRegistry, openPicker);
    const result = matchCommand(command, entries);
    if (result) {
        result.entry.fn(app, result.args);
    }
}

export class GlobalExCommandModal extends SuggestModal<ExSuggestion> {
    private entries: GlobalExEntry[];

    constructor(
        app: App,
        globalRegistry?: GlobalMappingRegistry,
        openPicker?: OpenPicker,
        oilManager?: OilManager,
    ) {
        super(app);
        this.entries = buildGlobalExCommands(
            app,
            globalRegistry,
            openPicker,
            oilManager,
        );
        this.setPlaceholder('Ex command');
        this.setInstructions([
            { command: 'Enter', purpose: 'execute' },
            { command: 'Esc', purpose: 'cancel' },
        ]);
        const { modalEl } = this;
        modalEl.addClass('vim-motions-prompt-modal-container');
        const childEls = modalEl.children;
        if (childEls.length === 3) {
            const input = childEls[0];
            const results = childEls[1];
            const instructions = childEls[2];
            if (input) {
                input.addClass('vim-motions-prompt-modal-input');
                input.createSpan({
                    text: 'Ex commands',
                    cls: 'vim-motions-prompt-modal-title',
                });
            }
            if (results) {
                results.addClass('vim-motions-prompt-modal-results');
            }
            if (instructions) {
                instructions.addClass('vim-motions-prompt-modal-instructions');
            }
        }
    }

    getSuggestions(query: string): ExSuggestion[] {
        const q = query.trim();
        if (!q) {
            return this.entries.map((e) => ({
                command: e.name,
                fullInput: e.name,
                description: e.description ?? '',
            }));
        }

        const spaceIdx = q.indexOf(' ');
        const prefix = spaceIdx === -1 ? q : q.slice(0, spaceIdx);

        return this.entries
            .filter(
                (e) =>
                    e.name.startsWith(prefix) ||
                    (e.shortName &&
                        prefix.startsWith(e.shortName) &&
                        e.name.startsWith(prefix)),
            )
            .map((e) => ({
                command: e.name,
                fullInput:
                    spaceIdx === -1 ? e.name : e.name + q.slice(spaceIdx),
                description: e.description ?? '',
            }));
    }

    renderSuggestion(item: ExSuggestion, el: HTMLElement): void {
        el.createDiv({
            text: ':' + item.command,
            cls: 'vim-motions-prompt-modal-suggestion-label',
        });
        el.createDiv({
            text: item.description ?? '',
            cls: 'vim-motions-prompt-modal-suggestion-description',
        });
    }

    onChooseSuggestion(item: ExSuggestion): void {
        this.executeInput(item.fullInput);
    }

    onNoSuggestion(): void {
        const input = (this as unknown as { inputEl: HTMLInputElement })
            .inputEl;
        if (input?.value) {
            this.executeInput(input.value.trim());
            this.close();
        }
    }

    private executeInput(input: string): void {
        const result = matchCommand(input, this.entries);
        if (result) {
            result.entry.fn(this.app, result.args);
        } else {
            new Notice(`Not a global command: ${input}`);
        }
    }
}
