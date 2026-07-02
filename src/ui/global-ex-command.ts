import { App, Notice, SuggestModal } from 'obsidian';
import { executeCommand } from '../workspace/navigation';

type GlobalExFn = (app: App, args: string) => void;

interface GlobalExEntry {
    name: string;
    shortName: string;
    fn: GlobalExFn;
}

function buildGlobalExCommands(app: App): GlobalExEntry[] {
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
        if (filename) void app.workspace.openLinkText(filename, '');
    };

    const enew: GlobalExFn = () => {
        const tryCreate = (n: number): void => {
            const name = n === 0 ? 'Untitled.md' : `Untitled ${n}.md`;
            if (app.vault.getAbstractFileByPath(name)) {
                tryCreate(n + 1);
                return;
            }
            void app.vault.create(name, '').then(() => {
                void app.workspace.openLinkText(name, '');
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
            void app.workspace.openLinkText(match.path, '');
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
                const file = (
                    leaf.view as unknown as { file?: { basename: string } }
                ).file;
                if (file?.basename.toLowerCase().includes(query)) {
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
        if (filename) void app.workspace.openLinkText(filename, '');
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
        if (commandId) executeCommand(app, commandId);
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
        { name: 'quit', shortName: 'q', fn: cmd('workspace:close') },
        { name: 'write', shortName: 'w', fn: cmd('editor:save-file') },
        { name: 'wq', shortName: '', fn: writeQuit },
        { name: 'xit', shortName: 'x', fn: writeQuit },
        { name: 'xall', shortName: 'xa', fn: writeQuit },
        { name: 'update', shortName: 'up', fn: cmd('editor:save-file') },
        { name: 'wall', shortName: 'wa', fn: cmd('editor:save-file') },
        { name: 'edit', shortName: 'e', fn: editFile },
        { name: 'enew', shortName: 'ene', fn: enew },
        { name: 'find', shortName: 'fin', fn: findFile },
        { name: 'bnext', shortName: 'bn', fn: cmd('workspace:next-tab') },
        {
            name: 'bprevious',
            shortName: 'bp',
            fn: cmd('workspace:previous-tab'),
        },
        { name: 'buffer', shortName: 'b', fn: bufferSwitch },
        { name: 'bfirst', shortName: 'bf', fn: bufferFirstLast(true) },
        { name: 'blast', shortName: 'bl', fn: bufferFirstLast(false) },
        { name: 'bdelete', shortName: 'bd', fn: cmd('workspace:close') },
        { name: 'bclose', shortName: 'bc', fn: cmd('workspace:close') },
        { name: 'bwipeout', shortName: 'bw', fn: cmd('workspace:close') },
        { name: 'only', shortName: 'on', fn: closeOthers },
        { name: 'quitall', shortName: 'qa', fn: closeAll },
        { name: 'split', shortName: 'sp', fn: splitCmd(false) },
        { name: 'vsplit', shortName: 'vs', fn: splitCmd(true) },
        { name: 'tabnew', shortName: 'tabn', fn: tabNew },
        { name: 'tabedit', shortName: 'tabe', fn: tabNew },
        { name: 'tabclose', shortName: 'tabc', fn: cmd('workspace:close') },
        { name: 'tabonly', shortName: 'tabo', fn: closeOthers },
        { name: 'tabfirst', shortName: 'tabf', fn: bufferFirstLast(true) },
        { name: 'tablast', shortName: 'tabl', fn: bufferFirstLast(false) },
        { name: 'sidebar', shortName: 'sid', fn: sidebar },
        { name: 'explorer', shortName: 'exp', fn: explorer },
        { name: 'ob', shortName: '', fn: ob },
        { name: 'back', shortName: 'bac', fn: cmd('app:go-back') },
        { name: 'forward', shortName: 'fo', fn: cmd('app:go-forward') },
        { name: 'version', shortName: 've', fn: version },
    ];
}

function matchCommand(
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
}

export class GlobalExCommandModal extends SuggestModal<ExSuggestion> {
    private entries: GlobalExEntry[];

    constructor(app: App) {
        super(app);
        this.entries = buildGlobalExCommands(app);
        this.setPlaceholder('Ex command');
        this.setInstructions([
            { command: 'Enter', purpose: 'execute' },
            { command: 'Esc', purpose: 'cancel' },
        ]);
    }

    getSuggestions(query: string): ExSuggestion[] {
        const q = query.trim();
        if (!q) {
            return this.entries.map((e) => ({
                command: e.name,
                fullInput: e.name,
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
            }));
    }

    renderSuggestion(item: ExSuggestion, el: HTMLElement): void {
        el.createDiv({ text: ':' + item.command });
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
