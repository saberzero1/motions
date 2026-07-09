import { type App, MarkdownView, Notice } from 'obsidian';
import type { OilManager } from './manager';
import type { AutocmdManager } from '../lua/autocmd';
import { getVimApi } from '../vim/vim-api';

interface OilMapping {
    lhs: string;
    actionName: string;
    exName: string;
    exShort: string;
}

const OIL_MAPPINGS: OilMapping[] = [
    {
        lhs: '<CR>',
        actionName: 'oilOpenEntry',
        exName: 'oilopen',
        exShort: 'oilo',
    },
    { lhs: '-', actionName: 'oilParent', exName: 'oilparent', exShort: 'oilp' },
    { lhs: '~', actionName: 'oilRoot', exName: 'oilroot', exShort: 'oilro' },
    {
        lhs: '<C-l>',
        actionName: 'oilRefresh',
        exName: 'oilrefresh',
        exShort: 'oilref',
    },
    { lhs: 'q', actionName: 'oilClose', exName: 'oilclose', exShort: 'oilcl' },
    {
        lhs: 'g.',
        actionName: 'oilToggleHidden',
        exName: 'oiltogglehidden',
        exShort: 'oilt',
    },
    {
        lhs: 'gs',
        actionName: 'oilCycleSort',
        exName: 'oilcyclesort',
        exShort: 'oilcy',
    },
    {
        lhs: 'y.',
        actionName: 'oilYankPath',
        exName: 'oilyankpath',
        exShort: 'oily',
    },
    {
        lhs: 'gf',
        actionName: 'oilRevealInExplorer',
        exName: 'oilreveal',
        exShort: 'oilrev',
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
        const file = this.app.workspace.getActiveFile();
        const isOil = !!(file && this.manager.isOilFile(file.path));

        if (isOil && !this.applied) {
            this.apply();
        } else if (!isOil && this.applied) {
            this.remove();
        }

        if (isOil && !this.wasInOil) {
            this.autocmdManager?.fire('OilEnter', {
                file: file?.path ?? '',
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
            vim.noremap(m.lhs, `:${m.exName}\n`, 'normal');
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
        return {
            oilOpenEntry: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                const cursor = view.editor.getCursor();
                const lineText = view.editor.getLine(cursor?.line ?? 0);
                const entry = manager.getEntryAtLine(lineText);
                if (!entry) return;
                if (entry.type === 'folder') {
                    void manager.navigateToDirectory(entry.path, file.path);
                } else {
                    void app.workspace.openLinkText(entry.path, '');
                }
            },
            oilParent: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                const dirPath = manager.getDirPath(file.path) ?? '';
                if (!dirPath) {
                    new Notice('Oil: already at vault root');
                    return;
                }
                const parentPath = dirPath.includes('/')
                    ? dirPath.substring(0, dirPath.lastIndexOf('/'))
                    : '';
                void manager.navigateToDirectory(parentPath, file.path);
            },
            oilRoot: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                void manager.navigateToDirectory('', file.path);
            },
            oilRefresh: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                const dirPath = manager.getDirPath(file.path) ?? '';
                void manager.navigateToDirectory(dirPath, file.path);
            },
            oilClose: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                const filePath = file.path;
                const leaf = app.workspace.getMostRecentLeaf();
                leaf?.detach();
                manager.forgetTempPath(filePath);
                manager.cleanupOrphanedTempFiles();
            },
            oilToggleHidden: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                manager.toggleHidden();
                const dirPath = manager.getDirPath(file.path) ?? '';
                void manager.navigateToDirectory(dirPath, file.path);
            },
            oilCycleSort: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                manager.cycleSortKey();
                const dirPath = manager.getDirPath(file.path) ?? '';
                void manager.navigateToDirectory(dirPath, file.path);
            },
            oilYankPath: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                const cursor = view.editor.getCursor();
                const lineText = view.editor.getLine(cursor?.line ?? 0);
                const entry = manager.getEntryAtLine(lineText);
                if (!entry) return;
                void navigator.clipboard.writeText(entry.path);
                new Notice(`Oil: yanked ${entry.path}`);
            },
            oilRevealInExplorer: () => {
                const file = app.workspace.getActiveFile();
                if (!file || !manager.isOilFile(file.path)) return;
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                const cursor = view.editor.getCursor();
                const lineText = view.editor.getLine(cursor?.line ?? 0);
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
                    (
                        app as unknown as {
                            commands: {
                                executeCommandById: (id: string) => void;
                            };
                        }
                    ).commands.executeCommandById(
                        'file-explorer:reveal-active-file',
                    );
                }
            },
        };
    }

    destroy(): void {
        if (this.applied) this.remove();
    }
}
