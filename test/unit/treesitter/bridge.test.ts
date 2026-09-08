import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    afterEach,
    vi,
} from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChangeSet, Text, type ChangeSpec } from '@codemirror/state';
import { Parser, Language, type Tree } from 'web-tree-sitter';
import { translateChanges } from '../../../src/treesitter/bridge';

// Supply actual WASM bytes, as in lua/treesitter-queries.test.ts. Vite otherwise
// externalizes this asset and Node tries to load it as a standalone WASI module.
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

const runtimeWasm = readFileSync(
    resolve(
        __dirname,
        '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
    ),
);
const markdownWasm = readFileSync(
    resolve(
        __dirname,
        '../../../src/treesitter/grammars/tree-sitter-markdown.wasm',
    ),
);

describe('translateChanges', () => {
    let parser: Parser;
    const trees: Tree[] = [];

    beforeAll(async () => {
        await Parser.init({
            wasmBinary: runtimeWasm.buffer,
            locateFile: () => '',
        });
        const language = await Language.load(markdownWasm);
        parser = new Parser();
        parser.setLanguage(language);
    });

    afterEach(() => {
        for (const tree of trees.splice(0)) tree.delete();
    });

    afterAll(() => {
        parser?.delete();
    });

    function parse(doc: string, oldTree?: Tree): Tree {
        const tree = parser.parse(doc, oldTree);
        if (!tree) throw new Error('Markdown parse returned null');
        trees.push(tree);
        return tree;
    }

    const scenarios: Array<{
        name: string;
        oldDoc: string;
        specs: ChangeSpec[];
    }> = [
        {
            name: 'single insertion mid-line',
            oldDoc: '# Heading\n\nSome text here\n',
            specs: [{ from: 16, insert: 'new ' }],
        },
        {
            name: 'single deletion mid-line',
            oldDoc: '# Heading\n\nSome text here\n',
            specs: [{ from: 16, to: 21 }],
        },
        {
            name: 'single replacement mid-line',
            oldDoc: '# Heading\n\nSome text here\n',
            specs: [{ from: 16, to: 20, insert: '**bold**' }],
        },
        {
            name: 'two separate insertions in one ChangeSet',
            oldDoc: 'alpha\n\nbeta\n\ngamma\n',
            specs: [
                { from: 0, insert: '# ' },
                { from: 7, insert: '## ' },
            ],
        },
        {
            name: 'three separate mixed insert/delete/replace changes',
            oldDoc: 'alpha\n\n## beta\n\ngamma\n',
            specs: [
                { from: 0, insert: '# ' },
                { from: 7, to: 10 },
                { from: 16, to: 21, insert: '> quote' },
            ],
        },
        {
            name: 'deletion spanning two newlines',
            oldDoc: '# Heading\n\nfirst\nsecond\nthird\n\n## End\n',
            specs: [{ from: 13, to: 25 }],
        },
        {
            name: 'insertion containing newlines',
            oldDoc: '# Heading\n\nSome text here\n',
            specs: [{ from: 16, insert: '\n\n## New heading\n\n' }],
        },
        {
            name: 'ascending changes on different lines',
            oldDoc: '# One\n\nBody\n\n## Two\n\nLast\n',
            specs: [
                { from: 2, to: 5, insert: 'First\n\nExtra' },
                { from: 13, to: 16, insert: '> ' },
                { from: 21, insert: '- ' },
            ],
        },
        {
            name: 'insertion at offset zero',
            oldDoc: 'Paragraph\n\n## Heading\n',
            specs: [{ from: 0, insert: '# Start\n\n' }],
        },
        {
            name: 'insertion at end of document',
            oldDoc: '# Heading\n\nBody',
            specs: [{ from: 15, insert: '\n\n> End\n' }],
        },
        {
            name: 'UTF-16 text containing é and 😀 before the edit',
            oldDoc: '# é 😀 title\n\nBody\n',
            specs: [{ from: 7, to: 12, insert: 'new\n\n## Next' }],
        },
    ];

    it.each(scenarios)(
        'incremental and fresh trees agree: $name',
        ({ oldDoc, specs }) => {
            const changes = ChangeSet.of(specs, oldDoc.length);
            const newDoc = changes
                .apply(Text.of(oldDoc.split('\n')))
                .toString();
            const tree = parse(oldDoc);

            for (const edit of translateChanges(changes, oldDoc, newDoc)) {
                tree.edit(edit);
            }

            const incremental = parse(newDoc, tree);
            const fresh = parse(newDoc);
            expect(incremental.rootNode.toString()).toBe(
                fresh.rootNode.toString(),
            );
            expect(incremental.rootNode.endPosition).toEqual(
                fresh.rootNode.endPosition,
            );
        },
    );

    it('uses fromB, not fromA, for the second edit startIndex', () => {
        const oldDoc = 'alpha\n\nbeta\n\ngamma\n';
        const changes = ChangeSet.of(
            [
                { from: 0, insert: '# ' },
                { from: 7, insert: '## ' },
            ],
            oldDoc.length,
        );
        const newDoc = '# alpha\n\n## beta\n\ngamma\n';
        const edits = translateChanges(changes, oldDoc, newDoc);

        expect(edits).toHaveLength(2);
        // Second fromA = 7; first insertion adds 2, so fromB = 7 + 2 = 9.
        expect(edits[1]?.startIndex).toBe(9);
        expect(edits[1]?.startIndex).not.toBe(7);
        expect(edits[1]?.oldEndIndex).toBe(9);
        // The second insertion adds 3: toB = 9 + 3 = 12.
        expect(edits[1]?.newEndIndex).toBe(12);
    });

    it('reports exact points for a replacement on line 2 of four lines', () => {
        const oldDoc = 'first\nsecond\nthird\nfourth';
        // Zero-based row 2 starts at 6 + 7 = 13; replace columns 1 through 4.
        const changes = ChangeSet.of(
            [{ from: 14, to: 17, insert: 'XY\nZ' }],
            oldDoc.length,
        );
        const edits = translateChanges(
            changes,
            oldDoc,
            'first\nsecond\ntXY\nZd\nfourth',
        );

        expect(edits).toHaveLength(1);
        expect(edits[0]?.startPosition).toEqual({ row: 2, column: 1 });
        expect(edits[0]?.oldEndPosition).toEqual({ row: 2, column: 4 });
        expect(edits[0]?.newEndPosition).toEqual({ row: 3, column: 1 });
    });

    it('counts é as one UTF-16 unit and 😀 as two units', () => {
        const oldDoc = '# é 😀 title\n';
        const changes = ChangeSet.of(
            [{ from: 7, to: 12, insert: 'new' }],
            oldDoc.length,
        );
        const edits = translateChanges(changes, oldDoc, '# é 😀 new\n');

        expect(edits).toHaveLength(1);
        // '# ' (2) + 'é' (1) + space (1) + '😀' (2) + space (1) = 7.
        expect(edits[0]?.startIndex).toBe(7);
        expect(edits[0]?.startPosition).toEqual({ row: 0, column: 7 });
        expect(edits[0]?.oldEndPosition).toEqual({ row: 0, column: 12 });
        expect(edits[0]?.newEndPosition).toEqual({ row: 0, column: 10 });
    });

    it('returns no edits for an empty ChangeSet', () => {
        const doc = '# Heading\n\nBody\n';
        expect(
            translateChanges(ChangeSet.of([], doc.length), doc, doc),
        ).toEqual([]);
    });
});
