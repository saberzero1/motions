import { type App, Notice } from 'obsidian';
import type { OilManager } from './manager';
import type { AutocmdManager } from '../lua/autocmd';
import { getVimApi } from '../vim/vim-api';
import { OilView } from './oil-view';
import { executeCommand } from '../util/commands';
import { VimInfoModal } from '../ui/vim-info-modal';

interface OilMapping {
    lhs: string;
    actionName: string;
    exName: string;
    exShort: string;
    desc: string;
}

const OIL_MAPPINGS: OilMapping[] = [
    {
        lhs: '<CR>',
        actionName: 'oilOpenEntry',
        exName: 'oilopen',
        exShort: 'oilo',
        desc: 'Open file/folder',
    },
    {
        lhs: '-',
        actionName: 'oilParent',
        exName: 'oilparent',
        exShort: 'oilp',
        desc: 'Go to parent directory',
    },
    {
        lhs: '~',
        actionName: 'oilRoot',
        exName: 'oilroot',
        exShort: 'oilro',
        desc: 'Go to vault root',
    },
    {
        lhs: '<C-l>',
        actionName: 'oilRefresh',
        exName: 'oilrefresh',
        exShort: 'oilref',
        desc: 'Refresh',
    },
    {
        lhs: 'q',
        actionName: 'oilClose',
        exName: 'oilclose',
        exShort: 'oilcl',
        desc: 'Close oil',
    },
    {
        lhs: 'g.',
        actionName: 'oilToggleHidden',
        exName: 'oiltogglehidden',
        exShort: 'oilt',
        desc: 'Toggle hidden files',
    },
    {
        lhs: 'gs',
        actionName: 'oilCycleSort',
        exName: 'oilcyclesort',
        exShort: 'oilcy',
        desc: 'Cycle sort order',
    },
    {
        lhs: 'y.',
        actionName: 'oilYankPath',
        exName: 'oilyankpath',
        exShort: 'oily',
        desc: 'Yank file path',
    },
    {
        lhs: 'gf',
        actionName: 'oilRevealInExplorer',
        exName: 'oilreveal',
        exShort: 'oilrev',
        desc: 'Reveal in file explorer',
    },
    {
        lhs: 'g?',
        actionName: 'oilHelp',
        exName: 'oilhelp',
        exShort: 'oilh',
        desc: 'Toggle help',
    },
];

export class OilKeybindingManager {
    private applied = false;
    private actionsRegistered = false;
    private appliedKeys: string[] = [];
    private autocmdManager: AutocmdManager | null = null;
    private wasInOil = false;

    constructor(
        private readonly app: App,
        private readonly manager: OilManager,
    ) {}

    setAutocmdManager(manager: AutocmdManager | null): void {
        this.autocmdManager = manager;
    }

    onActiveLeafChange(): void {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const isOil = leaf?.view instanceof OilView;

        if (isOil && !this.applied) {
            this.apply();
        } else if (!isOil && this.applied) {
            this.remove();
        }

        if (isOil && !this.wasInOil) {
            const view = leaf?.view instanceof OilView ? leaf.view : null;
            this.autocmdManager?.fire('OilEnter', {
                file: view?.getDirPath() ?? '',
            });
        } else if (!isOil && this.wasInOil) {
            this.autocmdManager?.fire('OilLeave');
        }
        this.wasInOil = isOil;
    }

    private apply(): void {
        this.ensureActionsRegistered();
        const vim = getVimApi();
        if (!vim) return;
        this.appliedKeys = [];
        for (const m of OIL_MAPPINGS) {
            vim.map(m.lhs, `:${m.exName}<CR>`, 'normal');
            this.appliedKeys.push(m.lhs);
        }
        this.applied = true;
    }

    private remove(): void {
        const vim = getVimApi();
        if (!vim) return;
        for (const key of this.appliedKeys) {
            try {
                vim.unmap(key, 'normal');
            } catch {
                /* binding may not exist */
            }
        }
        this.appliedKeys = [];
        this.applied = false;
    }

    private ensureActionsRegistered(): void {
        if (this.actionsRegistered) return;
        const vim = getVimApi();
        if (!vim) return;
        this.actionsRegistered = true;
        const app = this.app;
        const manager = this.manager;

        const actions = this.buildActions(app, manager);
        for (const m of OIL_MAPPINGS) {
            const fn = actions[m.actionName];
            if (!fn) continue;
            vim.defineAction(m.actionName, fn);
            vim.defineEx(m.exName, m.exShort, fn);
        }
    }

    private buildActions(
        app: App,
        manager: OilManager,
    ): Record<string, () => void> {
        const getActiveOilView = (): OilView | null => {
            const leaf = app.workspace.getMostRecentLeaf();
            const view = leaf?.view;
            return view instanceof OilView ? view : null;
        };

        const getCursorLine = (view: OilView): number | null => {
            const editorView = view.getEditorView();
            if (!editorView) return null;
            const pos = editorView.state.selection.main.head;
            return editorView.state.doc.lineAt(pos).number - 1;
        };

        return {
            oilOpenEntry: () => {
                const view = getActiveOilView();
                if (!view) return;
                const cursorLine = getCursorLine(view);
                if (cursorLine === null) return;
                const lineText = view.getLineText(cursorLine);
                const entry = manager.getEntryAtLine(lineText);
                if (!entry) return;
                if (entry.type === 'folder') {
                    void manager.navigateToDirectory(entry.path);
                } else {
                    void app.workspace.openLinkText(entry.path, '');
                }
            },
            oilParent: () => {
                const view = getActiveOilView();
                if (!view) return;
                const dirPath = view.getDirPath();
                if (!dirPath) {
                    new Notice('Oil: already at vault root');
                    return;
                }
                const parentPath = dirPath.includes('/')
                    ? dirPath.substring(0, dirPath.lastIndexOf('/'))
                    : '';
                void manager.navigateToDirectory(parentPath);
            },
            oilRoot: () => {
                const view = getActiveOilView();
                if (!view) return;
                void manager.navigateToDirectory('');
            },
            oilRefresh: () => {
                const view = getActiveOilView();
                if (!view) return;
                void manager.navigateToDirectory(view.getDirPath());
            },
            oilClose: () => {
                const view = getActiveOilView();
                if (!view) return;
                const leaf = app.workspace.getMostRecentLeaf();
                if (!leaf) return;
                const previousFile = view.getPreviousFile();
                const file = previousFile
                    ? app.vault.getAbstractFileByPath(previousFile)
                    : null;
                if (file) {
                    void leaf.openFile(file as import('obsidian').TFile);
                } else {
                    leaf.detach();
                }
            },
            oilToggleHidden: () => {
                const view = getActiveOilView();
                if (!view) return;
                manager.toggleHidden();
                void manager.navigateToDirectory(view.getDirPath());
            },
            oilCycleSort: () => {
                const view = getActiveOilView();
                if (!view) return;
                manager.cycleSortKey();
                void manager.navigateToDirectory(view.getDirPath());
            },
            oilYankPath: () => {
                const view = getActiveOilView();
                if (!view) return;
                const cursorLine = getCursorLine(view);
                if (cursorLine === null) return;
                const lineText = view.getLineText(cursorLine);
                const entry = manager.getEntryAtLine(lineText);
                if (!entry) return;
                void navigator.clipboard.writeText(entry.path);
                new Notice(`Oil: yanked ${entry.path}`);
            },
            oilHelp: () => {
                if (!getActiveOilView()) return;
                this.showOilHelp();
            },
            oilRevealInExplorer: () => {
                const view = getActiveOilView();
                if (!view) return;
                const cursorLine = getCursorLine(view);
                if (cursorLine === null) return;
                const lineText = view.getLineText(cursorLine);
                const entry = manager.getEntryAtLine(lineText);
                if (!entry) return;
                const target = app.vault.getAbstractFileByPath(entry.path);
                if (!target) return;
                const fileExplorer = (
                    app as unknown as {
                        internalPlugins?: {
                            plugins?: Record<
                                string,
                                {
                                    instance?: {
                                        revealInFolder?: (f: unknown) => void;
                                    };
                                }
                            >;
                        };
                    }
                ).internalPlugins?.plugins?.['file-explorer']?.instance;
                if (fileExplorer?.revealInFolder) {
                    fileExplorer.revealInFolder(target);
                } else {
                    executeCommand(app, 'file-explorer:reveal-active-file');
                }
            },
        };
    }

    private showOilHelp(): void {
        const rows = OIL_MAPPINGS.map((m) => [m.lhs, m.desc]);
        new VimInfoModal(
            this.app,
            'Oil keybindings',
            [{ header: 'Key' }, { header: 'Action' }],
            rows,
        ).open();
    }

    getCommandLabels(): Array<{ key: string; label: string }> {
        return OIL_MAPPINGS.map((m) => ({ key: m.lhs, label: m.desc }));
    }

    destroy(): void {
        if (this.applied) this.remove();
    }
}
