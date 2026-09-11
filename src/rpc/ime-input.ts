import type { EditorView } from '@codemirror/view';
import { runCleanups } from '../util/cleanup';

const INPUT_CLASS = 'vim-motions-rpc-ime-input';

export class NeovimImeInput {
    private editorView: EditorView | null = null;
    private input: HTMLInputElement | null = null;
    private composing = false;
    private cancelled = false;

    constructor(
        private readonly onCommit: (text: string) => void,
        private readonly onCancel: () => void,
        private readonly onKeydown: (event: KeyboardEvent) => void,
    ) {}

    install(editorView: EditorView | null): void {
        this.remove();
        if (!editorView) return;
        this.editorView = editorView;
        const input = editorView.dom.createEl('input');
        input.className = INPUT_CLASS;
        input.type = 'text';
        input.tabIndex = -1;
        input.autocomplete = 'off';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.addEventListener('keydown', this.handleKeydown, true);
        input.addEventListener('compositionstart', this.handleCompositionStart);
        input.addEventListener(
            'compositionupdate',
            this.handleCompositionUpdate,
        );
        input.addEventListener('compositionend', this.handleCompositionEnd);
        input.addEventListener('input', this.handleInput);
        input.addEventListener('blur', this.handleBlur);
        editorView.scrollDOM.addEventListener('scroll', this.updatePosition, {
            passive: true,
        });
        this.input = input;
        this.updatePosition();
    }

    remove(): void {
        this.cancel();
        const editorView = this.editorView;
        const input = this.input;
        this.editorView = null;
        this.input = null;
        runCleanups(
            [
                () =>
                    editorView?.scrollDOM.removeEventListener(
                        'scroll',
                        this.updatePosition,
                    ),
                () =>
                    input?.removeEventListener(
                        'keydown',
                        this.handleKeydown,
                        true,
                    ),
                () =>
                    input?.removeEventListener(
                        'compositionstart',
                        this.handleCompositionStart,
                    ),
                () =>
                    input?.removeEventListener(
                        'compositionupdate',
                        this.handleCompositionUpdate,
                    ),
                () =>
                    input?.removeEventListener(
                        'compositionend',
                        this.handleCompositionEnd,
                    ),
                () => input?.removeEventListener('input', this.handleInput),
                () => input?.removeEventListener('blur', this.handleBlur),
                () => input?.remove(),
            ],
            'Neovim IME input',
        );
    }

    setInsertMode(insertMode: boolean): void {
        const input = this.input;
        if (!input) return;
        if (!insertMode) {
            const ownedFocus = input.ownerDocument.activeElement === input;
            this.cancel();
            if (ownedFocus)
                this.editorView?.contentDOM.focus({ preventScroll: true });
            return;
        }
        this.updatePosition();
    }

    focus(): void {
        this.updatePosition();
        this.input?.focus({ preventScroll: true });
    }

    isComposing(): boolean {
        return this.composing;
    }

    cancel(): void {
        if (!this.composing) return;
        this.composing = false;
        this.cancelled = true;
        if (this.input) this.input.value = '';
        this.onCancel();
    }

    private readonly handleKeydown = (event: KeyboardEvent): void => {
        const composing =
            this.composing ||
            event.isComposing ||
            (event as unknown as { keyCode?: number }).keyCode === 229;
        if (composing) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.cancel();
            }
            return;
        }
        this.onKeydown(event);
    };

    private readonly handleCompositionStart = (
        event: CompositionEvent,
    ): void => {
        event.stopPropagation();
        this.composing = true;
        this.cancelled = false;
        if (this.input) this.input.value = '';
        this.updatePosition();
    };

    private readonly handleCompositionUpdate = (
        event: CompositionEvent,
    ): void => {
        event.stopPropagation();
        this.updatePosition();
    };

    private readonly handleCompositionEnd = (event: CompositionEvent): void => {
        event.stopPropagation();
        const commit = this.composing && !this.cancelled ? event.data : '';
        this.composing = false;
        this.cancelled = false;
        if (commit) this.onCommit(commit);
        queueMicrotask(this.clearValue);
    };

    private readonly handleInput = (event: Event): void => {
        event.stopPropagation();
        this.clearValue();
        if (!this.composing)
            this.editorView?.contentDOM.focus({ preventScroll: true });
    };

    private readonly clearValue = (): void => {
        if (this.input && !this.composing) this.input.value = '';
    };

    private readonly handleBlur = (): void => {
        this.cancel();
    };

    private readonly updatePosition = (): void => {
        const editorView = this.editorView;
        const input = this.input;
        if (!editorView || !input) return;
        const cursor = editorView.coordsAtPos(
            editorView.state.selection.main.head,
        );
        if (!cursor) return;
        const editor = editorView.dom.getBoundingClientRect();
        input.style.left = `${cursor.left - editor.left}px`;
        input.style.top = `${cursor.top - editor.top}px`;
        input.style.height = `${Math.max(1, cursor.bottom - cursor.top)}px`;
    };
}
