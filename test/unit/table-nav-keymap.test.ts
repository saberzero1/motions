import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createTableNavKeyHandler,
    heldEntryKey,
    replayEntryKeys,
    typesIntoCell,
    type TableNavActions,
} from '../../src/vim/table-nav-keymap';
import type { CmAdapter } from '../../src/types/vim-api';

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

const keyEvent = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    ({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...mods,
    }) as KeyboardEvent;

describe('keys that would reach the hidden cell editor (#167)', () => {
    it('counts text, Space, Backspace and Delete', () => {
        expect(
            ['u', 'Z', ' ', ':', 'Backspace', 'Delete'].map((k) =>
                typesIntoCell(keyEvent(k)),
            ),
        ).toEqual([true, true, true, true, true, true]);
    });

    it('leaves modified and navigation keys to Obsidian', () => {
        expect([
            typesIntoCell(keyEvent('p', { ctrlKey: true })),
            typesIntoCell(keyEvent('s', { metaKey: true })),
            typesIntoCell(keyEvent('x', { altKey: true })),
            typesIntoCell(keyEvent('F2')),
            typesIntoCell(keyEvent('PageDown')),
        ]).toEqual([false, false, false, false, false]);
    });

    it('holds text, Escape and Backspace while a cell opens', () => {
        expect([
            heldEntryKey(keyEvent('H')),
            heldEntryKey(keyEvent('Escape')),
            heldEntryKey(keyEvent('Backspace')),
            heldEntryKey(keyEvent('Enter')),
            heldEntryKey(keyEvent('c', { ctrlKey: true })),
        ]).toEqual(['H', '<Esc>', '<BS>', null, null]);
    });
});

describe('replaying keys held while a cell opened (#167)', () => {
    /** A one-line cell whose vim handles `i` and `<Esc>` and nothing else. */
    function cell(text: string) {
        const state = { text, ch: 0, insert: false };
        const cm = {
            state: {
                get vim() {
                    return { insertMode: state.insert };
                },
            },
            getCursor: () => ({ line: 0, ch: state.ch }),
            replaceSelection: (t: string) => {
                state.text =
                    state.text.slice(0, state.ch) +
                    t +
                    state.text.slice(state.ch);
                state.ch += t.length;
            },
            replaceRange: (
                t: string,
                from: { ch: number },
                to: { ch: number },
            ) => {
                state.text =
                    state.text.slice(0, from.ch) + t + state.text.slice(to.ch);
                state.ch = from.ch + t.length;
            },
        } as unknown as CmAdapter;
        const vim = {
            handleKey: (_cm: CmAdapter, key: string) => {
                if (key === 'i' && !state.insert) state.insert = true;
                else if (key === '<Esc>' && state.insert) state.insert = false;
                else return !state.insert;
                return true;
            },
        };
        return { state, cm, vim };
    }

    it('types text in insert mode, after the key that entered it', () => {
        const { state, cm, vim } = cell('Name');
        replayEntryKeys(vim, cm, ['i', 'H', 'i']);
        expect(state).toEqual({ text: 'HiName', ch: 2, insert: true });
    });

    it('deletes with Backspace and leaves insert mode with Escape', () => {
        const { state, cm, vim } = cell('Name');
        replayEntryKeys(vim, cm, ['i', 'H', 'x', '<BS>', '<Esc>']);
        expect(state).toEqual({ text: 'HName', ch: 1, insert: false });
    });

    it('types nothing in normal mode, where vim owns every key', () => {
        const { state, cm, vim } = cell('Name');
        replayEntryKeys(vim, cm, ['q', 'x']);
        expect(state).toEqual({ text: 'Name', ch: 0, insert: false });
    });
});
