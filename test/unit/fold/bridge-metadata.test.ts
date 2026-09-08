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
import { EditorState, type Transaction } from '@codemirror/state';
import type { EditorView, PluginValue, ViewUpdate } from '@codemirror/view';
import { Parser, Language } from 'web-tree-sitter';
import { createBridgeExtension } from '../../../src/treesitter/bridge';
import { getOrCreateParser } from '../../../src/treesitter/runtime';
import { getTreeForView } from '../../../src/treesitter/tree-state';
import { getFoldMetadata } from '../../../src/fold/metadata';

const bridgeFactory = vi.hoisted(() => ({
    create: undefined as ((view: EditorView) => PluginValue) | undefined,
}));

vi.mock('@codemirror/view', () => ({
    ViewPlugin: {
        define: (create: (view: EditorView) => PluginValue) => {
            bridgeFactory.create = create;
            return [];
        },
    },
}));
vi.mock('../../../src/treesitter/runtime', () => ({
    getOrCreateParser: vi.fn(),
}));

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

describe('bridge fold metadata publication', () => {
    let parser: Parser;
    let plugin: PluginValue | undefined;

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
        plugin?.destroy?.();
        plugin = undefined;
        vi.restoreAllMocks();
    });

    afterAll(() => {
        parser?.delete();
    });

    function create(doc = '# Title\nBody') {
        vi.mocked(getOrCreateParser).mockReturnValue(parser);
        createBridgeExtension('markdown');
        if (!bridgeFactory.create) throw new Error('Missing bridge factory');
        // Only the host lifecycle is simulated; parsing and states are real.
        const view = { state: EditorState.create({ doc }), dispatch: vi.fn() };
        const editorView = view as unknown as EditorView;
        plugin = bridgeFactory.create(editorView);
        return { view, editorView };
    }

    function update(view: { state: EditorState }, transaction: Transaction) {
        view.state = transaction.state;
        plugin?.update?.({
            state: transaction.state,
            docChanged: transaction.docChanged,
            changes: transaction.changes,
        } as ViewUpdate);
    }

    it('publishes initial metadata and reuses it for a selection-only state without dispatching', () => {
        const { view } = create();
        const original = view.state;
        const metadata = getFoldMetadata(original);
        expect(metadata?.headingsByLineStart.get(0)?.title).toBe('Title');
        const parse = vi.spyOn(parser, 'parse');
        update(view, original.update({ selection: { anchor: 2 } }));
        expect(view.state).not.toBe(original);
        expect(getFoldMetadata(view.state)).toBe(metadata);
        expect(parse).not.toHaveBeenCalled();
        expect(view.dispatch).not.toHaveBeenCalled();
    });

    it('re-extracts after edits while old states remain usable after tree replacement and destroy', () => {
        const { view, editorView } = create();
        const original = view.state;
        const metadata = getFoldMetadata(original);
        const tree = getTreeForView(editorView);
        if (!tree) throw new Error('Missing published tree');
        const deleted = vi.spyOn(tree, 'delete');
        update(
            view,
            original.update({
                changes: { from: 2, to: 7, insert: 'New title' },
            }),
        );
        expect(deleted).toHaveBeenCalledTimes(1);
        expect(getFoldMetadata(view.state)).not.toBe(metadata);
        expect(
            getFoldMetadata(view.state)?.headingsByLineStart.get(0)?.title,
        ).toBe('New title');
        expect(
            getFoldMetadata(original)?.headingsByLineStart.get(0)?.title,
        ).toBe('Title');
        plugin?.destroy?.();
        plugin = undefined;
        expect(getTreeForView(editorView)).toBeNull();
        expect(deleted).toHaveBeenCalledTimes(1);
        expect(
            getFoldMetadata(view.state)?.headingsByLineStart.get(0)?.title,
        ).toBe('New title');
        expect(view.dispatch).not.toHaveBeenCalled();
    });

    it('does not publish for a null initial tree or selection-only state and recovers on edit', () => {
        vi.spyOn(parser, 'parse').mockReturnValueOnce(null);
        const { view, editorView } = create();
        expect(getFoldMetadata(view.state)).toBeUndefined();
        expect(getTreeForView(editorView)).toBeNull();
        update(view, view.state.update({ selection: { anchor: 2 } }));
        expect(getFoldMetadata(view.state)).toBeUndefined();
        update(
            view,
            view.state.update({
                changes: { from: view.state.doc.length, insert: ' more' },
            }),
        );
        expect(
            getFoldMetadata(view.state)?.headingsByLineStart.get(0)?.to,
        ).toBe(view.state.doc.length);
    });

    it('does not republish stale metadata after a failed incremental parse', () => {
        const { view, editorView } = create();
        const original = view.state;
        const tree = getTreeForView(editorView);
        if (!tree) throw new Error('Missing published tree');
        const deleted = vi.spyOn(tree, 'delete');
        vi.spyOn(parser, 'parse').mockReturnValueOnce(null);
        update(
            view,
            view.state.update({ changes: { from: 2, insert: 'New ' } }),
        );
        expect(deleted).toHaveBeenCalledTimes(1);
        expect(getTreeForView(editorView)).toBeNull();
        expect(getFoldMetadata(view.state)).toBeUndefined();
        update(view, view.state.update({ selection: { anchor: 1 } }));
        expect(getFoldMetadata(view.state)).toBeUndefined();
        expect(
            getFoldMetadata(original)?.headingsByLineStart.get(0)?.title,
        ).toBe('Title');
    });
});
