import {
    MarkdownView,
    editorInfoField,
    type App,
    type Component,
    type WorkspaceLeaf,
} from 'obsidian';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { JumpList } from '../vim/jumplist';
import { isJumpListEnabled } from '../vim/options';
import { getEditorView } from '../util/editor';
import { isRecordedNavigationActive } from './navigate';

interface Position {
    line: number;
    ch: number;
}

/** Each note's last cursor in its own editor, keyed by path. */
const lastCursor = new Map<string, Position>();

/**
 * A note's last cursor in its own editor, as Vim's `"` mark keeps a buffer's,
 * for `<C-^>` to return to.
 */
export function getLastNoteCursor(path: string): Position | undefined {
    return lastCursor.get(path);
}

/**
 * Keeps each note's cursor, for a switch away from a tab that has since been
 * given another note: by then its editor shows the new one.
 */
export function noteCursorTracker(): Extension {
    return EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const info = update.state.field(editorInfoField, false);
        // The note's own editor only: a table cell's editor carries the same
        // info but its own small document.
        if (!(info instanceof MarkdownView)) return;
        if (getEditorView(info) !== update.view) return;
        const path = info.file?.path;
        if (!path) return;
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        lastCursor.set(path, { line: line.number - 1, ch: head - line.from });
    });
}

/**
 * Records a change of the active note as a jump, so `<C-o>` goes back to the
 * note before it (#206). Neovim records a buffer switch: `:b` or `:bnext`
 * from line 4 of `a`, then `<C-o>`, lands on line 4 of `a` (measured, 0.12.5).
 * Tabs here are the buffers `:b` and `]b` move between, but only those and
 * the plugin's other navigations recorded a jump; a tab clicked or reached
 * with Ctrl+Tab, or a link Obsidian opened, left `<C-o>` on an older entry.
 *
 * A navigation that records its own jump, and the jump-list walk itself, are
 * not recorded again. The jumps made within each note are recorded in the
 * same list (in-note-jumps.ts), so a walk visits them in order.
 */
export function installNoteSwitchJumps(
    app: App,
    owner: Component,
    getJumpList: () => JumpList | null,
): void {
    let current: { path: string; leaf: WorkspaceLeaf } | null = null;
    const onSwitch = (): void => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        const path = view?.file?.path;
        if (!view || !path) return;
        const previous = current;
        current = { path, leaf: view.leaf };
        if (!previous || previous.path === path) return;
        const jumpList = getJumpList();
        if (!jumpList || !isJumpListEnabled()) return;
        // A navigation that records its own jump: one still opening its note,
        // and, since Obsidian reports a switch after `setActiveLeaf` returns,
        // one that has finished and left the list at this note. The walk
        // leaves it there too. Measured without each: a heading picked in
        // `:headings`, and `]b`, recorded `a, b, a, b`.
        if (isRecordedNavigationActive()) return;
        const at = jumpList.getEntries()[jumpList.getIndex()];
        if (at?.filePath === path) return;
        const from = departure(previous);
        const to = view.editor.getCursor();
        jumpList.recordJump(previous.path, from.line, from.ch);
        jumpList.recordJump(path, to.line, to.ch, { landing: true });
    };
    owner.registerEvent(app.workspace.on('active-leaf-change', onSwitch));
    owner.registerEvent(app.workspace.on('file-open', onSwitch));
    // The note open at start is where the first switch leaves from.
    app.workspace.onLayoutReady(onSwitch);
}

/** Where the cursor was in the note being left. */
function departure(previous: { path: string; leaf: WorkspaceLeaf }): Position {
    const view = previous.leaf.view;
    if (view instanceof MarkdownView && view.file?.path === previous.path) {
        return view.editor.getCursor();
    }
    return lastCursor.get(previous.path) ?? { line: 0, ch: 0 };
}
