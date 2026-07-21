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

import { vim, Vim, getCM, setLivePreviewField } from '@replit/codemirror-vim';
import type { CursorShapeConfig } from '@replit/codemirror-vim';
import { Prec, type Extension } from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { VimApi, CmAdapter } from '../types/vim-api';
import type { CursorShapes } from '../settings';

/** Whether the bundled vim extension is active in this session. */
let bundledActive = false;

/**
 * Return the CM6 extension array for the bundled vim mode.
 *
 * The caller should pass this to `plugin.registerEditorExtension()`.
 */
export function createBundledVimExtension(
    cursorShapes?: CursorShapes,
): Extension {
    bundledActive = true;
    setLivePreviewField(editorLivePreviewField);
    const config: CursorShapeConfig | undefined = cursorShapes
        ? { ...cursorShapes }
        : undefined;
    return Prec.highest(vim({ cursorShapes: config }));
}

/** Whether the bridge is currently installed (for cleanup). */
let bridgeInstalled = false;

/**
 * Install the `window.CodeMirrorAdapter.Vim` bridge so ecosystem plugins
 * find the Vim API at its expected location.
 *
 * Uses a property descriptor (getter) so that our fork's Vim singleton
 * always wins, regardless of plugin load order.  Even if Obsidian or
 * another plugin overwrites `CodeMirrorAdapter.Vim` after we set it,
 * the getter intercepts every read and returns the fork's instance.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function installVimBridge(): void {
    if (bridgeInstalled) return;
    bridgeInstalled = true;

    const win = window as unknown as Record<string, Record<string, unknown>>;
    if (!win.CodeMirrorAdapter) {
        win.CodeMirrorAdapter = {};
    }

    // Getter without setter: plain assignments by Obsidian or other
    // plugins are silently discarded, so reads always return our fork.
    Object.defineProperty(win.CodeMirrorAdapter, 'Vim', {
        get() {
            return Vim;
        },
        configurable: true, // allow uninstallVimBridge() to remove it
        enumerable: true,
    });
}

/**
 * Remove the `window.CodeMirrorAdapter.Vim` bridge.
 *
 * Called during plugin unload so other plugins (or Obsidian itself)
 * can reclaim the property.
 */
export function uninstallVimBridge(): void {
    if (!bridgeInstalled) return;
    bridgeInstalled = false;

    const win = window as unknown as Record<string, Record<string, unknown>>;
    if (win.CodeMirrorAdapter) {
        delete win.CodeMirrorAdapter.Vim;
    }
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
        const cm = getCM(editorView);
        return (cm as unknown as CmAdapter) ?? null;
    } catch {
        return null;
    }
}

/** Whether the bundled vim is the active provider this session. */
export function isBundledVimActive(): boolean {
    return bundledActive;
}
