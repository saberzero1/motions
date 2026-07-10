import { type App, Modal, Notice, Plugin } from 'obsidian';
import type { VimMotionsSettings } from '../settings';
import { OilCache } from './cache';
import { renderDirectory } from './render';
import { parseBufferLines } from './parser';
import { computeDiff, mergeMultiBufferDiffs, type BufferDiff } from './diff';
import { validateActions, executeActions } from './actions';
import type { OilEntry, OilMergedDiff } from './types';
import { OIL_VIEW_TYPE, type OilView } from './oil-view';

export function entriesToBufferText(entries: OilEntry[]): string {
    if (entries.length === 0) return '';
    const maxId = entries.reduce((m, e) => Math.max(m, e.id), 0);
    const idWidth = Math.max(3, String(maxId).length);
    return entries
        .map((e) => {
            const idStr = String(e.id).padStart(idWidth, '0');
            const typeChar = e.type === 'folder' ? 'd' : 'f';
            return `/${idStr} ${typeChar} ${e.name}`;
        })
        .join('\n');
}

export class OilManager {
    private showHidden = false;
    private sortKey: 'name' | 'mtime' | 'size' = 'name';
    private refreshDebounceTimer: number | null = null;

    constructor(
        private readonly app: App,
        private readonly cache: OilCache,
        private readonly settings: VimMotionsSettings,
    ) {}

    install(plugin: Plugin): void {
        this.cleanupLegacyTempFiles();
        plugin.registerEvent(
            this.app.vault.on('create', (file) => {
                const dirPath = this.getParentDirPath(file.path);
                this.refreshDirIfOpen(dirPath);
            }),
        );
        plugin.registerEvent(
            this.app.vault.on('delete', (file) => {
                const dirPath = this.getParentDirPath(file.path);
                this.refreshDirIfOpen(dirPath);
            }),
        );
        plugin.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                const oldDir = this.getParentDirPath(oldPath);
                const newDir = this.getParentDirPath(file.path);
                this.refreshDirIfOpen(oldDir);
                if (newDir !== oldDir) {
                    this.refreshDirIfOpen(newDir);
                }
            }),
        );
    }

    isOilView(view: unknown): view is OilView {
        const viewType = (
            view as { getViewType?: () => string }
        )?.getViewType?.();
        return viewType === OIL_VIEW_TYPE;
    }

    async openOil(dirPath: string): Promise<void> {
        const leaf = this.app.workspace.getLeaf(false);
        const previousFile = this.app.workspace.getActiveFile()?.path ?? null;
        await leaf.setViewState({
            type: OIL_VIEW_TYPE,
            state: { dirPath, previousFile },
        });
    }

    async commit(): Promise<void> {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;
        if (!this.isOilView(view)) return;
        const dirPath = view.getDirPath();
        const content = view.getBufferContent();
        const parsed = parseBufferLines(content);
        const snapshot = this.cache.snapshot(dirPath);
        const bufferDiff: BufferDiff = {
            parentPath: dirPath,
            diff: computeDiff(parsed, snapshot, dirPath),
        };
        const merged = mergeMultiBufferDiffs([bufferDiff], this.cache);

        const totalOps =
            merged.creates.length +
            merged.renames.length +
            merged.deletes.length +
            merged.moves.length;
        if (totalOps === 0) {
            new Notice('Oil: no changes');
            return;
        }

        const validation = validateActions(merged, this.app);
        if (!validation.valid) {
            new Notice(
                `Oil: validation failed\n${validation.errors.join('\n')}`,
            );
            return;
        }

        if (merged.deletes.length >= this.getDeleteThreshold()) {
            const confirmed = await this.confirmDestructive(merged);
            if (!confirmed) {
                new Notice('Oil: commit cancelled');
                return;
            }
        }

        const result = await executeActions(merged, this.app);
        const msg = [];
        if (result.completed.length > 0)
            msg.push(`${result.completed.length} completed`);
        if (result.failed.length > 0)
            msg.push(`${result.failed.length} failed`);
        if (result.skipped.length > 0)
            msg.push(`${result.skipped.length} skipped`);
        new Notice(`Oil: ${msg.join(', ')}`);

        view.refreshContent(dirPath);
    }

    async navigateToDirectory(dirPath: string): Promise<void> {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;
        if (!this.isOilView(view)) return;
        view.setDirectory(dirPath);
    }

    cleanup(): void {
        if (this.refreshDebounceTimer !== null) {
            window.clearTimeout(this.refreshDebounceTimer);
            this.refreshDebounceTimer = null;
        }
    }

    getEntryAtLine(lineText: string): OilEntry | undefined {
        const match = lineText.match(/^\/(\d+)\s+[df]\s/);
        if (!match || !match[1]) return undefined;
        const id = Number(match[1]);
        if (!id) return undefined;
        return this.cache.getEntry(id);
    }

    toggleHidden(): void {
        this.showHidden = !this.showHidden;
        new Notice(`Oil: hidden files ${this.showHidden ? 'shown' : 'hidden'}`);
    }

    cycleSortKey(): void {
        const order: Array<'name' | 'mtime' | 'size'> = [
            'name',
            'mtime',
            'size',
        ];
        const idx = order.indexOf(this.sortKey);
        this.sortKey = order[(idx + 1) % order.length]!;
        new Notice(`Oil: sort by ${this.sortKey}`);
    }

    navigateToParent(): void {
        const view = this.getActiveOilView();
        if (!view) return;
        const dirPath = view.getDirPath();
        if (!dirPath) {
            new Notice('Oil: already at vault root');
            return;
        }
        const parentPath = dirPath.includes('/')
            ? dirPath.substring(0, dirPath.lastIndexOf('/'))
            : '';
        void this.navigateToDirectory(parentPath);
    }

    refreshActiveOilView(): void {
        const view = this.getActiveOilView();
        if (!view) return;
        view.refreshContent();
    }

    yankPathAtCursor(): void {
        const view = this.getActiveOilView();
        if (!view) return;
        const entry = this.getEntryAtCursor(view);
        if (!entry) return;
        void navigator.clipboard.writeText(entry.path);
        new Notice(`Oil: yanked ${entry.path}`);
    }

    revealAtCursor(): void {
        const view = this.getActiveOilView();
        if (!view) return;
        const entry = this.getEntryAtCursor(view);
        if (!entry) return;
        const target = this.app.vault.getAbstractFileByPath(entry.path);
        if (!target) return;
        const fileExplorer = (
            this.app as unknown as {
                internalPlugins?: {
                    plugins?: Record<
                        string,
                        { instance?: { revealInFolder?: (f: unknown) => void } }
                    >;
                };
            }
        ).internalPlugins?.plugins?.['file-explorer']?.instance;
        if (fileExplorer?.revealInFolder) {
            fileExplorer.revealInFolder(target);
        } else {
            (
                this.app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById('file-explorer:reveal-active-file');
        }
    }

    openEntryAtCursor(): void {
        const view = this.getActiveOilView();
        if (!view) return;
        const entry = this.getEntryAtCursor(view);
        if (!entry) return;
        if (entry.type === 'folder') {
            void this.navigateToDirectory(entry.path);
        } else {
            void this.app.workspace.openLinkText(entry.path, '');
        }
    }

    private getActiveOilView(): OilView | null {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;
        return this.isOilView(view) ? view : null;
    }

    private getEntryAtCursor(view: OilView): OilEntry | undefined {
        const editorView = view.getEditorView();
        if (!editorView) return undefined;
        const pos = editorView.state.selection.main.head;
        const line = editorView.state.doc.lineAt(pos).number - 1;
        const lineText = view.getLineText(line);
        return this.getEntryAtLine(lineText);
    }

    private scheduleRefresh(view: OilView): void {
        if (this.refreshDebounceTimer !== null) {
            window.clearTimeout(this.refreshDebounceTimer);
        }
        this.refreshDebounceTimer = window.setTimeout(() => {
            this.refreshDebounceTimer = null;
            view.refreshContent();
        }, 200);
    }

    private refreshDirIfOpen(dirPath: string): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (this.isOilView(view) && view.getDirPath() === dirPath) {
                this.scheduleRefresh(view);
            }
        });
    }

    private getParentDirPath(path: string): string {
        const idx = path.lastIndexOf('/');
        return idx === -1 ? '' : path.slice(0, idx);
    }

    renderDirectoryToBuffer(dirPath: string): string {
        const showHidden = this.settings.oilShowHiddenFiles ?? this.showHidden;
        const sort = this.settings.oilDefaultSort ?? this.sortKey;
        const rawEntries = renderDirectory(this.app, dirPath, showHidden, sort);
        const entries = this.cache.loadDirectory(dirPath, rawEntries);
        return entriesToBufferText(entries);
    }

    private cleanupLegacyTempFiles(): void {
        for (const file of this.app.vault.getFiles()) {
            const name = file.name;
            if (name.startsWith('oil~')) {
                void this.app.vault.adapter.remove(file.path).catch(() => {});
            }
        }
    }

    private getDeleteThreshold(): number {
        return this.settings?.oilConfirmDeleteThreshold ?? 1;
    }

    private confirmDestructive(diff: OilMergedDiff): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new OilConfirmModal(this.app, diff, resolve);
            modal.open();
        });
    }
}

class OilConfirmModal extends Modal {
    constructor(
        app: App,
        private readonly diff: OilMergedDiff,
        private readonly resolve: (confirmed: boolean) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Confirm oil changes' });

        const summary: string[] = [];
        if (this.diff.creates.length > 0)
            summary.push(`Create ${this.diff.creates.length}`);
        if (this.diff.moves.length > 0)
            summary.push(`Move ${this.diff.moves.length}`);
        if (this.diff.renames.length > 0)
            summary.push(`Rename ${this.diff.renames.length}`);
        if (this.diff.deletes.length > 0)
            summary.push(`Delete ${this.diff.deletes.length}`);

        contentEl.createEl('p', { text: summary.join(', ') + '.' });

        if (this.diff.deletes.length > 0) {
            contentEl.createEl('h4', { text: 'Files to delete' });
            const ul = contentEl.createEl('ul');
            for (const del of this.diff.deletes) {
                ul.createEl('li', { text: del.entry.path });
            }
        }

        if (this.diff.moves.length > 0) {
            contentEl.createEl('h4', { text: 'Files to move' });
            const ul = contentEl.createEl('ul');
            for (const move of this.diff.moves) {
                const dest = move.newParentPath
                    ? `${move.newParentPath}/${move.newName}`
                    : move.newName;
                ul.createEl('li', {
                    text: `${move.entry.path} → ${dest}`,
                });
            }
        }

        const btnContainer = contentEl.createDiv({
            cls: 'modal-button-container',
        });
        const confirmBtn = btnContainer.createEl('button', {
            text: 'Confirm',
            cls: 'mod-cta',
        });
        confirmBtn.addEventListener('click', () => {
            this.resolve(true);
            this.close();
        });
        btnContainer
            .createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => {
                this.resolve(false);
                this.close();
            });
        window.requestAnimationFrame(() => confirmBtn.focus());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
