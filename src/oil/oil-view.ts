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

export const OIL_VIEW_TYPE = 'oil-explorer';

export class OilView extends View {
    static VIEW_TYPE = OIL_VIEW_TYPE;
    private dirPath = '';
    private previousFile: string | null = null;
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
        this.editor = createEmbeddableEditor(this.app, contentEl, {
            value: renderedContent,
            extensions: [oilConcealExtension()],
            cursorShapes: this.settings.cursorShapes,
            cls: 'vim-motions-oil-editor',
        });
        this.addChild(this.editor as unknown as Component);
        window.requestAnimationFrame(() => this.editor?.focus());
    }

    protected async onClose(): Promise<void> {
        if (this.editor) {
            this.removeChild(this.editor as unknown as Component);
            this.editor = null;
        }
    }

    getState(): { dirPath: string; previousFile: string | null } {
        return { dirPath: this.dirPath, previousFile: this.previousFile };
    }

    async setState(
        state: { dirPath?: string; previousFile?: string | null },
        _result: ViewStateResult,
    ): Promise<void> {
        const nextDir = typeof state?.dirPath === 'string' ? state.dirPath : '';
        this.dirPath = nextDir;
        if (state?.previousFile !== undefined) {
            this.previousFile = state.previousFile ?? null;
        }
        this.refreshContent();
    }

    getPreviousFile(): string | null {
        return this.previousFile;
    }

    refreshContent(dirPath?: string): void {
        if (dirPath !== undefined) {
            this.dirPath = dirPath;
        }
        if (!this.editor) return;
        const content = this.manager.renderDirectoryToBuffer(this.dirPath);
        this.cache.snapshot(this.dirPath);
        this.editor.setValue(content);
    }

    setDirectory(dirPath: string): void {
        this.dirPath = dirPath;
        this.refreshContent();
    }

    getDirPath(): string {
        return this.dirPath;
    }

    getBufferContent(): string {
        return this.editor?.getValue() ?? '';
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
