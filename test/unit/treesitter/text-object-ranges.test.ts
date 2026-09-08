import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Tree } from 'web-tree-sitter';
import type { MotionFn, VimPos, VimState } from '../../../src/types/vim-api';
import * as runtime from '../../../src/treesitter/runtime';
import * as jsApi from '../../../src/treesitter/js-api';
import {
    deleteTreeForView,
    setTreeForView,
} from '../../../src/treesitter/tree-state';
import { createMultiLineDelimiterTextObject } from '../../../src/text-objects/delimiter';
import {
    blockquoteAroundTextObject,
    blockquoteInnerTextObject,
} from '../../../src/text-objects/blockquote';

// Adapt only WASM loading; every range goes through the real grammar and JS API.
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

describe('tree-backed text object ranges', () => {
    const trees: Tree[] = [];
    const views: EditorView[] = [];

    beforeAll(async () => {
        await runtime.loadLanguage('markdown');
        await runtime.loadLanguage('markdown_inline');
        jsApi.setJsApiModules(runtime);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const view of views.splice(0)) deleteTreeForView(view);
        for (const tree of trees.splice(0)) tree.delete();
    });

    afterAll(() => runtime.destroyAll());

    function prepare(doc: string) {
        const state = EditorState.create({ doc });
        // These motions use only state.doc, not DOM or EditorView methods.
        const view = { state } as EditorView;
        const tree = runtime.parseString('markdown', doc);
        trees.push(tree);
        views.push(view);
        setTreeForView(view, tree);
        const cm = {
            cm6: view,
            getLine: (line: number) => state.doc.line(line + 1).text,
            firstLine: () => 0,
            lastLine: () => state.doc.lines - 1,
        } as unknown as Parameters<MotionFn>[0];
        return { state, view, tree, cm };
    }

    function select(
        doc: string,
        head: VimPos,
        motion: MotionFn,
        inner: boolean,
    ) {
        const { cm, state } = prepare(doc);
        const range = motion(
            cm,
            head,
            { textObjectInner: inner },
            {} as VimState,
            undefined,
        );
        if (range === null) return null;
        if (!Array.isArray(range))
            throw new Error('Expected a text object range');
        const [from, to] = range;
        return state.doc.sliceString(
            state.doc.line(from.line + 1).from + from.ch,
            state.doc.line(to.line + 1).from + to.ch,
        );
    }

    it.each([true, false])(
        'selects the outer double-tilde node (inner=%s)',
        (inner) => {
            const lookup = vi.spyOn(jsApi, 'findContainingInlineNodeOfType');
            expect(
                select(
                    'Hello ~~strike~~ world',
                    { line: 0, ch: 10 },
                    createMultiLineDelimiterTextObject('~~'),
                    inner,
                ),
            ).toBe(inner ? 'strike' : '~~strike~~');
            // A correct result must come from the tree, not a disabled fast path.
            expect(lookup.mock.results[0]?.value).toMatchObject({
                startColumn: 6,
                endColumn: 16,
            });
        },
    );

    it('continues past rejected same-type nodes and can reject every candidate', () => {
        const doc = 'Hello ~~strike~~ world';
        const { tree } = prepare(doc);
        const candidates: runtime.InlineNodeRange[] = [];
        const range = runtime.findInlineNodeRange(
            tree,
            doc,
            0,
            10,
            'strikethrough',
            (candidate) => {
                candidates.push(candidate);
                return candidate.startColumn === 6;
            },
        );
        expect(range).toMatchObject({ startColumn: 6, endColumn: 16 });
        expect(
            candidates.map((candidate) => [
                candidate.startColumn,
                candidate.endColumn,
            ]),
        ).toEqual([
            [7, 15],
            [6, 16],
        ]);
        expect(
            runtime.findInlineNodeRange(
                tree,
                doc,
                0,
                10,
                'strikethrough',
                () => false,
            ),
        ).toBeNull();
    });

    it.each([
        ['$$', '$x + y$', null],
        ['$', '$$x + y$$', 'x + y'],
        ['*', '_italic_', null],
        ['_', '*italic*', null],
        ['**', '__bold__', null],
        ['__', '**bold**', null],
    ])(
        'checks exact source delimiter runs for %s in %s',
        (delimiter, text, expected) => {
            const doc = `Hello ${text} world`;
            const motion = createMultiLineDelimiterTextObject(delimiter!);
            const head = { line: 0, ch: 9 };
            expect(select(doc, head, motion, true)).toBe(expected);
            // Matching delimiter forms still resolve through the tree.
            const lookup = vi.spyOn(jsApi, 'findContainingInlineNodeOfType');
            expect(
                select(
                    `Hello ${delimiter}content${delimiter} world`,
                    head,
                    motion,
                    true,
                ),
            ).toBe('content');
            expect(lookup.mock.results[0]?.value).not.toBeNull();
        },
    );

    it.each([6, 7, 12, 13])(
        'rejects inner bold on delimiter column %s but permits around',
        (ch) => {
            const doc = 'Hello **bold** world';
            const motion = createMultiLineDelimiterTextObject('**');
            expect(select(doc, { line: 0, ch }, motion, true)).toBeNull();
            expect(select(doc, { line: 0, ch }, motion, false)).toBe(
                '**bold**',
            );
        },
    );

    it.each([
        {
            name: 'excludes an unmarked lazy continuation',
            doc: 'before\n> quoted text\n> more quoted\nafter',
            head: { line: 1, ch: 5 },
            motion: blockquoteAroundTextObject,
            expected: '> quoted text\n> more quoted',
        },
        {
            name: 'includes the newline after a nested around selection',
            doc: '> h\n> h\n>> j\n>> j\n>>> k\n>>> k\n>> j\n>> j\n> h\n> h',
            head: { line: 4, ch: 4 },
            motion: blockquoteAroundTextObject,
            expected: '>>> k\n>>> k\n',
        },
        {
            name: 'strips the full spaced prefix and preserves outer quote text',
            doc: '> outer\n> > nested inner\n> more outer',
            head: { line: 1, ch: 5 },
            motion: blockquoteInnerTextObject,
            expected: 'nested inner',
        },
    ])('$name', ({ doc, head, motion, expected }) => {
        const lookup = vi.spyOn(jsApi, 'findContainingNodeOfType');
        expect(select(doc, head, motion, true)).toBe(expected);
        expect(lookup.mock.results[0]?.value?.type).toBe('block_quote');
        vi.spyOn(jsApi, 'isTreeAvailable').mockReturnValue(false);
        expect(select(doc, head, motion, true)).toBe(expected);
    });
});
