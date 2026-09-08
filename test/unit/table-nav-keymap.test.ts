import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createTableNavKeyHandler,
    type TableNavActions,
} from '../../src/vim/table-nav-keymap';

// The handler checks for an open modal before doing anything; the unit
// environment has no DOM, so `document` is stubbed rather than pulling in jsdom.
beforeEach(() => {
    vi.stubGlobal('document', { querySelector: () => null });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function makeActions(): TableNavActions {
    return {
        navigate: vi.fn(),
        enterCellEdit: vi.fn(),
        exitTableNav: vi.fn(),
        addRowAfter: vi.fn(),
        addRowBefore: vi.fn(),
        deleteRow: vi.fn(),
        deleteCol: vi.fn(),
        moveRowDown: vi.fn(),
        moveRowUp: vi.fn(),
        moveColLeft: vi.fn(),
        moveColRight: vi.fn(),
        addColBefore: vi.fn(),
        addColAfter: vi.fn(),
        realign: vi.fn(),
    };
}

const key = (k: string, shiftKey = false): KeyboardEvent =>
    ({
        key: k,
        shiftKey,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: () => undefined,
    }) as unknown as KeyboardEvent;

describe('table nav pending state is per handler', () => {
    it('a pending d in one pane does not delete a row in another', () => {
        const paneA = makeActions();
        const paneB = makeActions();
        const handlerA = createTableNavKeyHandler(paneA);
        const handlerB = createTableNavKeyHandler(paneB);

        expect(handlerA(key('d'))).toBe(true);
        handlerB(key('d'));

        expect(paneB.deleteRow).not.toHaveBeenCalled();
        expect(paneA.deleteRow).not.toHaveBeenCalled();
    });

    it('each handler completes its own dd', () => {
        const paneA = makeActions();
        const paneB = makeActions();
        const handlerA = createTableNavKeyHandler(paneA);
        const handlerB = createTableNavKeyHandler(paneB);

        handlerA(key('d'));
        handlerB(key('d'));
        handlerB(key('d'));

        expect(paneB.deleteRow).toHaveBeenCalledTimes(1);
        expect(paneA.deleteRow).not.toHaveBeenCalled();

        handlerA(key('d'));
        expect(paneA.deleteRow).toHaveBeenCalledTimes(1);
    });

    it('a count typed in one pane does not apply in another', () => {
        const paneA = makeActions();
        const paneB = makeActions();
        const handlerA = createTableNavKeyHandler(paneA);
        const handlerB = createTableNavKeyHandler(paneB);

        handlerA(key('3'));
        handlerB(key('j'));

        expect(paneB.navigate).toHaveBeenCalledWith('j', 1);
    });

    it('resetPending clears only its own handler', () => {
        const paneA = makeActions();
        const paneB = makeActions();
        const handlerA = createTableNavKeyHandler(paneA);
        const handlerB = createTableNavKeyHandler(paneB);

        handlerA(key('d'));
        handlerB(key('d'));
        handlerA.resetPending();

        handlerB(key('d'));
        expect(paneB.deleteRow).toHaveBeenCalledTimes(1);

        handlerA(key('d'));
        expect(paneA.deleteRow).not.toHaveBeenCalled();
    });

    it('count still applies within a single handler', () => {
        const pane = makeActions();
        const handler = createTableNavKeyHandler(pane);

        handler(key('3'));
        handler(key('j'));

        expect(pane.navigate).toHaveBeenCalledWith('j', 3);
    });
});
