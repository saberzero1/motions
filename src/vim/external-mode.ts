import { setExternalCursorMode } from '@replit/codemirror-vim';

export type ExternalVimMode =
    | 'normal'
    | 'insert'
    | 'replace'
    | 'visual'
    | 'visual line'
    | 'visual block'
    | 'operator-pending';

/**
 * Mode reported by a backend other than the bundled fork.
 *
 * Host features that render per-mode — the animated cursor's shape, and
 * input-method switching — read the fork's own state or its
 * `vim-mode-change` event. While the Neovim backend owns keys the fork is
 * stood down and never leaves normal mode, so those features read a mode that
 * is not the user's. This is the seam they consult first.
 */
let currentMode: ExternalVimMode | null = null;
const listeners = new Set<(mode: ExternalVimMode | null) => void>();

// Neovim's `mode()` values. Order matters: `no` (operator-pending) has to be
// tested before `n`, and `V`/`S` before the lowercase visual modes, because
// these are prefix tests on a case-sensitive string.
export function neovimModeToVimMode(mode: string): ExternalVimMode {
    if (mode.startsWith('no')) return 'operator-pending';
    if (mode.startsWith('n')) return 'normal';
    if (mode.startsWith('V') || mode.startsWith('S')) return 'visual line';
    if (mode.startsWith('\x16') || mode.startsWith('\x13'))
        return 'visual block';
    if (mode.startsWith('v') || mode.startsWith('s')) return 'visual';
    if (mode.startsWith('R')) return 'replace';
    if (mode.startsWith('i') || mode.startsWith('t')) return 'insert';
    return 'normal';
}

export function setExternalVimMode(mode: ExternalVimMode | null): void {
    if (mode === currentMode) return;
    currentMode = mode;
    // Forwarded here rather than from a subscriber so the two cannot diverge.
    // The fork owns the visible cursor and resolves its shape from its own vim
    // state, which never leaves normal while a backend owns keys.
    setExternalCursorMode(mode);
    for (const listener of [...listeners]) listener(mode);
}

export function getExternalVimMode(): ExternalVimMode | null {
    return currentMode;
}

/**
 * Whether a backend other than the bundled fork currently owns keys.
 *
 * Maintained by the connection lifecycle — set on connect
 * (`src/rpc/neovim-connection.ts:322,367`) and cleared on teardown (`:647`) —
 * so host features can branch on key ownership without importing the RPC
 * subsystem and creating a cycle.
 */
export function isExternalBackendActive(): boolean {
    return currentMode !== null;
}

/**
 * Precedence for per-mode host rendering: a backend that owns keys wins over
 * whatever the bundled fork's own state says, because the fork is stood down
 * and stays in normal while that backend is connected.
 */
export function resolveVimModeWithExternal(
    forkMode: string | undefined,
): string | undefined {
    return getExternalVimMode() ?? forkMode;
}

export function onExternalVimMode(
    listener: (mode: ExternalVimMode | null) => void,
): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** @internal — exposed for unit tests only. */
export function _resetExternalVimMode(): void {
    currentMode = null;
    setExternalCursorMode(null);
    listeners.clear();
}
