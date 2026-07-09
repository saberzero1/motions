import { type App, MarkdownView, Notice } from 'obsidian';
import type { OilManager } from './manager';
import { getVimApi } from '../vim/vim-api';

interface OilMapping {
    lhs: string;
    actionName: string;
}

const OIL_MAPPINGS: OilMapping[] = [
    { lhs: '<CR>', actionName: 'oilOpenEntry' },
    { lhs: '-', actionName: 'oilParent' },
    { lhs: '~', actionName: 'oilRoot' },
    { lhs: '<C-l>', actionName: 'oilRefresh' },
    { lhs: 'q', actionName: 'oilClose' },
    { lhs: 'g.', actionName: 'oilToggleHidden' },
    { lhs: 'gs', actionName: 'oilCycleSort' },
    { lhs: 'y.', actionName: 'oilYankPath' },
];

export class OilKeybindingManager {
    private applied = false;
    private actionsRegistered = false;

    constructor(
        private readonly app: App,
        private readonly manager: OilManager,
    ) {}

    onActiveLeafChange(): void {
        const file = this.app.workspace.getActiveFile();
        if (file && this.manager.isOilFile(file.path) && !this.applied) {
            this.apply();
        } else if ((!file || !this.manager.isOilFile(file.path)) && this.applied) {
            this.remove();
        }
    }

    private apply(): void {
        this.ensureActionsRegistered();
        const vim = getVimApi();
        if (!vim) return;
        for (const m of OIL_MAPPINGS) {
            vim.mapCommand(m.lhs, 'action', m.actionName, {});
        }
        this.applied = true;
    }

    private remove(): void {
        const vim = getVimApi();
        if (!vim) return;
        for (const m of OIL_MAPPINGS) {
            try {
                vim.unmap(m.lhs, 'normal');
            } catch {
                /* binding may not exist */
            }
        }
        this.applied = false;
    }

    private ensureActionsRegistered(): void {
        if (this.actionsRegistered) return;
        const vim = getVimApi();
        if (!vim) return;
        this.actionsRegistered = true;
        const app = this.app;
        const manager = this.manager;

        vim.defineAction('oilOpenEntry', () => {
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
        });
        vim.defineAction('oilParent', () => {
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
        });
        vim.defineAction('oilRoot', () => {
            const file = app.workspace.getActiveFile();
            if (!file || !manager.isOilFile(file.path)) return;
            void manager.navigateToDirectory('', file.path);
        });
        vim.defineAction('oilRefresh', () => {
            const file = app.workspace.getActiveFile();
            if (!file || !manager.isOilFile(file.path)) return;
            const dirPath = manager.getDirPath(file.path) ?? '';
            void manager.navigateToDirectory(dirPath, file.path);
        });
        vim.defineAction('oilClose', () => {
            const file = app.workspace.getActiveFile();
            if (!file || !manager.isOilFile(file.path)) return;
            const filePath = file.path;
            const leaf = app.workspace.getMostRecentLeaf();
            leaf?.detach();
            manager.forgetTempPath(filePath);
            manager.cleanupOrphanedTempFiles();
        });
        vim.defineAction('oilToggleHidden', () => {
            const file = app.workspace.getActiveFile();
            if (!file || !manager.isOilFile(file.path)) return;
            manager.toggleHidden();
            const dirPath = manager.getDirPath(file.path) ?? '';
            void manager.navigateToDirectory(dirPath, file.path);
        });
        vim.defineAction('oilCycleSort', () => {
            const file = app.workspace.getActiveFile();
            if (!file || !manager.isOilFile(file.path)) return;
            manager.cycleSortKey();
            const dirPath = manager.getDirPath(file.path) ?? '';
            void manager.navigateToDirectory(dirPath, file.path);
        });
        vim.defineAction('oilYankPath', () => {
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
        });
    }

    destroy(): void {
        if (this.applied) this.remove();
    }
}
