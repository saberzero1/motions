import { type App, MarkdownView, Modal, Notice, Plugin } from 'obsidian';
import type { VimMotionsSettings } from '../settings';
import { OilCache } from './cache';
import { renderDirectory } from './render';
import { parseBufferLines } from './parser';
import { computeDiff, mergeMultiBufferDiffs, type BufferDiff } from './diff';
import { validateActions, executeActions } from './actions';
import type { OilEntry, OilMergedDiff } from './types';

export const OIL_TEMP_PREFIX = 'oil~';

function entriesToBufferText(entries: OilEntry[]): string {
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
    private tempToDir = new Map<string, string>();
    private showHidden = false;
    private sortKey: 'name' | 'mtime' | 'size' = 'name';
    private refreshDebounceTimer: number | null = null;

    constructor(
        private readonly app: App,
        private readonly cache: OilCache,
        private readonly settings: VimMotionsSettings,
    ) {}

    install(plugin: Plugin): void {
        this.cleanupStaleFiles();
        plugin.registerEvent(
            this.app.vault.on('create', (file) => {
                if (this.isOilFile(file.path)) return;
                const dirPath = this.getParentDirPath(file.path);
                this.refreshDirIfOpen(dirPath);
            }),
        );
        plugin.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (this.isOilFile(file.path)) return;
                const dirPath = this.getParentDirPath(file.path);
                this.refreshDirIfOpen(dirPath);
            }),
        );
        plugin.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (this.isOilFile(file.path)) return;
                const oldDir = this.getParentDirPath(oldPath);
                const newDir = this.getParentDirPath(file.path);
                this.refreshDirIfOpen(oldDir);
                if (newDir !== oldDir) {
                    this.refreshDirIfOpen(newDir);
                }
            }),
        );
    }

    cleanupOrphanedTempFiles(): void {
        const openPaths = new Set<string>();
        this.app.workspace.iterateAllLeaves((leaf) => {
            const filePath = (
                leaf.view as unknown as { file?: { path?: string } }
            ).file?.path;
            if (filePath) openPaths.add(filePath);
        });

        const orphaned: string[] = [];
        for (const tempPath of this.tempToDir.keys()) {
            if (!openPaths.has(tempPath)) {
                orphaned.push(tempPath);
            }
        }

        for (const tempPath of orphaned) {
            this.tempToDir.delete(tempPath);
            this.removeFromIgnoreFilters(tempPath);
            void this.app.vault.adapter.remove(tempPath).catch(() => {});
        }
        if (orphaned.length > 0) {
            if (this.tempToDir.size === 0) {
                this.unhideFromExplorer();
            } else {
                this.rebuildExplorerCss();
            }
        }
    }

    isOilFile(path: string): boolean {
        const name = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
        return name.startsWith(OIL_TEMP_PREFIX);
    }

    async openOil(dirPath: string): Promise<void> {
        const tempPath = this.getTempFilePath(dirPath);
        const content = this.renderDirectoryToBuffer(dirPath);
        const existing = this.app.vault.getAbstractFileByPath(tempPath);
        if (existing) {
            await this.app.vault.modify(existing as import('obsidian').TFile, content);
        } else {
            await this.app.vault.create(tempPath, content);
        }
        this.addToIgnoreFilters(tempPath);
        this.hideFromExplorer(tempPath);
        this.tempToDir.set(tempPath, dirPath);
        await this.app.workspace.openLinkText(tempPath, '');
        await this.forceSourceMode();
    }

    async commit(filePath: string): Promise<void> {
        const dirPath = this.getDirPath(filePath);
        if (dirPath === undefined) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const content = view.editor.getValue();
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
            new Notice(`Oil: validation failed\n${validation.errors.join('\n')}`);
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
        if (result.failed.length > 0) msg.push(`${result.failed.length} failed`);
        if (result.skipped.length > 0)
            msg.push(`${result.skipped.length} skipped`);
        new Notice(`Oil: ${msg.join(', ')}`);

        await this.navigateToDirectory(dirPath, filePath);
    }

    async navigateToDirectory(
        dirPath: string,
        currentTempPath: string,
    ): Promise<void> {
        const newTempPath = this.getTempFilePath(dirPath);
        const content = this.renderDirectoryToBuffer(dirPath);

        if (newTempPath !== currentTempPath) {
            const file = this.app.vault.getAbstractFileByPath(currentTempPath);
            if (file) {
                await this.app.fileManager.renameFile(file, newTempPath);
                this.removeFromIgnoreFilters(currentTempPath);
                this.addToIgnoreFilters(newTempPath);
            }
            this.tempToDir.delete(currentTempPath);
        }

        const renamedFile = this.app.vault.getAbstractFileByPath(newTempPath);
        if (renamedFile) {
            await this.app.vault.modify(renamedFile as import('obsidian').TFile, content);
        }
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file?.path === newTempPath) {
            view.editor.setValue(content);
        }
        this.tempToDir.set(newTempPath, dirPath);
    }

    async cleanup(): Promise<void> {
        if (this.refreshDebounceTimer !== null) {
            window.clearTimeout(this.refreshDebounceTimer);
            this.refreshDebounceTimer = null;
        }
        for (const file of this.app.vault.getFiles()) {
            if (this.isOilFile(file.path)) {
                this.removeFromIgnoreFilters(file.path);
                await this.app.vault.adapter.remove(file.path);
            }
        }
        this.tempToDir.clear();
        this.unhideFromExplorer();
    }

    getDirPath(tempFilePath: string): string | undefined {
        return this.tempToDir.get(tempFilePath);
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
        new Notice(
            `Oil: hidden files ${this.showHidden ? 'shown' : 'hidden'}`,
        );
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

    forgetTempPath(tempPath: string): void {
        this.tempToDir.delete(tempPath);
    }

    private scheduleRefresh(dirPath: string, tempPath: string): void {
        if (this.refreshDebounceTimer !== null) {
            window.clearTimeout(this.refreshDebounceTimer);
        }
        this.refreshDebounceTimer = window.setTimeout(() => {
            this.refreshDebounceTimer = null;
            void this.navigateToDirectory(dirPath, tempPath);
        }, 200);
    }

    private refreshDirIfOpen(dirPath: string): void {
        for (const [tempPath, mappedDir] of this.tempToDir.entries()) {
            if (mappedDir === dirPath) {
                this.scheduleRefresh(dirPath, tempPath);
                return;
            }
        }
    }

    private getParentDirPath(path: string): string {
        const idx = path.lastIndexOf('/');
        return idx === -1 ? '' : path.slice(0, idx);
    }

    private renderDirectoryToBuffer(dirPath: string): string {
        const showHidden = this.settings.oilShowHiddenFiles ?? this.showHidden;
        const sort = this.settings.oilDefaultSort ?? this.sortKey;
        const rawEntries = renderDirectory(
            this.app,
            dirPath,
            showHidden,
            sort,
        );
        const entries = this.cache.loadDirectory(dirPath, rawEntries);
        return entriesToBufferText(entries);
    }

    private getTempFilePath(dirPath: string): string {
        const encoded = dirPath ? dirPath.replace(/\//g, '_') : '_root';
        return OIL_TEMP_PREFIX + encoded + '.md';
    }

    private async forceSourceMode(): Promise<void> {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return;
        const viewState = leaf.getViewState();
        if (viewState.state?.mode !== 'source') {
            viewState.state = { ...viewState.state, mode: 'source', source: true };
            await leaf.setViewState(viewState);
        }
    }

    private cleanupStaleFiles(): void {
        for (const file of this.app.vault.getFiles()) {
            if (this.isOilFile(file.path)) {
                this.removeFromIgnoreFilters(file.path);
                void this.app.vault.adapter.remove(file.path);
            }
        }
        this.unhideFromExplorer();
    }

    private getIgnoreFilters(): string[] {
        const vault = this.app.vault as unknown as {
            getConfig?: (key: string) => unknown;
        };
        const raw = vault.getConfig?.('userIgnoreFilters');
        return Array.isArray(raw) ? (raw as string[]) : [];
    }

    private setIgnoreFilters(filters: string[]): void {
        const vault = this.app.vault as unknown as {
            setConfig?: (key: string, value: unknown) => void;
        };
        vault.setConfig?.('userIgnoreFilters', filters);
    }

    private addToIgnoreFilters(path: string): void {
        const filters = this.getIgnoreFilters();
        if (!filters.includes(path)) {
            filters.push(path);
            this.setIgnoreFilters(filters);
        }
    }

    private removeFromIgnoreFilters(path: string): void {
        const filters = this.getIgnoreFilters();
        const updated = filters.filter((f) => f !== path);
        if (updated.length !== filters.length) {
            this.setIgnoreFilters(updated);
        }
    }

    private hideFromExplorer(path: string): void {
        const doc = activeDocument;
        const styleId = 'vim-motions-oil-hide';
        let style = doc.getElementById(styleId) as HTMLStyleElement | null;
        if (!style) {
            style = doc.createElement('style');
            style.id = styleId;
            doc.head.appendChild(style);
        }
        const paths = new Set<string>();
        for (const tempPath of this.tempToDir.keys()) {
            paths.add(tempPath);
        }
        paths.add(path);
        const selectors = Array.from(paths).map(
            (p) =>
                `.nav-file-title[data-path="${p.replace(/"/g, '\\"')}"]`,
        );
        style.textContent = selectors.join(',\n') + ' { display: none; }';
        this.refreshFileExplorer();
    }

    private rebuildExplorerCss(): void {
        if (this.tempToDir.size === 0) {
            this.unhideFromExplorer();
            return;
        }
        const first = this.tempToDir.keys().next().value;
        if (first) this.hideFromExplorer(first);
    }

    private unhideFromExplorer(): void {
        const doc = activeDocument;
        const style = doc.getElementById('vim-motions-oil-hide');
        if (style) style.remove();
        this.refreshFileExplorer();
    }

    private refreshFileExplorer(): void {
        for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
            const view = leaf.view as unknown as { requestSort?: () => void };
            view.requestSort?.();
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
        btnContainer
            .createEl('button', { text: 'Confirm', cls: 'mod-cta' })
            .addEventListener('click', () => {
                this.resolve(true);
                this.close();
            });
        btnContainer
            .createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => {
                this.resolve(false);
                this.close();
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
