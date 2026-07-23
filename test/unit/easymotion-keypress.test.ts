import { describe, it, expect, beforeEach, afterEach } from 'vitest';

type Handler = (e: unknown) => void;

let origActiveDocument: unknown;

interface MockDoc {
    addEventListener(type: string, handler: Handler, capture?: boolean): void;
    removeEventListener(
        type: string,
        handler: Handler,
        capture?: boolean,
    ): void;
    dispatchEvent(event: { type: string }): void;
}

function createMockDocument(): MockDoc {
    const listeners = new Map<string, Set<Handler>>();
    return {
        addEventListener(type: string, handler: Handler) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(handler);
        },
        removeEventListener(type: string, handler: Handler) {
            listeners.get(type)?.delete(handler);
        },
        dispatchEvent(event: { type: string }) {
            const handlers = listeners.get(event.type);
            if (handlers) {
                for (const h of [...handlers]) {
                    h(event);
                }
            }
        },
    };
}

function fireKeydown(key: string, extra?: Record<string, unknown>): void {
    const doc = (globalThis as Record<string, unknown>)
        .activeDocument as MockDoc;
    doc.dispatchEvent({
        type: 'keydown',
        key,
        preventDefault() {},
        stopPropagation() {},
        ...extra,
    });
}

beforeEach(() => {
    origActiveDocument = (globalThis as Record<string, unknown>).activeDocument;
    (globalThis as Record<string, unknown>).activeDocument =
        createMockDocument();
});

afterEach(() => {
    (globalThis as Record<string, unknown>).activeDocument = origActiveDocument;
});

describe('waitForKey (issue #84)', () => {
    it('should resolve with a single character key', async () => {
        const { waitForKey } = await import('../../src/easymotion/keypress');
        const promise = waitForKey();
        fireKeydown('a');
        expect(await promise).toBe('a');
    });

    it('should resolve null on Escape', async () => {
        const { waitForKey } = await import('../../src/easymotion/keypress');
        const promise = waitForKey();
        fireKeydown('Escape');
        expect(await promise).toBeNull();
    });

    it('should ignore Shift and resolve with the following character', async () => {
        const { waitForKey } = await import('../../src/easymotion/keypress');
        const promise = waitForKey();
        fireKeydown('Shift', { shiftKey: true });
        fireKeydown('F', { shiftKey: true });
        expect(await promise).toBe('F');
    });

    it('should ignore Control and resolve with the following character', async () => {
        const { waitForKey } = await import('../../src/easymotion/keypress');
        const promise = waitForKey();
        fireKeydown('Control');
        fireKeydown('x');
        expect(await promise).toBe('x');
    });

    it('should ignore Alt and resolve with the following character', async () => {
        const { waitForKey } = await import('../../src/easymotion/keypress');
        const promise = waitForKey();
        fireKeydown('Alt');
        fireKeydown('j');
        expect(await promise).toBe('j');
    });

    it('should ignore Meta and resolve with the following character', async () => {
        const { waitForKey } = await import('../../src/easymotion/keypress');
        const promise = waitForKey();
        fireKeydown('Meta');
        fireKeydown('k');
        expect(await promise).toBe('k');
    });
});
