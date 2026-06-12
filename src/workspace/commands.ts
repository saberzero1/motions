import { App, MarkdownView, Notice } from 'obsidian';
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
                    commands: Record<string, unknown>;
                };
            }
        ).commands;

        if (!params.argString?.trim()) {
            const ids = Object.keys(commands.commands).sort();
            new Notice(
                `${ids.length} commands available. Check developer console.`,
            );
            // eslint-disable-next-line obsidianmd/rule-custom-message -- user-requested listing via :ob
            console.table(ids);
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

export function registerExCommands(
    reg: VimRegistration,
    app: App,
    vim?: VimApi,
): void {
    const hasVimrcSupport = !!(
        app as unknown as { plugins: { plugins: Record<string, unknown> } }
    ).plugins.plugins['obsidian-vimrc-support'];

    if (!hasVimrcSupport) {
        reg.defineEx('ob', '', createObCommand(app));
    }

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
}
