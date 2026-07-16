import type { App } from 'obsidian';
import type { ViewUpdate } from '@codemirror/view';
import {
    createEmbeddableEditor,
    type EmbeddableMarkdownEditor,
} from '../editors/embeddable-editor';
import { getVimApi, getCmAdapterFromEditorView } from './vim-api';
import { isBundledVimActive } from './bundled-vim';
import type { CursorShapes } from '../settings';

const DEBOUNCE_FOCUS_MS = 150;
const DEBOUNCE_SYNC_MS = 100;
const MIN_HEIGHT_PX = 100;
const REPLACED_CLASS = 'vim-motions-replaced';
const OVERLAY_CLASS = 'vim-motions-textarea-overlay';
const HIDDEN_CLASS = 'vim-motions-textarea-hidden';

interface ActiveReplacement {
    originalEl: HTMLTextAreaElement;
    wrapper: HTMLElement;
    editor: EmbeddableMarkdownEditor;
    syncTimer: number | null;
    observer: MutationObserver | null;
}

function shouldSkip(el: HTMLElement): boolean {
    if ((el as HTMLTextAreaElement).disabled) return true;
    if ((el as HTMLTextAreaElement).readOnly) return true;
    if (el.classList.contains(REPLACED_CLASS)) return true;
    if (el.closest('.cm-editor')) return true;
    if (el.closest('.vim-motions-textarea-overlay')) return true;
    if (el.closest('.vim-table-cell-editor')) return true;
    if (el.closest('.vim-table-embedded-editor')) return true;
    if (el.closest('.vim-motions-picker')) return true;
    if (el.closest('.vim-motions-oil')) return true;
    if (el.closest('.cm-vim-panel')) return true;
    return false;
}

export class TextareaVimManager {
    private app: App;
    private cursorShapes: CursorShapes | undefined;
    private active: ActiveReplacement | null = null;
    private focusTimer: number | null = null;
    private handler: ((e: FocusEvent) => void) | null = null;

    constructor(app: App, cursorShapes?: CursorShapes) {
        this.app = app;
        this.cursorShapes = cursorShapes;
    }

    install(): void {
        if (this.handler) return;
        this.handler = (e: FocusEvent) => this.onFocusIn(e);
        activeDocument.addEventListener('focusin', this.handler, true);
    }

    updateOptions(cursorShapes?: CursorShapes): void {
        this.cursorShapes = cursorShapes;
    }

    destroy(): void {
        this.cancelPendingFocus();
        this.teardownActive();
        if (this.handler) {
            activeDocument.removeEventListener('focusin', this.handler, true);
            this.handler = null;
        }
    }

    destroyAll(): void {
        this.destroy();
    }

    private cancelPendingFocus(): void {
        if (this.focusTimer !== null) {
            window.clearTimeout(this.focusTimer);
            this.focusTimer = null;
        }
    }

    private onFocusIn(e: FocusEvent): void {
        const target = e.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        if (shouldSkip(target)) return;

        this.cancelPendingFocus();
        this.focusTimer = window.setTimeout(() => {
            this.focusTimer = null;
            if (activeDocument.activeElement !== target) return;
            if (target.classList.contains(REPLACED_CLASS)) return;
            this.replace(target);
        }, DEBOUNCE_FOCUS_MS);
    }

    private replace(el: HTMLTextAreaElement): void {
        this.teardownActive();

        const value = el.value;
        const computed = window.getComputedStyle(el);

        el.classList.add(REPLACED_CLASS);
        el.classList.add(HIDDEN_CLASS);

        const wrapper = createDiv({ cls: OVERLAY_CLASS });
        wrapper.style.width = computed.width;
        const cssHeight = parseFloat(computed.height) || 0;
        const contentHeight = el.scrollHeight;
        const effectiveHeight = Math.max(
            cssHeight,
            contentHeight,
            MIN_HEIGHT_PX,
        );
        wrapper.style.minHeight = `${effectiveHeight}px`;
        wrapper.style.maxHeight = `max(${effectiveHeight}px, 50vh)`;
        wrapper.style.fontSize = computed.fontSize;
        wrapper.style.fontFamily = computed.fontFamily;
        wrapper.style.lineHeight = computed.lineHeight;
        wrapper.style.boxSizing = computed.boxSizing;

        el.parentElement?.insertBefore(wrapper, el.nextSibling);

        let editor: EmbeddableMarkdownEditor;
        try {
            editor = createEmbeddableEditor(this.app, wrapper, {
                value,
                cursorShapes: this.cursorShapes,
                skipActiveEditor: true,
                onEscape: () => this.handleEscapeAndRedispatch(),
                onBlur: () => this.handleBlur(),
                onChange: (update: ViewUpdate) =>
                    this.scheduleSyncToElement(update),
            });
        } catch (err) {
            console.warn(
                '[Vim Motions] Failed to create textarea vim editor:',
                err,
            );
            this.restoreElement(el);
            return;
        }

        let observer: MutationObserver | null = null;
        const parentContainer = el.closest('.modal-container');
        if (parentContainer) {
            observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    const nodes = m.removedNodes;
                    for (let i = 0; i < nodes.length; i++) {
                        const removed = nodes.item(i);
                        if (
                            removed &&
                            (removed === parentContainer ||
                                removed.contains(wrapper))
                        ) {
                            this.teardownActive();
                            return;
                        }
                    }
                }
            });
            const observeTarget =
                parentContainer.parentElement ?? activeDocument.body;
            observer.observe(observeTarget, { childList: true });
        }

        this.active = {
            originalEl: el,
            wrapper,
            editor,
            syncTimer: null,
            observer,
        };

        editor.load();
        editor.focus();

        this.enterInsertMode(editor);
    }

    private enterInsertMode(editor: EmbeddableMarkdownEditor): void {
        if (!isBundledVimActive()) return;
        const adapter = getCmAdapterFromEditorView(editor.getEditorView());
        if (!adapter) return;
        const vim = getVimApi();
        vim?.handleKey(adapter, 'i');
    }

    private scheduleSyncToElement(_update: ViewUpdate): void {
        if (!this.active) return;
        const { originalEl, editor } = this.active;

        if (this.active.syncTimer !== null) {
            window.clearTimeout(this.active.syncTimer);
        }
        this.active.syncTimer = window.setTimeout(() => {
            if (!this.active) return;
            this.active.syncTimer = null;
            this.syncNow(originalEl, editor);
        }, DEBOUNCE_SYNC_MS);
    }

    private syncNow(
        el: HTMLTextAreaElement,
        editor: EmbeddableMarkdownEditor,
    ): void {
        const content = editor.getValue();
        if (el.value !== content) {
            el.value = content;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    private handleEscapeAndRedispatch(): void {
        if (!this.active) return;
        const { originalEl, editor } = this.active;
        this.syncNow(originalEl, editor);
        this.teardownActive();
        originalEl.focus();
        originalEl.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );
    }

    private handleBlur(): void {
        if (!this.active) return;
        const { wrapper } = this.active;
        window.requestAnimationFrame(() => {
            if (!this.active) return;
            const newFocus = activeDocument.activeElement;
            if (newFocus && wrapper.contains(newFocus)) return;
            const { originalEl, editor } = this.active;
            this.syncNow(originalEl, editor);
            this.teardownActive();
        });
    }

    private teardownActive(): void {
        if (!this.active) return;
        const { originalEl, wrapper, editor, syncTimer, observer } =
            this.active;
        this.active = null;

        if (syncTimer !== null) window.clearTimeout(syncTimer);

        // Flush any pending content to the original textarea before destroying
        // the editor — otherwise rapid teardown (e.g. hint-mode clicking Save
        // while a debounced sync is pending) loses the latest edits.
        try {
            this.syncNow(originalEl, editor);
        } catch {
            /* editor may already be detached */
        }

        observer?.disconnect();

        try {
            editor.destroy();
        } catch {
            /* editor may already be detached */
        }

        wrapper.remove();
        this.restoreElement(originalEl);
    }

    private restoreElement(el: HTMLTextAreaElement): void {
        el.classList.remove(REPLACED_CLASS);
        el.classList.remove(HIDDEN_CLASS);
    }
}
