import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    setImModeCallbacks,
    createImModeWatcherExtension,
    _resetWatchers,
} from '../../src/im/im-mode-watcher';

const mockGetCmAdapterFromEditorView = vi.hoisted(() => vi.fn());

vi.mock('../../src/vim/vim-api', () => ({
    getCmAdapterFromEditorView: mockGetCmAdapterFromEditorView,
}));

vi.mock('@codemirror/view', () => ({
    ViewPlugin: {
        fromClass: (Ctor: new (view: unknown) => unknown) => {
            (ViewPluginRef as { Ctor: new (view: unknown) => unknown }).Ctor =
                Ctor;
            return { extension: true };
        },
    },
}));

vi.mock('@codemirror/state', () => ({}));

const ViewPluginRef: { Ctor: (new (view: unknown) => unknown) | null } = {
    Ctor: null,
};

type WatcherInstance = {
    update: (vu: unknown) => void;
    destroy: () => void;
    viewId: string;
};

function createMockAdapter(insertMode = false): {
    adapter: Record<string, unknown>;
    handlers: Map<string, ((...args: unknown[]) => void)[]>;
    fireMode: (mode: string) => void;
} {
    const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    const adapter = {
        state: { vim: { insertMode, mode: insertMode ? 'insert' : 'normal' } },
        on: (event: string, handler: (...args: unknown[]) => void) => {
            if (!handlers.has(event)) handlers.set(event, []);
            handlers.get(event)!.push(handler);
        },
        off: (event: string, handler: (...args: unknown[]) => void) => {
            const list = handlers.get(event);
            if (list) {
                const idx = list.indexOf(handler);
                if (idx >= 0) list.splice(idx, 1);
            }
        },
    };
    const fireMode = (mode: string) => {
        for (const h of handlers.get('vim-mode-change') ?? []) {
            h({ mode, subMode: '' });
        }
    };
    return { adapter, handlers, fireMode };
}

function instantiateWatcher(mockView?: unknown): {
    watcher: WatcherInstance;
    view: unknown;
} {
    createImModeWatcherExtension();
    const Ctor = ViewPluginRef.Ctor!;
    const view = mockView ?? {};
    const watcher = new Ctor(view) as WatcherInstance;
    return { watcher, view };
}

beforeEach(() => {
    _resetWatchers();
    mockGetCmAdapterFromEditorView.mockReset();
});

afterEach(() => {
    _resetWatchers();
});

describe('lazy adapter binding', () => {
    it('binds immediately when adapter is available at construction', () => {
        const { adapter, handlers } = createMockAdapter();
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        instantiateWatcher();
        expect(handlers.get('vim-mode-change')?.length).toBe(1);
    });

    it('defers binding when adapter is not available at construction', () => {
        mockGetCmAdapterFromEditorView.mockReturnValue(null);
        const { watcher } = instantiateWatcher();

        const { adapter, handlers } = createMockAdapter();
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);
        watcher.update({});

        expect(handlers.get('vim-mode-change')?.length).toBe(1);
    });

    it('does not double-bind on subsequent updates', () => {
        const { adapter, handlers } = createMockAdapter();
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const { watcher } = instantiateWatcher();
        watcher.update({});
        watcher.update({});

        expect(handlers.get('vim-mode-change')?.length).toBe(1);
    });
});

describe('mode change detection', () => {
    it('fires onEnterInsert when transitioning normal→insert', () => {
        const { adapter, fireMode } = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onEnter = vi.fn();
        const onLeave = vi.fn();
        const onCleanup = vi.fn();
        setImModeCallbacks(onEnter, onLeave, onCleanup);

        const { watcher } = instantiateWatcher();
        fireMode('insert');

        expect(onEnter).toHaveBeenCalledWith(watcher.viewId);
        expect(onLeave).not.toHaveBeenCalled();
    });

    it('fires onLeaveInsert when transitioning insert→normal', () => {
        const { adapter, fireMode } = createMockAdapter(true);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onEnter = vi.fn();
        const onLeave = vi.fn();
        const onCleanup = vi.fn();
        setImModeCallbacks(onEnter, onLeave, onCleanup);

        const { watcher } = instantiateWatcher();
        fireMode('normal');

        expect(onLeave).toHaveBeenCalledWith(watcher.viewId);
        expect(onEnter).not.toHaveBeenCalled();
    });

    it('treats replace mode as insert', () => {
        const { adapter, fireMode } = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onEnter = vi.fn();
        setImModeCallbacks(onEnter, vi.fn(), vi.fn());

        instantiateWatcher();
        fireMode('replace');

        expect(onEnter).toHaveBeenCalled();
    });

    it('does not fire on normal→normal transition', () => {
        const { adapter, fireMode } = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onEnter = vi.fn();
        const onLeave = vi.fn();
        setImModeCallbacks(onEnter, onLeave, vi.fn());

        instantiateWatcher();
        fireMode('normal');

        expect(onEnter).not.toHaveBeenCalled();
        expect(onLeave).not.toHaveBeenCalled();
    });

    it('does not fire on insert→insert transition', () => {
        const { adapter, fireMode } = createMockAdapter(true);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onEnter = vi.fn();
        const onLeave = vi.fn();
        setImModeCallbacks(onEnter, onLeave, vi.fn());

        instantiateWatcher();
        fireMode('insert');

        expect(onEnter).not.toHaveBeenCalled();
        expect(onLeave).not.toHaveBeenCalled();
    });
});

describe('adapter re-binding', () => {
    it('re-binds when adapter identity changes', () => {
        const first = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(first.adapter);

        const onEnter = vi.fn();
        setImModeCallbacks(onEnter, vi.fn(), vi.fn());

        const { watcher } = instantiateWatcher();

        const second = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(second.adapter);
        watcher.update({});

        expect(first.handlers.get('vim-mode-change')?.length ?? 0).toBe(0);
        expect(second.handlers.get('vim-mode-change')?.length).toBe(1);

        second.fireMode('insert');
        expect(onEnter).toHaveBeenCalledWith(watcher.viewId);
    });
});

describe('cleanup', () => {
    it('removes event listener on destroy', () => {
        const { adapter, handlers } = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const { watcher } = instantiateWatcher();
        expect(handlers.get('vim-mode-change')?.length).toBe(1);

        watcher.destroy();
        expect(handlers.get('vim-mode-change')?.length).toBe(0);
    });

    it('fires cleanup callback with viewId on destroy', () => {
        const { adapter } = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onCleanup = vi.fn();
        setImModeCallbacks(vi.fn(), vi.fn(), onCleanup);

        const { watcher } = instantiateWatcher();
        watcher.destroy();

        expect(onCleanup).toHaveBeenCalledWith(watcher.viewId);
    });

    it('does not fire mode callbacks after destroy', () => {
        const { adapter, fireMode } = createMockAdapter(false);
        mockGetCmAdapterFromEditorView.mockReturnValue(adapter);

        const onEnter = vi.fn();
        setImModeCallbacks(onEnter, vi.fn(), vi.fn());

        const { watcher } = instantiateWatcher();
        watcher.destroy();
        fireMode('insert');

        expect(onEnter).not.toHaveBeenCalled();
    });
});

describe('multiple views', () => {
    it('assigns unique viewIds to each watcher', () => {
        const a = createMockAdapter(false);
        const b = createMockAdapter(false);
        mockGetCmAdapterFromEditorView
            .mockReturnValueOnce(a.adapter)
            .mockReturnValueOnce(b.adapter);

        const w1 = instantiateWatcher();
        const w2 = instantiateWatcher();

        expect(w1.watcher.viewId).not.toBe(w2.watcher.viewId);
    });

    it('fires callbacks with the correct viewId per view', () => {
        const a = createMockAdapter(false);
        const b = createMockAdapter(false);
        mockGetCmAdapterFromEditorView
            .mockReturnValueOnce(a.adapter)
            .mockReturnValueOnce(b.adapter);

        const onEnter = vi.fn();
        setImModeCallbacks(onEnter, vi.fn(), vi.fn());

        const w1 = instantiateWatcher();
        const w2 = instantiateWatcher();

        b.fireMode('insert');
        expect(onEnter).toHaveBeenCalledWith(w2.watcher.viewId);
        expect(onEnter).not.toHaveBeenCalledWith(w1.watcher.viewId);
    });
});
