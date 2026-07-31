import {
    type Component,
    type ViewStateResult,
    type WorkspaceLeaf,
    View,
} from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { VimMotionsSettings } from '../settings';
import {
    createEmbeddableEditor,
    type EmbeddableMarkdownEditor,
} from '../editors/embeddable-editor';
import { oilConcealExtension } from './extensions';
import type { OilCache } from './cache';
import type { OilManager } from './manager';
import { getAnimatedCursorConfig } from '../vim/animated-cursor/config';
import { createAnimatedCursorExtension } from '../vim/animated-cursor/controller';

export const OIL_VIEW_TYPE = 'oil-explorer';

export class OilView extends View {
    static VIEW_TYPE = OIL_VIEW_TYPE;
    private dirPath = '';
    private previousFile: string | null = null;
    private previousViewMode: { mode: string; source?: boolean } | null = null;
    private editor: EmbeddableMarkdownEditor | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly manager: OilManager,
        private readonly cache: OilCache,
        private readonly settings: VimMotionsSettings,
    ) {
        super(leaf);
    }

    getViewType(): string {
        return OilView.VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.dirPath || 'vault root';
    }

    getIcon(): string {
        return 'folder-open';
    }

    protected async onOpen(): Promise<void> {
        this.containerEl.empty();
        const contentEl = this.containerEl.createDiv({
            cls: 'vim-motions-oil-view',
        });
        const renderedContent = this.manager.renderDirectoryToBuffer(
            this.dirPath,
        );
        const oilExtensions = [oilConcealExtension()];
        if (getAnimatedCursorConfig().enabled) {
            oilExtensions.push(createAnimatedCursorExtension());
        }
        this.editor = createEmbeddableEditor(this.app, contentEl, {
            value: renderedContent,
            extensions: oilExtensions,
            cursorShapes: this.settings.cursorShapes,
            cls: 'vim-motions-oil-editor',
        });
        this.registerOilScopeKeys();
        this.addChild(this.editor as unknown as Component);
        this.focusEditor();
        void this.manager.discoverAndMergeHidden(this.dirPath, renderedContent);
    }

    private registerOilScopeKeys(): void {
        if (!this.editor) return;
        const blurAndRun = (fn: () => void) => {
            this.editor?.getEditorView()?.contentDOM.blur();
            fn();
        };
        this.editor.registerScopeKey(['Ctrl'], 'T', (e) => {
            e.preventDefault();
            blurAndRun(() => this.manager.openEntryAtCursorInNewTab());
            return false;
        });
        this.editor.registerScopeKey(['Ctrl'], 'S', (e) => {
            e.preventDefault();
            blurAndRun(() => this.manager.openEntryAtCursorInSplit('vertical'));
            return false;
        });
        this.editor.registerScopeKey(['Ctrl'], 'H', (e) => {
            e.preventDefault();
            blurAndRun(() =>
                this.manager.openEntryAtCursorInSplit('horizontal'),
            );
            return false;
        });
        this.editor.registerScopeKey(['Ctrl'], 'L', (e) => {
            e.preventDefault();
            this.manager.refreshActiveOilView();
            return false;
        });
        this.editor.registerScopeKey(['Ctrl'], 'C', (e) => {
            e.preventDefault();
            this.manager.closeOil();
            return false;
        });
    }

    focusEditor(): void {
        window.requestAnimationFrame(() => this.editor?.focus());
    }

    private notifyHeaderChanged(): void {
        (
            this.leaf as unknown as { updateHeader?: () => void }
        ).updateHeader?.();
    }

    protected async onClose(): Promise<void> {
        if (this.editor) {
            this.editor.destroy();
            this.removeChild(this.editor as unknown as Component);
            this.editor = null;
        }
    }

    getState(): {
        dirPath: string;
        previousFile: string | null;
        previousViewMode: { mode: string; source?: boolean } | null;
    } {
        return {
            dirPath: this.dirPath,
            previousFile: this.previousFile,
            previousViewMode: this.previousViewMode,
        };
    }

    async setState(
        state: {
            dirPath?: string;
            previousFile?: string | null;
            previousViewMode?: { mode: string; source?: boolean } | null;
        },
        _result: ViewStateResult,
    ): Promise<void> {
        const nextDir = typeof state?.dirPath === 'string' ? state.dirPath : '';
        this.dirPath = nextDir;
        this.notifyHeaderChanged();
        if (state?.previousFile !== undefined) {
            this.previousFile = state.previousFile ?? null;
        }
        if (state?.previousViewMode !== undefined) {
            this.previousViewMode = state.previousViewMode ?? null;
        }
        this.refreshContent();
    }

    getPreviousFile(): string | null {
        return this.previousFile;
    }

    getPreviousViewMode(): { mode: string; source?: boolean } | null {
        return this.previousViewMode;
    }

    refreshContent(dirPath?: string): void {
        if (dirPath !== undefined) {
            this.dirPath = dirPath;
            this.notifyHeaderChanged();
        }
        if (!this.editor) return;
        const content = this.manager.renderDirectoryToBuffer(this.dirPath);
        this.cache.snapshot(this.dirPath);
        this.editor.setValue(content);
        void this.manager.discoverAndMergeHidden(this.dirPath, content);
    }

    setDirectory(dirPath: string): void {
        this.dirPath = dirPath;
        this.notifyHeaderChanged();
        this.refreshContent();
    }

    getDirPath(): string {
        return this.dirPath;
    }

    getBufferContent(): string {
        return this.editor?.getValue() ?? '';
    }

    setEditorContent(content: string): void {
        if (!this.editor) return;
        this.editor.setValue(content);
    }

    getLineText(line: number): string {
        const editorView = this.editor?.getEditorView();
        if (!editorView) return '';
        if (line < 0 || line >= editorView.state.doc.lines) return '';
        return editorView.state.doc.line(line + 1).text;
    }

    getEditorView(): EditorView | null {
        return this.editor?.getEditorView() ?? null;
    }
}

export function createOilViewFactory(
    manager: OilManager,
    cache: OilCache,
    settings: VimMotionsSettings,
): (leaf: WorkspaceLeaf) => OilView {
    return (leaf: WorkspaceLeaf) => new OilView(leaf, manager, cache, settings);
}
