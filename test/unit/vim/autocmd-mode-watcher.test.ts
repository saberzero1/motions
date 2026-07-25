import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    setAutocmdModeCallbacks,
    clearAutocmdModeCallbacks,
    createAutocmdModeWatcherExtension,
} from '../../../src/vim/autocmd-mode-watcher';

const mockGetCmAdapterFromEditorView = vi.hoisted(() => vi.fn());

vi.mock('../../../src/vim/vim-api', () => ({
    getCmAdapterFromEditorView: mockGetCmAdapterFromEditorView,
}));

const ViewPluginRef: {
    Ctor: (new (view: unknown) => unknown) | null;
} = {
    Ctor: null,
};

vi.mock('@codemirror/view', () => ({
    ViewPlugin: {
        fromClass: (Ctor: new (view: unknown) => unknown) => {
            ViewPluginRef.Ctor = Ctor;
            return { extension: true };
        },
    },
}));

vi.mock('@codemirror/state', () => ({}));

type ModeHandler = (mode: { mode: string; subMode?: string }) => void;

function createMockAdapter(): {
    adapter: {
        on: (event: string, handler: ModeHandler) => void;
        off: (event: string, handler: ModeHandler) => void;
    };
    fireMode: (mode: { mode: string; subMode?: string }) => void;
} {
    const handlers = new Set<ModeHandler>();
    const adapter = {
        on: (event: string, handler: ModeHandler) => {
            if (event === 'vim-mode-change') handlers.add(handler);
        },
        off: (event: string, handler: ModeHandler) => {
            if (event === 'vim-mode-change') handlers.delete(handler);
        },
    };
    const fireMode = (mode: { mode: string; subMode?: string }) => {
        for (const handler of handlers) handler(mode);
    };
    return { adapter, fireMode };
}

function instantiateWatcher(): {
    fireMode: (mode: { mode: string; subMode?: string }) => void;
} {
    const { adapter, fireMode } = createMockAdapter();
    mockGetCmAdapterFromEditorView.mockReturnValue(adapter);
    createAutocmdModeWatcherExtension();
    const Ctor = ViewPluginRef.Ctor;
    if (!Ctor) throw new Error('ViewPlugin constructor not captured');
    void new Ctor({});
    return { fireMode };
}

beforeEach(() => {
    mockGetCmAdapterFromEditorView.mockReset();
    ViewPluginRef.Ctor = null;
    clearAutocmdModeCallbacks();
});

describe('AutocmdModeWatcher callbacks', () => {
    it('setAutocmdModeCallbacks sets the callback', () => {
        const onModeChange = vi.fn();
        setAutocmdModeCallbacks(onModeChange);

        const { fireMode } = instantiateWatcher();
        fireMode({ mode: 'insert' });

        expect(onModeChange).toHaveBeenCalledTimes(1);
    });

    it('setAutocmdModeCallbacks overwrites the previous callback', () => {
        const first = vi.fn();
        const second = vi.fn();
        setAutocmdModeCallbacks(first);
        setAutocmdModeCallbacks(second);

        const { fireMode } = instantiateWatcher();
        fireMode({ mode: 'normal' });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('clearAutocmdModeCallbacks clears the callback', () => {
        const onModeChange = vi.fn();
        setAutocmdModeCallbacks(onModeChange);
        clearAutocmdModeCallbacks();

        const { fireMode } = instantiateWatcher();
        fireMode({ mode: 'insert' });

        expect(onModeChange).not.toHaveBeenCalled();
    });

    it('clearAutocmdModeCallbacks allows re-setting after clear', () => {
        const onModeChange = vi.fn();
        const next = vi.fn();
        setAutocmdModeCallbacks(onModeChange);
        clearAutocmdModeCallbacks();
        setAutocmdModeCallbacks(next);

        const { fireMode } = instantiateWatcher();
        fireMode({ mode: 'insert' });

        expect(onModeChange).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('createAutocmdModeWatcherExtension returns an Extension', () => {
        const extension = createAutocmdModeWatcherExtension();

        expect(extension).toBeTruthy();
    });

    it('callback receives VimModeChange when invoked', () => {
        const onModeChange = vi.fn();
        setAutocmdModeCallbacks(onModeChange);

        const { fireMode } = instantiateWatcher();
        const payload = { mode: 'replace', subMode: '' };
        fireMode(payload);

        expect(onModeChange).toHaveBeenCalledWith(payload);
    });

    it('callback is not invoked after clear', () => {
        const onModeChange = vi.fn();
        setAutocmdModeCallbacks(onModeChange);

        const { fireMode } = instantiateWatcher();
        fireMode({ mode: 'insert' });
        clearAutocmdModeCallbacks();
        fireMode({ mode: 'normal' });

        expect(onModeChange).toHaveBeenCalledTimes(1);
    });
});
