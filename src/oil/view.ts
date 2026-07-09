import { type App, ItemView, Modal, Notice, type WorkspaceLeaf } from 'obsidian';
import type { VimMotionsSettings } from '../settings';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, type ViewUpdate } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';
import { oilConcealExtension } from './extensions';
import { OilCache } from './cache';
import { renderDirectory } from './render';
import { parseBufferLines } from './parser';
import { computeDiff, mergeMultiBufferDiffs, type BufferDiff } from './diff';
import { validateActions, executeActions } from './actions';
import type { OilEntry, OilMergedDiff } from './types';

export const OIL_VIEW_TYPE = 'vim-motions-oil';

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

export class OilView extends ItemView {
    private editorView: EditorView | null = null;
    private currentPath = '';
    private cache: OilCache;
    private showHidden = false;
    private sortKey: 'name' | 'mtime' | 'size' = 'name';
    private currentEntries: OilEntry[] = [];

    private settings: VimMotionsSettings | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly oilApp: App,
        cache?: OilCache,
        settings?: VimMotionsSettings,
    ) {
        super(leaf);
        this.cache = cache ?? new OilCache();
        this.settings = settings ?? null;
    }

    getViewType(): string {
        return OIL_VIEW_TYPE;
    }

    getDisplayText(): string {
        const display = this.currentPath || '/';
        return `Oil: ${display}`;
    }

    getIcon(): string {
        return 'folder-open';
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('vim-motions-oil-container');

        const extensions: Extension[] = [
            vim(),
            drawSelection(),
            EditorView.lineWrapping,
            oilConcealExtension(),
            EditorView.updateListener.of((update: ViewUpdate) => {
                this.constrainCursor(update);
            }),
            EditorView.theme({
                '&': { height: '100%', fontSize: '14px' },
                '.cm-content': {
                    fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                },
                '.cm-focused': { outline: 'none' },
                '.cm-scroller': { overflow: 'auto' },
            }),
        ];

        this.editorView = new EditorView({
            state: EditorState.create({ doc: '', extensions }),
            parent: container,
        });

        this.loadDirectory(this.currentPath);
        this.editorView.focus();
    }

    async onClose(): Promise<void> {
        this.editorView?.destroy();
        this.editorView = null;
    }

    loadDirectory(dirPath: string): void {
        this.currentPath = dirPath;
        const showHidden = this.settings?.oilShowHiddenFiles ?? this.showHidden;
        const sort = this.settings?.oilDefaultSort ?? this.sortKey;
        const rawEntries = renderDirectory(
            this.oilApp,
            dirPath,
            showHidden,
            sort,
        );
        this.currentEntries = this.cache.loadDirectory(dirPath, rawEntries);
        this.replaceBuffer(entriesToBufferText(this.currentEntries));
        (
            this.leaf as unknown as { updateHeader?: () => void }
        ).updateHeader?.();
    }

    private replaceBuffer(text: string): void {
        if (!this.editorView) return;
        this.editorView.dispatch({
            changes: {
                from: 0,
                to: this.editorView.state.doc.length,
                insert: text,
            },
        });
    }

    private collectBufferDiff(): BufferDiff | null {
        if (!this.editorView) return null;
        const bufferText = this.editorView.state.doc.toString();
        const parsed = parseBufferLines(bufferText);
        const snapshot = this.cache.snapshot(this.currentPath);
        return {
            parentPath: this.currentPath,
            diff: computeDiff(parsed, snapshot, this.currentPath),
        };
    }

    private getAllOilViews(): OilView[] {
        const views: OilView[] = [];
        this.oilApp.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view?.getViewType() === OIL_VIEW_TYPE) {
                views.push(leaf.view as OilView);
            }
        });
        return views;
    }

    async commit(): Promise<void> {
        const allViews = this.getAllOilViews();
        const bufferDiffs: BufferDiff[] = [];
        for (const view of allViews) {
            const bd = view.collectBufferDiff();
            if (bd) bufferDiffs.push(bd);
        }

        const merged = mergeMultiBufferDiffs(bufferDiffs, this.cache);

        const totalOps =
            merged.creates.length +
            merged.renames.length +
            merged.deletes.length +
            merged.moves.length;
        if (totalOps === 0) {
            new Notice('Oil: no changes');
            return;
        }

        const validation = validateActions(merged, this.oilApp);
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

        const result = await executeActions(merged, this.oilApp);
        const msg = [];
        if (result.completed.length > 0)
            msg.push(`${result.completed.length} completed`);
        if (result.failed.length > 0)
            msg.push(`${result.failed.length} failed`);
        if (result.skipped.length > 0)
            msg.push(`${result.skipped.length} skipped`);
        new Notice(`Oil: ${msg.join(', ')}`);

        for (const view of allViews) {
            view.cache.clear();
            view.loadDirectory(view.currentPath);
        }
    }

    openEntryUnderCursor(): void {
        if (!this.editorView) return;
        const { head } = this.editorView.state.selection.main;
        const line = this.editorView.state.doc.lineAt(head);
        const match = line.text.match(/^\/(\d+)\s+([df])\s/);
        if (!match || !match[1] || !match[2]) return;

        const id = Number(match[1]);
        const entry = this.cache.getEntry(id);
        if (!entry) return;

        if (entry.type === 'folder') {
            this.cache.clear();
            this.loadDirectory(entry.path);
        } else {
            void this.oilApp.workspace.openLinkText(entry.path, '');
        }
    }

    navigateToParent(): void {
        if (!this.currentPath) {
            new Notice('Oil: already at vault root');
            return;
        }
        const parentPath = this.currentPath.includes('/')
            ? this.currentPath.substring(
                  0,
                  this.currentPath.lastIndexOf('/'),
              )
            : '';
        this.cache.clear();
        this.loadDirectory(parentPath);
    }

    navigateToRoot(): void {
        this.cache.clear();
        this.loadDirectory('');
    }

    refresh(): void {
        this.cache.clear();
        this.loadDirectory(this.currentPath);
    }

    toggleHidden(): void {
        this.showHidden = !this.showHidden;
        this.refresh();
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
        this.refresh();
        new Notice(`Oil: sort by ${this.sortKey}`);
    }

    yankFilePath(): void {
        if (!this.editorView) return;
        const { head } = this.editorView.state.selection.main;
        const line = this.editorView.state.doc.lineAt(head);
        const match = line.text.match(/^\/(\d+)\s+[df]\s/);
        if (!match || !match[1]) return;

        const entry = this.cache.getEntry(Number(match[1]));
        if (!entry) return;

        void navigator.clipboard.writeText(entry.path);
        new Notice(`Oil: yanked ${entry.path}`);
    }

    private getDeleteThreshold(): number {
        return this.settings?.oilConfirmDeleteThreshold ?? 1;
    }

    private confirmDestructive(
        diff: OilMergedDiff,
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new OilConfirmModal(this.oilApp, diff, resolve);
            modal.open();
        });
    }

    // Line format: /{id} {type} {name} — keep cursor on {name} portion only
    private constrainCursor(update: ViewUpdate): void {
        if (!update.selectionSet && !update.docChanged) return;
        const view = update.view;
        const { head } = view.state.selection.main;
        const line = view.state.doc.lineAt(head);
        const match = line.text.match(/^\/\d+\s+[df]\s/);
        if (!match) return;

        const prefixLen = match[0].length;
        if (head - line.from < prefixLen) {
            window.requestAnimationFrame(() => {
                if (this.editorView) {
                    this.editorView.dispatch({
                        selection: { anchor: line.from + prefixLen },
                    });
                }
            });
        }
    }

    getEditorView(): EditorView | null {
        return this.editorView;
    }

    getState(): Record<string, string> {
        return { path: this.currentPath };
    }

    setState(
        state: Record<string, string>,
        _result: { history: boolean },
    ): Promise<void> {
        this.currentPath = state.path ?? '';
        if (this.editorView) {
            this.loadDirectory(this.currentPath);
        }
        return Promise.resolve();
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
