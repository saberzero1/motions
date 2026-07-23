import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    isAnyViewComposing,
    onAllCompositionsEnd,
    createCompositionTrackerExtension,
    _resetTrackers,
} from '../../src/im/composition-tracker';

vi.mock('@codemirror/view', () => {
    return {
        ViewPlugin: {
            fromClass: (Ctor: new (view: unknown) => unknown) => {
                (
                    ViewPluginRef as { Ctor: new (view: unknown) => unknown }
                ).Ctor = Ctor;
                return { extension: true };
            },
        },
    };
});

vi.mock('@codemirror/state', () => ({}));

const ViewPluginRef: { Ctor: (new (view: unknown) => unknown) | null } = {
    Ctor: null,
};

function createMockScrollDOM(): EventTarget {
    return new EventTarget();
}

function createMockView(): { scrollDOM: EventTarget } {
    return { scrollDOM: createMockScrollDOM() };
}

type TrackerInstance = {
    destroy: () => void;
};

function instantiateTracker(view?: { scrollDOM: EventTarget }): {
    tracker: TrackerInstance;
    scrollDOM: EventTarget;
} {
    createCompositionTrackerExtension();
    const Ctor = ViewPluginRef.Ctor!;
    const mockView = view ?? createMockView();
    const tracker = new Ctor(mockView) as TrackerInstance;
    return { tracker, scrollDOM: mockView.scrollDOM };
}

beforeEach(() => {
    _resetTrackers();
});

afterEach(() => {
    _resetTrackers();
});

describe('isAnyViewComposing', () => {
    it('returns false when no trackers exist', () => {
        expect(isAnyViewComposing()).toBe(false);
    });

    it('returns false when a tracker exists but is not composing', () => {
        instantiateTracker();
        expect(isAnyViewComposing()).toBe(false);
    });

    it('returns true after compositionstart', () => {
        const { scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));
        expect(isAnyViewComposing()).toBe(true);
    });

    it('returns false after compositionend', () => {
        const { scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));
        scrollDOM.dispatchEvent(new Event('compositionend'));
        expect(isAnyViewComposing()).toBe(false);
    });

    it('returns true when one of two trackers is composing', () => {
        const a = instantiateTracker();
        instantiateTracker();
        a.scrollDOM.dispatchEvent(new Event('compositionstart'));
        expect(isAnyViewComposing()).toBe(true);
    });

    it('returns false only when all trackers stop composing', () => {
        const a = instantiateTracker();
        const b = instantiateTracker();
        a.scrollDOM.dispatchEvent(new Event('compositionstart'));
        b.scrollDOM.dispatchEvent(new Event('compositionstart'));

        a.scrollDOM.dispatchEvent(new Event('compositionend'));
        expect(isAnyViewComposing()).toBe(true);

        b.scrollDOM.dispatchEvent(new Event('compositionend'));
        expect(isAnyViewComposing()).toBe(false);
    });
});

describe('destroy', () => {
    it('removes tracker from the set', () => {
        const { tracker, scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));
        expect(isAnyViewComposing()).toBe(true);

        tracker.destroy();
        expect(isAnyViewComposing()).toBe(false);
    });

    it('does not crash on compositionend after destroy', () => {
        const { tracker, scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));
        tracker.destroy();
        expect(() =>
            scrollDOM.dispatchEvent(new Event('compositionend')),
        ).not.toThrow();
    });
});

describe('onAllCompositionsEnd', () => {
    it('fires callback when the last composing tracker ends', async () => {
        const { scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));

        const cb = vi.fn();
        onAllCompositionsEnd(cb);

        scrollDOM.dispatchEvent(new Event('compositionend'));
        await Promise.resolve();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not fire while any tracker is still composing', async () => {
        const a = instantiateTracker();
        const b = instantiateTracker();
        a.scrollDOM.dispatchEvent(new Event('compositionstart'));
        b.scrollDOM.dispatchEvent(new Event('compositionstart'));

        const cb = vi.fn();
        onAllCompositionsEnd(cb);

        a.scrollDOM.dispatchEvent(new Event('compositionend'));
        await Promise.resolve();
        expect(cb).not.toHaveBeenCalled();

        b.scrollDOM.dispatchEvent(new Event('compositionend'));
        await Promise.resolve();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires when a composing tracker is destroyed', async () => {
        const { tracker, scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));

        const cb = vi.fn();
        onAllCompositionsEnd(cb);

        tracker.destroy();
        await Promise.resolve();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('replaces previous callback on re-registration', async () => {
        const { scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));

        const cb1 = vi.fn();
        const cb2 = vi.fn();
        onAllCompositionsEnd(cb1);
        onAllCompositionsEnd(cb2);

        scrollDOM.dispatchEvent(new Event('compositionend'));
        await Promise.resolve();
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe prevents callback from firing', async () => {
        const { scrollDOM } = instantiateTracker();
        scrollDOM.dispatchEvent(new Event('compositionstart'));

        const cb = vi.fn();
        const unsub = onAllCompositionsEnd(cb);
        unsub();

        scrollDOM.dispatchEvent(new Event('compositionend'));
        await Promise.resolve();
        expect(cb).not.toHaveBeenCalled();
    });
});

describe('createCompositionTrackerExtension', () => {
    it('returns an extension object', () => {
        const ext = createCompositionTrackerExtension();
        expect(ext).toBeDefined();
    });
});
