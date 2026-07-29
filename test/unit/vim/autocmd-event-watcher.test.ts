import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    setAutocmdEventCallbacks,
    clearAutocmdEventCallbacks,
    setAutocmdEventHoldDelay,
    createAutocmdEventExtension,
} from '../../../src/vim/autocmd-event-watcher';

const mockGetCmAdapterFromEditorView = vi.hoisted(() => vi.fn());

vi.mock('../../../src/vim/vim-api', () => ({
    getCmAdapterFromEditorView: mockGetCmAdapterFromEditorView,
}));

vi.mock('../../../src/vim/mode-tracker', () => ({
    getDialogPrefix: (el: unknown) => (el ? ':' : null),
}));

vi.mock('obsidian', () => ({
    editorInfoField: Symbol('editorInfoField'),
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

type EventHandler = (...args: unknown[]) => void;

function createMockAdapter(cursor = { line: 0, ch: 0 }) {
    const handlers: Record<string, Set<EventHandler>> = {};
    let currentCursor = { ...cursor };
    const adapter = {
        on: (event: string, handler: EventHandler) => {
            if (!handlers[event]) handlers[event] = new Set();
            handlers[event]!.add(handler);
        },
        off: (event: string, handler: EventHandler) => {
            handlers[event]?.delete(handler);
        },
        getCursor: () => ({ ...currentCursor }),
        state: { dialog: null as HTMLElement | null, vim: {} },
    };
    const fire = (event: string, ...args: unknown[]) => {
        for (const handler of handlers[event] ?? []) handler(...args);
    };
    const setCursor = (line: number, ch: number) => {
        currentCursor = { line, ch };
    };
    return { adapter, fire, setCursor };
}

function instantiateWatcher(cursor = { line: 0, ch: 0 }) {
    const mock = createMockAdapter(cursor);
    mockGetCmAdapterFromEditorView.mockReturnValue(mock.adapter);
    createAutocmdEventExtension();
    const Ctor = ViewPluginRef.Ctor;
    if (!Ctor) throw new Error('ViewPlugin constructor not captured');
    const mockView = { state: { field: () => null } };
    void new Ctor(mockView);
    return mock;
}

beforeEach(() => {
    vi.useFakeTimers();
    mockGetCmAdapterFromEditorView.mockReset();
    ViewPluginRef.Ctor = null;
    clearAutocmdEventCallbacks();
    setAutocmdEventHoldDelay(4000);
});

describe('AutocmdEventWatcher callback wiring', () => {
    it('setAutocmdEventCallbacks sets callbacks', () => {
        const onCursorMoved = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved,
            onCursorHold: vi.fn(),
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher();
        setCursor(1, 0);
        fire('vim-command-done');

        expect(onCursorMoved).toHaveBeenCalledTimes(1);
    });

    it('clearAutocmdEventCallbacks stops events from firing', () => {
        const onCursorMoved = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved,
            onCursorHold: vi.fn(),
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });
        clearAutocmdEventCallbacks();

        const { fire, setCursor } = instantiateWatcher();
        setCursor(1, 0);
        fire('vim-command-done');

        expect(onCursorMoved).not.toHaveBeenCalled();
    });

    it('createAutocmdEventExtension returns an Extension', () => {
        const extension = createAutocmdEventExtension();
        expect(extension).toBeTruthy();
    });
});

describe('CursorMoved detection', () => {
    it('fires when cursor position changes', () => {
        const onCursorMoved = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved,
            onCursorHold: vi.fn(),
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher({ line: 0, ch: 0 });
        setCursor(1, 5);
        fire('vim-command-done');

        expect(onCursorMoved).toHaveBeenCalledTimes(1);
    });

    it('does not fire when cursor position is unchanged after initial move', () => {
        const onCursorMoved = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved,
            onCursorHold: vi.fn(),
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher({ line: 0, ch: 0 });
        setCursor(1, 0);
        fire('vim-command-done');
        expect(onCursorMoved).toHaveBeenCalledTimes(1);

        fire('vim-command-done');
        expect(onCursorMoved).toHaveBeenCalledTimes(1);
    });

    it('fires on each distinct cursor move', () => {
        const onCursorMoved = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved,
            onCursorHold: vi.fn(),
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher({ line: 0, ch: 0 });
        setCursor(1, 0);
        fire('vim-command-done');
        setCursor(2, 0);
        fire('vim-command-done');

        expect(onCursorMoved).toHaveBeenCalledTimes(2);
    });
});

describe('CursorHold timer', () => {
    it('fires after delay when cursor moves', () => {
        const onCursorHold = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved: vi.fn(),
            onCursorHold,
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher();
        setCursor(1, 0);
        fire('vim-command-done');

        expect(onCursorHold).not.toHaveBeenCalled();
        vi.advanceTimersByTime(4000);
        expect(onCursorHold).toHaveBeenCalledTimes(1);
    });

    it('resets timer on new cursor move', () => {
        const onCursorHold = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved: vi.fn(),
            onCursorHold,
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher();
        setCursor(1, 0);
        fire('vim-command-done');
        vi.advanceTimersByTime(3000);
        setCursor(2, 0);
        fire('vim-command-done');
        vi.advanceTimersByTime(3000);

        expect(onCursorHold).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(onCursorHold).toHaveBeenCalledTimes(1);
    });

    it('respects custom hold delay', () => {
        const onCursorHold = vi.fn();
        setAutocmdEventHoldDelay(1000);
        setAutocmdEventCallbacks({
            onCursorMoved: vi.fn(),
            onCursorHold,
            onTextYankPost: vi.fn(),
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire, setCursor } = instantiateWatcher();
        setCursor(1, 0);
        fire('vim-command-done');
        vi.advanceTimersByTime(1000);

        expect(onCursorHold).toHaveBeenCalledTimes(1);
    });
});

describe('TextYankPost', () => {
    it('fires on vim-yank event', () => {
        const onTextYankPost = vi.fn();
        setAutocmdEventCallbacks({
            onCursorMoved: vi.fn(),
            onCursorHold: vi.fn(),
            onTextYankPost,
            onCmdlineEnter: vi.fn(),
            onCmdlineLeave: vi.fn(),
        });

        const { fire } = instantiateWatcher();
        const payload = { registerName: '"', text: 'hello', type: 'char' };
        fire('vim-yank', payload);

        expect(onTextYankPost).toHaveBeenCalledTimes(1);
        expect(onTextYankPost).toHaveBeenCalledWith('', payload);
    });
});
