/**
 * Bundled codemirror-vim provider.
 *
 * When Obsidian's built-in vim mode is disabled, this module provides the
 * forked @replit/codemirror-vim as a CM6 extension that the plugin registers
 * via `registerEditorExtension`.  It also sets up the
 * `window.CodeMirrorAdapter.Vim` bridge so that ecosystem plugins
 * (obsidian-vimrc-support, obsidian-latex-suite, etc.) can still discover
 * the Vim API at the canonical location.
 */

/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion --
   The fork bundles its own @codemirror copies. TypeScript sees the fork's
   Extension/EditorView as different types from Obsidian's copies even though
   they are structurally identical. Casts through unknown are required. */
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { VimApi, CmAdapter } from '../types/vim-api';

/** Whether the bundled vim extension is active in this session. */
let bundledActive = false;

/**
 * Return the CM6 extension array for the bundled vim mode.
 *
 * The caller should pass this to `plugin.registerEditorExtension()`.
 */
export function createBundledVimExtension(): Extension {
    bundledActive = true;
    // vim() returns Extension from the fork's @codemirror/state copy;
    // cast to our copy's Extension via unknown (structurally identical).
    return vim() as unknown as Extension;
}

/**
 * Install the `window.CodeMirrorAdapter.Vim` bridge so ecosystem plugins
 * find the Vim API at its expected location.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function installVimBridge(): void {
    const win = window as unknown as Record<string, Record<string, unknown>>;
    if (!win.CodeMirrorAdapter) {
        win.CodeMirrorAdapter = {};
    }
    // Always overwrite: Obsidian loads its own vim.js and sets
    // CodeMirrorAdapter.Vim even when vimMode is false.  We need
    // the bridge to point at OUR fork's Vim so that register
    // introspection, handleKey, and all API access hits the same
    // state machine that the ViewPlugin uses.
    win.CodeMirrorAdapter.Vim = Vim;
}

/**
 * Get the bundled Vim API singleton.
 *
 * Prefer `getVimApi()` from `vim-api.ts` — it tries the built-in first
 * and falls back to this.
 */
export function getBundledVimApi(): VimApi {
    return Vim as unknown as VimApi;
}

/**
 * Get the CM5-compat adapter from a CM6 EditorView that has the bundled
 * vim extension active.
 *
 * The vim ViewPlugin attaches the adapter as `(view as any).cm`.
 */
export function getBundledCmAdapter(editorView: EditorView): CmAdapter | null {
    try {
        // getCM expects the fork's EditorView copy; cast via unknown
        // to bridge the duplicate @codemirror/view type boundary.
        const cm = getCM(editorView as unknown as Parameters<typeof getCM>[0]);
        return (cm as unknown as CmAdapter) ?? null;
    } catch {
        return null;
    }
}

/** Whether the bundled vim is the active provider this session. */
export function isBundledVimActive(): boolean {
    return bundledActive;
}
