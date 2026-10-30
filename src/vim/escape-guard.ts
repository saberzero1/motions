import { type App, type Component, MarkdownView } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import type { VimIdleState } from '../editors/embeddable-editor';
import { isHintModeActive } from '../ui/hint-mode';
import { isEasyMotionActive } from '../easymotion/register';
import { isFlashActive } from '../flash/state';
import { getCmAdapterFromEditorView } from './vim-api';

interface CmAdapter {
    cm6: { dom: Element; contentDOM: HTMLElement };
    state: { vim?: VimIdleState };
}

function isWorkspaceLeafEditor(cm: CmAdapter): boolean {
    return cm.cm6.dom.closest('.workspace-leaf-content') !== null;
}

/** The parts of Obsidian's HoverPopover this guard reads. */
interface PopoverNode {
    hoverEl?: HTMLElement;
    hide?: () => void;
    /** Shown popovers whose link target lies inside this one. */
    childHovers?: PopoverNode[];
}

/**
 * The popover in `root`'s tree of nested previews whose element holds `el`.
 * Popovers are separate elements under `body`, so at most one contains it.
 */
function popoverContaining(
    root: PopoverNode,
    el: Element,
    seen = new Set<PopoverNode>(),
): PopoverNode | null {
    if (seen.has(root)) return null;
    seen.add(root);
    if (root.hoverEl?.contains(el)) return root;
    for (const child of root.childHovers ?? []) {
        const hit = popoverContaining(child, el, seen);
        if (hit) return hit;
    }
    return null;
}

/**
 * Closes the popover holding the focused editor, or the active view's own
 * popover when the focus is in none of them.
 *
 * Not simply the view's popover: with nested page previews that is the
 * first one, and Obsidian's `hide()` keeps a child popover that still holds
 * the focus, so Escape in the topmost preview closed the preview beneath it
 * and left the focused one open (#210).
 */
function dismissParentPopover(app: App, focused: Element): boolean {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const root = (view as unknown as { hoverPopover?: PopoverNode } | null)
        ?.hoverPopover;
    if (!root?.hide) return false;
    const target = popoverContaining(root, focused) ?? root;
    if (target.hide) target.hide();
    else root.hide();
    return true;
}

export function installEscapeGuard(app: App): void {
    Vim.setIdleEscapeCallback((cm: CmAdapter) => {
        if (isHintModeActive() || isEasyMotionActive() || isFlashActive())
            return;

        // Main editor: do nothing — the fork already consumed the event
        if (isWorkspaceLeafEditor(cm)) return;

        // Non-workspace editor (popover, modal, third-party):
        // use HoverPopover.hide() if available, otherwise blur.
        if (!dismissParentPopover(app, cm.cm6.dom)) {
            window.requestAnimationFrame(() => {
                cm.cm6.contentDOM.blur();
            });
        }
    });
}

/** Engine state read to decide that `q` would start a new command. */
interface QuitState {
    insertMode?: boolean;
    visualMode?: boolean;
    inputState?: { operator?: string; keyBuffer?: string[] };
    surroundState?: unknown;
    expectLiteralNext?: boolean;
}

function idleNormal(vim: QuitState | undefined): boolean {
    if (!vim || vim.insertMode || vim.visualMode) return false;
    if (vim.inputState?.operator) return false;
    if ((vim.inputState?.keyBuffer?.length ?? 0) > 0) return false;
    return !vim.surroundState && !vim.expectLiteralNext;
}

function recordingMacro(): boolean {
    const state = (
        Vim as unknown as {
            getVimGlobalState_?: () => {
                macroModeState?: { isRecording?: boolean };
            };
        }
    ).getVimGlobalState_?.();
    return state?.macroModeState?.isRecording === true;
}

/**
 * `q` closes the page preview the cursor is in, as `q` dismisses Neovim's
 * hover window ("all commands and mappings are available as usual, except
 * that "q" dismisses the window"). Only in normal mode with nothing pending,
 * and not while recording a macro, so `q` still ends a recording (#208).
 */
export function installHoverPreviewQuit(app: App, owner: Component): void {
    owner.registerDomEvent(
        document,
        'keydown',
        (e: KeyboardEvent) => {
            if (e.key !== 'q' || e.ctrlKey || e.altKey || e.metaKey) return;
            const target = e.target instanceof Element ? e.target : null;
            if (!target?.closest('.hover-popover')) return;
            const editorEl = target.closest<HTMLElement>('.cm-editor');
            const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
            const cm = view ? getCmAdapterFromEditorView(view) : null;
            const vim = (
                cm as unknown as { state?: { vim?: QuitState } } | null
            )?.state?.vim;
            if (!idleNormal(vim) || recordingMacro()) return;
            if (!dismissParentPopover(app, target)) return;
            e.preventDefault();
            e.stopPropagation();
        },
        true,
    );
}
