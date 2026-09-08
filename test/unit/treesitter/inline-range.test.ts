import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    afterEach,
    vi,
} from 'vitest';
import type { Tree } from 'web-tree-sitter';
import * as runtime from '../../../src/treesitter/runtime';

// Only adapt the asset loader: runtime, parser, grammars and trees are all real.
// Vite externalizes node_modules WASM, bypassing the WASM binary plugin.
vi.mock(
    '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
    async () => {
        const { readFile } = await import('node:fs/promises');
        return {
            default: new Uint8Array(
                await readFile(
                    new URL(
                        '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
                        import.meta.url,
                    ),
                ),
            ),
        };
    },
);

describe('findInlineNodeRange', () => {
    const trees: Tree[] = [];

    beforeAll(async () => {
        await runtime.loadLanguage('markdown');
        await runtime.loadLanguage('markdown_inline');
    });

    afterEach(() => {
        for (const tree of trees.splice(0)) tree.delete();
    });

    afterAll(() => {
        runtime.destroyAll();
    });

    function parse(doc: string): Tree {
        const tree = runtime.parseString('markdown', doc);
        trees.push(tree);
        return tree;
    }

    it('returns strong emphasis on line zero in document coordinates', () => {
        const doc = '**bold**\n';
        const tree = parse(doc);

        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 3, 'strong_emphasis'),
        ).toEqual({
            type: 'strong_emphasis',
            startRow: 0,
            startColumn: 0,
            endRow: 0,
            endColumn: 8,
        });
    });

    it('rebases heading inline columns to document columns', () => {
        const doc = '# Title **bold** end\n';
        const tree = parse(doc);
        const inline = tree.rootNode.descendantsOfType('inline')[0];
        expect(inline?.startPosition).toEqual({ row: 0, column: 2 });

        // Fragment columns 6..14 become document columns 8..16.
        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 10, 'strong_emphasis'),
        ).toEqual({
            type: 'strong_emphasis',
            startRow: 0,
            startColumn: 8,
            endRow: 0,
            endColumn: 16,
        });
    });

    it('finds emphasis on the second line of a multiline paragraph', () => {
        const doc = 'some text\n**bold** more\n';
        const tree = parse(doc);
        const inline = tree.rootNode.descendantsOfType('inline')[0];
        expect(inline?.startPosition).toEqual({ row: 0, column: 0 });
        expect(inline?.endPosition.row).toBe(1);

        expect(
            runtime.findInlineNodeRange(tree, doc, 1, 2, 'strong_emphasis'),
        ).toEqual({
            type: 'strong_emphasis',
            startRow: 1,
            startColumn: 0,
            endRow: 1,
            endColumn: 8,
        });
    });

    it('does not shift later-row columns by a list paragraph origin', () => {
        const doc = 'Intro\n\n- some text\n**bold** more\n';
        const tree = parse(doc);
        const inline = tree.rootNode.descendantsOfType('inline')[1];
        // A lazy list continuation: first row starts at column 2, next at 0.
        expect(inline?.startPosition).toEqual({ row: 2, column: 2 });
        expect(inline?.endPosition.row).toBe(3);

        // Column 1 is inside '**'; subtracting the origin would give -1.
        expect(
            runtime.findInlineNodeRange(tree, doc, 3, 1, 'strong_emphasis'),
        ).toEqual({
            type: 'strong_emphasis',
            startRow: 3,
            startColumn: 0,
            endRow: 3,
            endColumn: 8,
        });
    });

    it('returns null outside the requested type even when it exists elsewhere', () => {
        const doc = 'plain **bold** end\n';
        const tree = parse(doc);

        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 1, 'strong_emphasis'),
        ).toBeNull();
    });

    it('returns null for a type that exists nowhere', () => {
        const doc = '**bold**\n';
        const tree = parse(doc);

        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 3, 'code_span'),
        ).toBeNull();
    });

    it('returns document coordinates for a code span inside a heading', () => {
        const doc = '# Title `code` end\n';
        const tree = parse(doc);

        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 10, 'code_span'),
        ).toEqual({
            type: 'code_span',
            startRow: 0,
            startColumn: 8,
            endRow: 0,
            endColumn: 14,
        });
    });

    it('returns the inner emphasis range from nested italic text', () => {
        const doc = '**bold *italic* bold**\n';
        const tree = parse(doc);

        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 9, 'emphasis'),
        ).toEqual({
            type: 'emphasis',
            startRow: 0,
            startColumn: 7,
            endRow: 0,
            endColumn: 15,
        });
    });

    it('returns the outer strong emphasis range from the same nested text', () => {
        const doc = '**bold *italic* bold**\n';
        const tree = parse(doc);

        expect(
            runtime.findInlineNodeRange(tree, doc, 0, 9, 'strong_emphasis'),
        ).toEqual({
            type: 'strong_emphasis',
            startRow: 0,
            startColumn: 0,
            endRow: 0,
            endColumn: 22,
        });
    });
});
