import {
    ViewPlugin,
    type EditorView,
    type ViewUpdate,
    type PluginValue,
} from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import { getVimApi } from './vim-api';
import { getJumpListInstance } from '../workspace/navigate';

/**
 * CM6 ViewPlugin that bridges the fork's within-buffer jump list to the
 * plugin-level cross-note jump list.
 *
 * Strategy: poll-and-diff. On every editor update, compare the fork's
 * jump list head/length against cached values. When they change, a
 * within-buffer jump occurred — record the cached "from" position in
 * the plugin-level jump list.
 */
class JumpListBridge implements PluginValue {
    private lastHead = 0;
    private lastLength = 0;

    update(update: ViewUpdate): void {
        const jumpList = getJumpListInstance();
        if (!jumpList) return;

        const vim = getVimApi();
        if (!vim) return;

        let jl: {
            cachedCursor?: { line: number; ch: number };
            head: number;
            tail: number;
            length: number;
        };
        try {
            jl = vim.getJumpList();
        } catch {
            return;
        }

        if (jl.length === this.lastLength && jl.head === this.lastHead) return;

        // Jump list state changed — a within-buffer jump occurred
        this.lastHead = jl.head;
        this.lastLength = jl.length;

        if (!jl.cachedCursor) return;

        const filePath = this.getFilePath(update.view);
        if (!filePath) return;

        jumpList.recordJump(filePath, jl.cachedCursor.line, jl.cachedCursor.ch);
    }

    private getFilePath(view: EditorView): string | null {
        try {
            const info = view.state.field(editorInfoField, false);
            if (info && 'file' in info) {
                const file = (info as { file?: { path?: string } }).file;
                return file?.path ?? null;
            }
        } catch {
            // editorInfoField not available in this context
        }
        return null;
    }
}

export function createJumpListBridge(): Extension {
    return ViewPlugin.fromClass(JumpListBridge);
}
