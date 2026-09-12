import type { VimModeTracker } from '../vim/mode-tracker';
import type { NeovimRedrawDispatcher } from './redraw';

function modeText(value: unknown): string | null {
    if (!Array.isArray(value) || !Array.isArray(value[0])) return null;
    let text = '';
    for (const chunk of value[0]) {
        if (!Array.isArray(chunk) || typeof chunk[1] !== 'string') continue;
        text += chunk[1];
    }
    return text;
}

function canonicalMode(text: string): string {
    const normalized = text
        .replace(/^\s*-+\s*/, '')
        .replace(/\s*-+\s*$/, '')
        .trim()
        .toUpperCase();
    if (!normalized) return 'normal';
    if (normalized.startsWith('VISUAL LINE')) return 'visualLine';
    if (normalized.startsWith('VISUAL BLOCK')) return 'visualBlock';
    if (normalized.startsWith('VISUAL')) return 'visual';
    if (normalized.startsWith('V-REPLACE')) return 'vreplace';
    if (normalized.startsWith('REPLACE')) return 'replace';
    if (normalized.startsWith('INSERT')) return 'insert';
    if (normalized.startsWith('SELECT')) return 'select';
    return normalized.toLowerCase();
}

export class NeovimModeStatus {
    private readonly cleanup: () => void;

    constructor(
        dispatcher: NeovimRedrawDispatcher,
        private readonly getTracker: () => VimModeTracker | null,
    ) {
        this.cleanup = dispatcher.on('msg_showmode', (args) => {
            const text = modeText(args);
            if (text !== null)
                this.getTracker()?.setExternalMode(canonicalMode(text));
        });
    }

    dispose(): void {
        this.cleanup();
        this.getTracker()?.setExternalMode(null);
    }
}
