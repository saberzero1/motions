import { MarkdownView, type App } from 'obsidian';
import { runCleanups } from '../util/cleanup';
import { getEditorView } from '../util/editor';
import { neovimByteToUtf16 } from './document-sync';
import type { NeovimRedrawDispatcher } from './redraw';

interface CmdlineState {
    text: string;
    bytePosition: number;
    firstCharacter: string;
    prompt: string;
    indent: number;
    specialCharacter: string;
    specialShift: boolean;
}

function chunkText(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    let text = '';
    for (const chunk of value) {
        if (!Array.isArray(chunk) || typeof chunk[1] !== 'string') continue;
        text += chunk[1];
    }
    return text;
}

function finiteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class NeovimCmdlineOverlay {
    private readonly levels = new Map<number, CmdlineState>();
    private readonly cleanups: (() => void)[];
    private confirmMessage = '';
    private element: HTMLElement | null = null;

    constructor(
        private readonly app: App,
        dispatcher: NeovimRedrawDispatcher,
    ) {
        this.cleanups = [
            dispatcher.on('cmdline_show', (args) => this.handleShow(args)),
            dispatcher.on('cmdline_pos', (args) => this.handlePosition(args)),
            dispatcher.on('cmdline_special_char', (args) =>
                this.handleSpecialCharacter(args),
            ),
            dispatcher.on('cmdline_hide', (args) => this.handleHide(args)),
            dispatcher.on('msg_show', (args) => this.handleMessage(args)),
        ];
    }

    dispose(): void {
        runCleanups(this.cleanups, 'Neovim command-line handlers');
        this.cleanups.length = 0;
        this.levels.clear();
        this.confirmMessage = '';
        this.element?.remove();
        this.element = null;
    }

    private handleShow(value: unknown): void {
        if (!Array.isArray(value)) return;
        const text = chunkText(value[0]);
        const bytePosition = finiteNumber(value[1]);
        const indent = finiteNumber(value[4]);
        const level = finiteNumber(value[5]);
        if (
            text === null ||
            bytePosition === null ||
            indent === null ||
            level === null
        )
            return;
        this.levels.set(level, {
            text,
            bytePosition,
            firstCharacter: typeof value[2] === 'string' ? value[2] : '',
            prompt: typeof value[3] === 'string' ? value[3] : '',
            indent: Math.max(0, indent),
            specialCharacter: '',
            specialShift: false,
        });
        this.render();
    }

    private handlePosition(value: unknown): void {
        if (!Array.isArray(value)) return;
        const bytePosition = finiteNumber(value[0]);
        const level = finiteNumber(value[1]);
        if (bytePosition === null || level === null) return;
        const state = this.levels.get(level);
        if (!state) return;
        state.bytePosition = bytePosition;
        state.specialCharacter = '';
        state.specialShift = false;
        this.render();
    }

    private handleSpecialCharacter(value: unknown): void {
        if (!Array.isArray(value)) return;
        const level = finiteNumber(value[2]);
        if (typeof value[0] !== 'string' || level === null) return;
        const state = this.levels.get(level);
        if (!state) return;
        state.specialCharacter = value[0];
        state.specialShift = value[1] === true;
        this.render();
    }

    private handleHide(value: unknown): void {
        if (!Array.isArray(value)) return;
        const level = finiteNumber(value[0]);
        if (level === null) return;
        this.levels.delete(level);
        if (this.levels.size === 0) this.confirmMessage = '';
        this.render();
    }

    private handleMessage(value: unknown): void {
        if (!Array.isArray(value) || value[0] !== 'confirm') return;
        const text = chunkText(value[1]);
        if (text === null) return;
        this.confirmMessage = text;
        this.render();
    }

    private render(): void {
        if (this.levels.size === 0 && !this.confirmMessage) {
            this.element?.remove();
            this.element = null;
            return;
        }
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editorView = view ? getEditorView(view) : null;
        if (!editorView) return;
        const document = editorView.dom.ownerDocument;
        if (!this.element || this.element.ownerDocument !== document) {
            this.element?.remove();
            this.element = document.win.createDiv();
            this.element.className = 'vim-motions-rpc-cmdline';
        }
        this.element.replaceChildren();
        if (this.confirmMessage) {
            const message = document.win.createDiv();
            message.className = 'vim-motions-rpc-cmdline-message';
            message.textContent = this.confirmMessage;
            this.element.appendChild(message);
        }
        const levels = [...this.levels.entries()].sort(
            ([left], [right]) => left - right,
        );
        for (const [level, state] of levels) {
            const row = document.win.createDiv();
            row.className = 'vim-motions-rpc-cmdline-level';
            row.dataset.level = String(level);
            row.dataset.bytePosition = String(state.bytePosition);
            const caretOffset = neovimByteToUtf16(
                state.text,
                state.bytePosition,
            );
            row.dataset.caretOffset = String(caretOffset);

            const prefix = document.win.createSpan();
            prefix.className = 'vim-motions-rpc-cmdline-prefix';
            prefix.textContent =
                state.firstCharacter + state.prompt + ' '.repeat(state.indent);
            row.appendChild(prefix);

            row.append(state.text.slice(0, caretOffset));
            const caret = document.win.createSpan();
            caret.className = 'vim-motions-rpc-cmdline-caret';
            caret.textContent = state.specialCharacter;
            if (state.specialShift) caret.dataset.shift = 'true';
            row.appendChild(caret);
            row.append(state.text.slice(caretOffset));
            this.element.appendChild(row);
        }
        if (this.element.parentElement !== editorView.dom)
            editorView.dom.appendChild(this.element);
    }
}
