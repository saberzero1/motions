import { App, MarkdownView, Notice, TFile } from 'obsidian';
import { createGrepCommand } from './vault-search';
import type { ExCommandFn, VimApi } from '../types/vim-api';
import { VimRegistration } from '../vim/registration';
import { VimInfoModal } from '../ui/vim-info-modal';

function createObCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const commands = (
            app as unknown as {
                commands: {
                    executeCommandById: (id: string) => void;
                    commands: Record<string, { id: string; name: string }>;
                };
            }
        ).commands;

        if (!params.argString?.trim()) {
            const rows = Object.values(commands.commands)
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((cmd) => [cmd.id, cmd.name]);
            new VimInfoModal(
                app,
                'Obsidian commands',
                [{ header: 'ID' }, { header: 'Name' }],
                rows,
            ).open();
            return;
        }
        const commandId = params.argString?.trim() ?? '';
        commands.executeCommandById(commandId);
    };
}

function createSidebarCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const side = (params.argString ?? '').trim().toLowerCase();
        if (side === 'left') {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById('app:toggle-left-sidebar');
        } else if (side === 'right') {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById('app:toggle-right-sidebar');
        }
    };
}

function createExplorerCommand(app: App): ExCommandFn {
    return () => {
        (
            app as unknown as {
                commands: { executeCommandById: (id: string) => void };
            }
        ).commands.executeCommandById('file-explorer:reveal-active-file');
    };
}

function createRegCommand(app: App, vim: VimApi): ExCommandFn {
    return () => {
        const rc = vim.getRegisterController();
        const rows: string[][] = [];
        const sortedNames = Object.keys(rc.registers).sort((a, b) => {
            const order = (c: string) => {
                if (c === '"') return 0;
                if (c >= '0' && c <= '9') return 1;
                if (c >= 'a' && c <= 'z') return 2;
                if (c >= 'A' && c <= 'Z') return 3;
                return 4;
            };
            return order(a) - order(b) || a.localeCompare(b);
        });
        for (const name of sortedNames) {
            const reg = rc.registers[name];
            if (!reg) continue;
            const text = reg.toString();
            if (!text) continue;
            const typeLabel = reg.linewise
                ? 'linewise'
                : reg.blockwise
                  ? 'blockwise'
                  : 'charwise';
            const display =
                text.length > 80 ? text.slice(0, 80) + '\u2026' : text;
            rows.push(['"' + name, display, typeLabel]);
        }
        new VimInfoModal(
            app,
            'Registers',
            [{ header: 'Register' }, { header: 'Content' }, { header: 'Type' }],
            rows,
        ).open();
    };
}

function createMarksCommand(app: App): ExCommandFn {
    return (cm) => {
        const marks = cm.state.vim?.marks ?? {};
        const rows: string[][] = [];
        const sortedNames = Object.keys(marks).sort();
        for (const name of sortedNames) {
            const marker = marks[name];
            if (!marker) continue;
            const pos = marker.find();
            if (!pos) continue;
            rows.push([name, String(pos.line + 1), String(pos.ch)]);
        }
        new VimInfoModal(
            app,
            'Marks',
            [{ header: 'Mark' }, { header: 'Line' }, { header: 'Col' }],
            rows,
        ).open();
    };
}

function executeCommand(app: App, commandId: string): void {
    (
        app as unknown as {
            commands: { executeCommandById: (id: string) => void };
        }
    ).commands.executeCommandById(commandId);
}

function createWriteQuitCommand(app: App): ExCommandFn {
    return () => {
        executeCommand(app, 'editor:save-file');
        executeCommand(app, 'workspace:close');
    };
}

function createCloseAllCommand(app: App): ExCommandFn {
    return () => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === 'markdown') {
                leaf.detach();
            }
        });
    };
}

function createCloseOthersExCommand(app: App): ExCommandFn {
    return () => {
        const active = app.workspace.getLeaf(false);
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf !== active && leaf.view.getViewType() === 'markdown') {
                leaf.detach();
            }
        });
    };
}

function createBufferListCommand(app: App): ExCommandFn {
    return () => {
        const rows: string[][] = [];
        let idx = 1;
        const activeLeaf = app.workspace.getLeaf(false);
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() !== 'markdown') return;
            const view = leaf.view as MarkdownView;
            const active = leaf === activeLeaf ? '%' : ' ';
            const name = view.file?.basename ?? '(untitled)';
            const path = view.file?.path ?? '';
            rows.push([String(idx), active, name, path]);
            idx++;
        });
        new VimInfoModal(
            app,
            'Buffers',
            [
                { header: '#' },
                { header: '' },
                { header: 'Name' },
                { header: 'Path' },
            ],
            rows,
        ).open();
    };
}

function createBacklinksCommand(app: App): ExCommandFn {
    return () => {
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }
        const resolvedLinks = (
            app.metadataCache as unknown as {
                resolvedLinks: Record<string, Record<string, number>>;
            }
        ).resolvedLinks;
        const rows: string[][] = [];
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            const count = targets[activeFile.path];
            if (count && count > 0) {
                const name =
                    sourcePath.replace(/\.md$/, '').split('/').pop() ??
                    sourcePath;
                rows.push([name, sourcePath, String(count)]);
            }
        }
        rows.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
        new VimInfoModal(
            app,
            `Backlinks to ${activeFile.basename}`,
            [{ header: 'Name' }, { header: 'Path' }, { header: 'Links' }],
            rows,
        ).open();
    };
}

export function registerObCommand(reg: VimRegistration, app: App): void {
    reg.defineEx('ob', '', createObCommand(app));
}

function createEditCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const filename = (params.argString ?? '').trim();
        if (!filename) return;
        void app.workspace.openLinkText(filename, '');
    };
}

function createEditForceCommand(app: App): ExCommandFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return;
        const file = view.file;
        void app.vault.read(file).then((content) => {
            view.editor.setValue(content);
        });
    };
}

function createEnewCommand(app: App): ExCommandFn {
    return () => {
        const tryCreate = (n: number): void => {
            const name = n === 0 ? 'Untitled.md' : `Untitled ${n}.md`;
            const existing = app.vault.getAbstractFileByPath(name);
            if (existing) {
                tryCreate(n + 1);
                return;
            }
            void app.vault.create(name, '').then(() => {
                void app.workspace.openLinkText(name, '');
            });
        };
        tryCreate(0);
    };
}

function createSaveAsCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const newPath = (params.argString ?? '').trim();
        if (!newPath) {
            new Notice('Usage: :saveas {filename}');
            return;
        }
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const content = view.editor.getValue();
        const existing = app.vault.getAbstractFileByPath(newPath);
        if (existing) {
            new Notice(`File already exists: ${newPath}`);
            return;
        }
        void app.vault.create(newPath, content).then(() => {
            void app.workspace.openLinkText(newPath, '');
        });
    };
}

function createXitCommand(app: App): ExCommandFn {
    return () => {
        executeCommand(app, 'editor:save-file');
        executeCommand(app, 'workspace:close');
    };
}

function createXallCommand(app: App): ExCommandFn {
    return () => {
        executeCommand(app, 'editor:save-file');
        const active = app.workspace.getLeaf(false);
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === 'markdown') {
                leaf.detach();
            }
        });
    };
}

function createFindCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const query = (params.argString ?? '').trim().toLowerCase();
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
}

function createReadCommand(app: App): ExCommandFn {
    return (cm, params) => {
        const filename = (params.argString ?? '').trim();
        if (!filename) return;
        const file = app.vault.getAbstractFileByPath(filename);
        if (!(file instanceof TFile)) {
            new Notice(`File not found: ${filename}`);
            return;
        }
        void app.vault.read(file).then((content) => {
            const cursor = cm.getCursor();
            cm.replaceRange('\n' + content, {
                line: cursor.line,
                ch: cm.getLine(cursor.line).length,
            });
        });
    };
}

function createBufferCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const query = (params.argString ?? '').trim().toLowerCase();
        if (!query) return;
        const leaves: {
            leaf: ReturnType<typeof app.workspace.getLeaf>;
            name: string;
        }[] = [];
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === 'markdown') {
                const view = leaf.view as MarkdownView;
                leaves.push({ leaf, name: view.file?.basename ?? '' });
            }
        });
        const match = leaves.find((l) => l.name.toLowerCase().includes(query));
        if (match) {
            app.workspace.setActiveLeaf(match.leaf, { focus: true });
        } else {
            new Notice(`No buffer matching: ${query}`);
        }
    };
}

function createBufferFirstLast(app: App, first: boolean): ExCommandFn {
    return () => {
        const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === 'markdown') leaves.push(leaf);
        });
        const target = first ? leaves[0] : leaves[leaves.length - 1];
        if (target) app.workspace.setActiveLeaf(target, { focus: true });
    };
}

function createSplitCommand(app: App, vertical: boolean): ExCommandFn {
    return () => {
        executeCommand(
            app,
            vertical
                ? 'workspace:split-vertical'
                : 'workspace:split-horizontal',
        );
    };
}

function createSplitNewCommand(app: App, vertical: boolean): ExCommandFn {
    return () => {
        executeCommand(
            app,
            vertical
                ? 'workspace:split-vertical'
                : 'workspace:split-horizontal',
        );
        const enew = createEnewCommand(app);
        enew({} as never, {
            args: [],
            argString: '',
            commandName: 'enew',
            input: 'enew',
        });
    };
}

function createTabNewCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const filename = (params.argString ?? '').trim();
        const newLeaf = app.workspace.getLeaf(true);
        if (filename) {
            void app.workspace.openLinkText(filename, '');
        }
    };
}

function createVersionCommand(app: App): ExCommandFn {
    return () => {
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
        const version = plugin?.manifest?.version ?? 'unknown';
        const name = plugin?.manifest?.name ?? 'Vim Motions';
        new Notice(`${name} v${version}`);
    };
}

function createDelmarksCommand(): ExCommandFn {
    return (cm, params) => {
        const marks = (params.argString ?? '').trim();
        if (!marks) {
            new Notice('Usage: :delmarks {marks}');
            return;
        }
        const Vim = window.CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const state = cm.state.vim;
        if (!state?.marks) return;
        for (const ch of marks) {
            const mark = state.marks[ch];
            if (mark) {
                mark.clear();
                delete state.marks[ch];
            }
        }
    };
}

export function registerExCommands(
    reg: VimRegistration,
    app: App,
    vim?: VimApi,
): void {
    reg.defineEx('sidebar', 'sid', createSidebarCommand(app));
    reg.defineEx('explorer', 'exp', createExplorerCommand(app));

    reg.defineEx('write', 'w', () => executeCommand(app, 'editor:save-file'));
    reg.defineEx('quit', 'q', () => executeCommand(app, 'workspace:close'));
    reg.defineEx('wq', '', createWriteQuitCommand(app));
    reg.defineEx('bdelete', 'bd', () => executeCommand(app, 'workspace:close'));
    reg.defineEx('bclose', 'bc', () => executeCommand(app, 'workspace:close'));
    reg.defineEx('bnext', 'bn', () =>
        executeCommand(app, 'workspace:next-tab'),
    );
    reg.defineEx('bprevious', 'bp', () =>
        executeCommand(app, 'workspace:previous-tab'),
    );
    reg.defineEx('only', 'on', createCloseOthersExCommand(app));
    reg.defineEx('quitall', 'quita', createCloseAllCommand(app));
    reg.defineEx('qa', '', createCloseAllCommand(app));
    reg.defineEx('wall', 'wal', () => executeCommand(app, 'editor:save-file'));
    reg.defineEx('wa', '', () => executeCommand(app, 'editor:save-file'));

    reg.defineEx('buffers', 'buf', createBufferListCommand(app));
    reg.defineEx('ls', '', createBufferListCommand(app));
    reg.defineEx('backlinks', 'backl', createBacklinksCommand(app));
    reg.defineEx('grep', 'gre', createGrepCommand(app));
    reg.defineEx('back', 'bac', () => executeCommand(app, 'app:go-back'));
    reg.defineEx('forward', 'fo', () => executeCommand(app, 'app:go-forward'));

    if (vim) {
        reg.defineEx('registers', 'reg', createRegCommand(app, vim));
        reg.defineEx('marks', '', createMarksCommand(app));
    }

    reg.defineEx('edit', 'e', createEditCommand(app));
    reg.defineEx('edit!', '', createEditForceCommand(app));
    reg.defineEx('enew', 'ene', createEnewCommand(app));
    reg.defineEx('saveas', 'sav', createSaveAsCommand(app));
    reg.defineEx('update', 'up', () => executeCommand(app, 'editor:save-file'));
    reg.defineEx('xit', 'x', createXitCommand(app));
    reg.defineEx('xall', 'xa', createXallCommand(app));
    reg.defineEx('find', 'fin', createFindCommand(app));
    reg.defineEx('read', 'r', createReadCommand(app));

    reg.defineEx('buffer', 'b', createBufferCommand(app));
    reg.defineEx('bfirst', 'bf', createBufferFirstLast(app, true));
    reg.defineEx('blast', 'bl', createBufferFirstLast(app, false));
    reg.defineEx('bwipeout', 'bw', () =>
        executeCommand(app, 'workspace:close'),
    );

    reg.defineEx('split', 'sp', createSplitCommand(app, false));
    reg.defineEx('vsplit', 'vs', createSplitCommand(app, true));
    reg.defineEx('new', '', createSplitNewCommand(app, false));
    reg.defineEx('vnew', 'vne', createSplitNewCommand(app, true));
    reg.defineEx('tabnew', 'tabn', createTabNewCommand(app));
    reg.defineEx('tabedit', 'tabe', createTabNewCommand(app));
    reg.defineEx('tabclose', 'tabc', () =>
        executeCommand(app, 'workspace:close'),
    );
    reg.defineEx('tabonly', 'tabo', createCloseOthersExCommand(app));
    reg.defineEx('tabfirst', 'tabf', createBufferFirstLast(app, true));
    reg.defineEx('tabrewind', 'tabr', createBufferFirstLast(app, true));
    reg.defineEx('tablast', 'tabl', createBufferFirstLast(app, false));

    reg.defineEx('version', 've', createVersionCommand(app));
    reg.defineEx('delmarks', 'delm', createDelmarksCommand());
}
