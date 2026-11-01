import {
    MarkdownView,
    editorInfoField,
    type App,
    type Component,
} from 'obsidian';
import { Vim, getCM, type CodeMirror } from '@replit/codemirror-vim';
import type { CmAdapter } from '../types/vim-api';
import type { JumpPoint } from '../vim/jumplist';
import { isBundledVimActive } from '../vim/bundled-vim';
import { isExternalBackendActive } from '../vim/external-mode';
import { isJumpListEnabled } from '../vim/options';
import { getEditorView } from '../util/editor';
import { getJumpListInstance } from './navigate';

interface Position {
    line: number;
    ch: number;
}

let installed = false;

/**
 * Whether every jump made within a note reaches the jump list, so a walk of
 * the list can visit them in the order they happened (#206). Only the bundled
 * engine reports them: Obsidian's own Vim key bindings and the Neovim backend
 * keep their jumps to themselves.
 */
function inNoteJumpsMirrored(): boolean {
    return installed && isBundledVimActive() && !isExternalBackendActive();
}

/**
 * The note `cm` is the editor of, while every jump made in it reaches the
 * jump list. A table cell, a preview or Oil has an editor of its own and
 * records nothing here.
 */
export function mirroredNoteOf(cm: CmAdapter): string | null {
    if (!inNoteJumpsMirrored()) return null;
    return noteOf(cm as unknown as CodeMirror);
}

function noteOf(cm: CodeMirror): string | null {
    const view = cm.cm6;
    if (!view) return null;
    const info = view.state.field(editorInfoField, false);
    if (!(info instanceof MarkdownView) || getEditorView(info) !== view) {
        return null;
    }
    return info.file?.path ?? null;
}

/** `pos` in `cm`, followed through edits for as long as `cm` lasts. */
function pointIn(cm: CodeMirror, pos: Position): JumpPoint {
    const bookmark = cm.setBookmark(pos);
    const view = cm.cm6;
    return {
        line: pos.line,
        ch: pos.ch,
        mark: {
            // A note opened in the same tab gets a new editor (measured), and
            // the old one's bookmarks stop following edits.
            find: () => (getCM(view) === cm ? bookmark.find() : undefined),
            clear: () => bookmark.clear(),
        },
    };
}

/** The cursor of `cm`, followed through edits as a jump's position is. */
export function cursorPoint(cm: CmAdapter): JumpPoint {
    const adapter = cm as unknown as CodeMirror;
    return pointIn(adapter, adapter.getCursor());
}

function recordMirrored(cm: CodeMirror, from: Position, to: Position): void {
    const jumpList = getJumpListInstance();
    const filePath = noteOf(cm);
    if (!jumpList || !filePath) return;
    jumpList.recordInNoteJump(filePath, pointIn(cm, from), pointIn(cm, to));
}

/**
 * Records the bundled engine's jumps within a note in the jump list, as it
 * records them in its own. That list knows nothing of other notes, and walking
 * both left a note's jumps until after the note before it (#206).
 */
export function installInNoteJumps(owner: Component): void {
    Vim.setJumpRecordedCallback((cm, from, to) => {
        if (!isJumpListEnabled() || isExternalBackendActive()) return;
        recordMirrored(cm, from, to);
    });
    installed = true;
    owner.register(() => {
        Vim.setJumpRecordedCallback(null);
        installed = false;
    });
}

/**
 * A jump the plugin makes itself within a note, such as Flash or EasyMotion.
 * Recorded like the engine's own jumps, from and to; without the engine's
 * jumps in the list, only where it started, as before.
 */
export function recordInNoteJump(
    app: App,
    cm: CmAdapter,
    from: Position,
    to: Position,
): void {
    if (inNoteJumpsMirrored()) {
        recordMirrored(cm as unknown as CodeMirror, from, to);
        return;
    }
    const filePath =
        app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
    if (filePath) {
        getJumpListInstance()?.recordJump(filePath, from.line, from.ch);
    }
}
