import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EditorState } from '@codemirror/state';
import { codeFolding, foldService } from '@codemirror/language';
import { Parser, Language } from 'web-tree-sitter';
import {
    extractFoldMetadata,
    getFoldMetadata,
    setFoldMetadata,
} from '../../../src/fold/metadata';
import { markdownFoldProvider } from '../../../src/fold/provider';
import { foldPlaceholderExtension } from '../../../src/fold/placeholder';

vi.mock('@codemirror/language', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('@codemirror/language')>();
    return { ...original, codeFolding: vi.fn(original.codeFolding) };
});

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

describe('fold metadata', () => {
    let parser: Parser;

    beforeAll(async () => {
        await Parser.init({
            wasmBinary: runtimeWasm.buffer,
            locateFile: () => '',
        });
        const language = await Language.load(markdownWasm);
        parser = new Parser();
        parser.setLanguage(language);
    });

    afterAll(() => {
        parser?.delete();
    });

    function extract(state: EditorState) {
        const tree = parser.parse(state.doc.toString());
        if (!tree) throw new Error('Markdown parse returned null');
        try {
            return extractFoldMetadata(tree, state);
        } finally {
            tree.delete();
        }
    }

    function prepare(doc: string) {
        const state = EditorState.create({
            doc,
            extensions: markdownFoldProvider(),
        });
        const metadata = extract(state);
        setFoldMetadata(state, metadata);
        return { state, metadata };
    }

    function fold(state: EditorState, lineNumber: number) {
        const provider = state.facet(foldService)[0];
        if (!provider) throw new Error('Missing markdown fold provider');
        const line = state.doc.line(lineNumber);
        return provider(state, line.from, line.to);
    }

    function label(state: EditorState, fromLine: number, toLine: number) {
        foldPlaceholderExtension();
        const config = vi.mocked(codeFolding).mock.lastCall?.[0];
        if (!config?.preparePlaceholder)
            throw new Error('Missing placeholder callback');
        return config.preparePlaceholder(state, {
            from: state.doc.line(fromLine).to,
            to: state.doc.line(toLine).to,
        });
    }

    it('excludes trailing blank lines from the heading range', () => {
        const { state, metadata } = prepare('# Title\n\nBody\n \t\n\n');
        expect(metadata.headingsByLineStart.get(0)).toEqual({
            from: state.doc.line(1).to,
            to: state.doc.line(3).to,
            title: 'Title',
        });
    });

    it('does not swallow the next same-level heading at a column-zero exclusive end', () => {
        const { state, metadata } = prepare('# First\nBody\n# Second\nOther\n');
        const tree = parser.parse(state.doc.toString());
        if (!tree) throw new Error('Markdown parse returned null');
        try {
            const section = tree.rootNode.descendantsOfType('section')[0];
            expect(section?.endPosition).toEqual({ row: 2, column: 0 });
        } finally {
            tree.delete();
        }
        expect(metadata.headingsByLineStart.get(0)?.to).toBe(
            state.doc.line(2).to,
        );
        expect(fold(state, 1)).toEqual({
            from: state.doc.line(1).to,
            to: state.doc.line(2).to,
        });
        expect(
            metadata.headingsByLineStart.get(state.doc.line(3).from)?.title,
        ).toBe('Second');
    });

    it('includes a nested lower-level section in its parent fold', () => {
        const { state, metadata } = prepare(
            '# Parent\nIntro\n## Child\nChild body\n\n# Next\nEnd',
        );
        expect(metadata.headingsByLineStart.get(0)?.to).toBe(
            state.doc.line(4).to,
        );
        expect(
            metadata.headingsByLineStart.get(state.doc.line(3).from),
        ).toEqual({
            from: state.doc.line(3).to,
            to: state.doc.line(4).to,
            title: 'Child',
        });
    });

    it.each(['', '\n'])(
        'does not fold a heading alone at EOF with suffix %j',
        (suffix) => {
            const { metadata } = prepare(`# Alone${suffix}`);
            expect(metadata.headingsByLineStart.size).toBe(0);
        },
    );

    it.each(['', '\n'])(
        'folds heading content through EOF with suffix %j',
        (suffix) => {
            const { state, metadata } = prepare(`# Title\nBody${suffix}`);
            expect(metadata.headingsByLineStart.get(0)?.to).toBe(
                state.doc.line(2).to,
            );
        },
    );

    it('does not produce a heading entry or regex fold inside a fenced code block', () => {
        const { state, metadata } = prepare(
            '```md\n# Fake heading\nBody\n```\n',
        );
        expect(metadata.headingsByLineStart.size).toBe(0);
        expect(fold(state, 2)).toBeNull();
    });

    it.each([0, 1, 2, 3])(
        'accepts a heading indented by %i spaces',
        (spaces) => {
            const { state, metadata } = prepare(
                `${' '.repeat(spaces)}# Title\nBody\n`,
            );
            expect(metadata.headingsByLineStart.get(0)).toEqual({
                from: state.doc.line(1).to,
                to: state.doc.line(2).to,
                title: 'Title',
            });
            expect(label(state, 1, 2)).toBe('Title — 1 lines');
        },
    );

    it.each([
        { opening: '```  typescript extra  ', language: 'typescript extra' },
        { opening: '```', language: 'code' },
        { opening: '```   ', language: 'code' },
    ])(
        'extracts the fenced-code language and placeholder for $opening',
        ({ opening, language }) => {
            const { state, metadata } = prepare(
                ['Intro', '', opening, 'Body', '```', ''].join('\n'),
            );
            expect(
                metadata.fencedCodeByLineStart.get(state.doc.line(3).from),
            ).toEqual({ language });
            expect(label(state, 3, 5)).toBe(`${language} — 2 lines`);
        },
    );

    it('supports an empty ATX heading and its exact placeholder format', () => {
        const { state, metadata } = prepare('#\nBody\n');
        expect(metadata.headingsByLineStart.get(0)).toEqual({
            from: 1,
            to: state.doc.line(2).to,
            title: '',
        });
        expect(label(state, 1, 2)).toBe(' — 1 lines');
    });

    it('keeps plain metadata usable after the extracted tree is deleted', () => {
        const { state, metadata } = prepare('# 😀 é\nBody');
        expect(getFoldMetadata(state)).toBe(metadata);
        expect(label(state, 1, 2)).toBe('😀 é — 1 lines');
    });

    it('keys metadata by exact EditorState identity, including selection-only states', () => {
        const { state, metadata } = prepare('# Title\nBody');
        const selected = state.update({ selection: { anchor: 2 } }).state;
        expect(getFoldMetadata(selected)).toBeUndefined();
        expect(
            getFoldMetadata(EditorState.create({ doc: state.doc })),
        ).toBeUndefined();
        setFoldMetadata(selected, metadata);
        expect(getFoldMetadata(selected)).toBe(metadata);
        expect(getFoldMetadata(state)).toBe(metadata);
    });

    it('uses the unchanged regex heading fallback only when metadata is unavailable', () => {
        const state = EditorState.create({
            doc: '# Title\nBody\n\n# Next\nEnd',
            extensions: markdownFoldProvider(),
        });
        expect(fold(state, 1)).toEqual({
            from: state.doc.line(1).to,
            to: state.doc.line(2).to,
        });
        expect(label(state, 1, 2)).toBe('Title — 1 lines');
        setFoldMetadata(state, {
            headingsByLineStart: new Map(),
            fencedCodeByLineStart: new Map(),
        });
        expect(fold(state, 1)).toBeNull();
    });

    it.each([
        { doc: '---\na: 1\n---\n', end: 3, label: 'properties — 1 field' },
        {
            doc: '---\na: 1\nb: 2\n---\n',
            end: 4,
            label: 'properties — 2 fields',
        },
        {
            doc: '> [!note] Title\n> Body\n',
            end: 2,
            label: 'note: Title — 1 lines',
        },
        { doc: '> [!note]\n> Body\n', end: 2, label: 'note — 1 lines' },
    ])(
        'preserves frontmatter/callout precedence and placeholder: $label',
        ({ doc, end, label: expected }) => {
            const { state } = prepare(doc);
            expect(fold(state, 1)).toEqual({
                from: state.doc.line(1).to,
                to: state.doc.line(end).to,
            });
            expect(label(state, 1, end)).toBe(expected);
            // Even a heading entry on this line must not outrank these providers.
            setFoldMetadata(state, {
                headingsByLineStart: new Map([
                    [0, { from: 0, to: 1, title: 'Wrong' }],
                ]),
                fencedCodeByLineStart: new Map(),
            });
            expect(fold(state, 1)).toEqual({
                from: state.doc.line(1).to,
                to: state.doc.line(end).to,
            });
        },
    );
});
