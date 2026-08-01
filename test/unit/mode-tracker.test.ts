import { describe, expect, it, beforeAll, afterAll } from 'vitest';

let savedNode: unknown;

beforeAll(() => {
    savedNode = (globalThis as Record<string, unknown>).Node;
    (globalThis as Record<string, unknown>).Node = Object.assign(
        savedNode ?? {},
        { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    );
});

afterAll(() => {
    if (savedNode === undefined) {
        delete (globalThis as Record<string, unknown>).Node;
    } else {
        (globalThis as Record<string, unknown>).Node = savedNode;
    }
});

import { getDialogPrefix } from '../../src/vim/mode-tracker';

function resolveMode(mode: string, subMode?: string | null): string {
    if (mode === 'visual' && subMode === 'linewise') return 'visualLine';
    if (mode === 'visual' && subMode === 'blockwise') return 'visualBlock';
    if (mode === 'normal' && subMode?.startsWith('ctrl-o'))
        return 'insertNormal';
    return mode;
}

interface FakeNode {
    nodeType: number;
    textContent: string | null;
    childNodes: FakeNode[];
    querySelector(selector: string): FakeNode | null;
}

function makeTextNode(text: string): FakeNode {
    return {
        nodeType: 3,
        textContent: text,
        childNodes: [],
        querySelector: () => null,
    };
}

function makeSpan(...children: FakeNode[]): FakeNode {
    return {
        nodeType: 1,
        textContent: null,
        childNodes: children,
        querySelector: () => null,
    };
}

function makeDialog(prefix: string): FakeNode {
    const textNode = makeTextNode(prefix);
    const span = makeSpan(textNode);
    return {
        nodeType: 1,
        textContent: null,
        childNodes: [span],
        querySelector: (sel: string) => (sel === 'span' ? span : null),
    };
}

function makeEmptyDialog(): FakeNode {
    return {
        nodeType: 1,
        textContent: null,
        childNodes: [],
        querySelector: () => null,
    };
}

describe('getDialogPrefix()', () => {
    it('returns ":" for command dialog', () => {
        expect(getDialogPrefix(makeDialog(':') as unknown as HTMLElement)).toBe(
            ':',
        );
    });

    it('returns "/" for forward search dialog', () => {
        expect(getDialogPrefix(makeDialog('/') as unknown as HTMLElement)).toBe(
            '/',
        );
    });

    it('returns "?" for reverse search dialog', () => {
        expect(getDialogPrefix(makeDialog('?') as unknown as HTMLElement)).toBe(
            '?',
        );
    });

    it('returns null for other text', () => {
        expect(
            getDialogPrefix(makeDialog('hello') as unknown as HTMLElement),
        ).toBeNull();
    });

    it('returns null when no span exists', () => {
        expect(
            getDialogPrefix(makeEmptyDialog() as unknown as HTMLElement),
        ).toBeNull();
    });
});

describe('resolveMode()', () => {
    it('maps "normal" to "normal"', () => {
        expect(resolveMode('normal')).toBe('normal');
    });

    it('maps "visual" + "linewise" to "visualLine"', () => {
        expect(resolveMode('visual', 'linewise')).toBe('visualLine');
    });

    it('maps "visual" + "blockwise" to "visualBlock"', () => {
        expect(resolveMode('visual', 'blockwise')).toBe('visualBlock');
    });

    it('maps "insert" to "insert"', () => {
        expect(resolveMode('insert')).toBe('insert');
    });

    it('maps "replace" to "replace"', () => {
        expect(resolveMode('replace')).toBe('replace');
    });

    it('maps "normal" + "ctrl-o..." to "insertNormal"', () => {
        expect(resolveMode('normal', 'ctrl-o insert')).toBe('insertNormal');
    });
});
