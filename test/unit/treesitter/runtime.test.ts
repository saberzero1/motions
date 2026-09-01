import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Parser, Language } from 'web-tree-sitter';

const runtimeWasmPath = resolve(
    __dirname,
    '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
);
const markdownWasmPath = resolve(
    __dirname,
    '../../../src/treesitter/grammars/tree-sitter-markdown.wasm',
);
const htmlWasmPath = resolve(
    __dirname,
    '../../../src/treesitter/grammars/tree-sitter-html.wasm',
);

describe('tree-sitter WASM runtime', () => {
    let parser: Parser;
    let markdownLang: Language;

    afterAll(() => {
        parser?.delete();
    });

    it('Parser.init() succeeds with wasmBinary', async () => {
        const wasmBinary = readFileSync(runtimeWasmPath);
        await Parser.init({
            wasmBinary: wasmBinary.buffer,
        } as Record<string, unknown>);
    });

    it('Language.load() loads markdown grammar', async () => {
        const grammarBytes = readFileSync(markdownWasmPath);
        markdownLang = await Language.load(grammarBytes);
        expect(markdownLang).toBeDefined();
    });

    it('Language.load() loads html grammar', async () => {
        const grammarBytes = readFileSync(htmlWasmPath);
        const htmlLang = await Language.load(grammarBytes);
        expect(htmlLang).toBeDefined();
    });

    it('parser.parse() produces a valid tree', () => {
        parser = new Parser();
        parser.setLanguage(markdownLang);

        const tree = parser.parse('# Hello\n\nParagraph text');
        expect(tree).not.toBeNull();
        expect(tree!.rootNode.type).toBe('document');
        expect(tree!.rootNode.childCount).toBeGreaterThan(0);
        tree!.delete();
    });

    it('rootNode children have correct structure', () => {
        const tree = parser.parse('# Heading\n\nBody paragraph\n');
        const root = tree!.rootNode;

        expect(root.type).toBe('document');
        expect(root.childCount).toBeGreaterThanOrEqual(1);

        const firstChild = root.child(0);
        expect(firstChild).not.toBeNull();
        expect(firstChild!.type).toBe('section');

        tree!.delete();
    });

    it('node positions are 0-indexed', () => {
        const tree = parser.parse('# Hello\n\nWorld');
        const root = tree!.rootNode;

        expect(root.startPosition.row).toBe(0);
        expect(root.startPosition.column).toBe(0);
        expect(root.startIndex).toBe(0);
        expect(root.endIndex).toBeGreaterThan(0);

        tree!.delete();
    });

    it('node navigation works (parent, children, siblings)', () => {
        const tree = parser.parse('# One\n\n## Two\n\nText');
        const root = tree!.rootNode;

        const first = root.child(0);
        expect(first).not.toBeNull();
        expect(first!.parent?.type).toBe('document');

        if (root.childCount > 1) {
            const second = root.child(1);
            expect(second).not.toBeNull();
            expect(first!.nextSibling?.equals(second!)).toBe(true);
        }

        tree!.delete();
    });

    it('incremental parse produces same result as full reparse', () => {
        const original = '# Hello\n\nWorld';
        const tree1 = parser.parse(original);

        tree1!.edit({
            startIndex: 2,
            oldEndIndex: 7,
            newEndIndex: 10,
            startPosition: { row: 0, column: 2 },
            oldEndPosition: { row: 0, column: 7 },
            newEndPosition: { row: 0, column: 10 },
        });

        const modified = '# Greetings\n\nWorld';
        const tree2 = parser.parse(modified, tree1!);
        const treeFresh = parser.parse(modified);

        expect(tree2!.rootNode.toString()).toBe(treeFresh!.rootNode.toString());

        tree1!.delete();
        tree2!.delete();
        treeFresh!.delete();
    });

    it('tree.delete() and parser.delete() do not throw', () => {
        const tree = parser.parse('test');
        expect(() => tree!.delete()).not.toThrow();

        const tempParser = new Parser();
        tempParser.setLanguage(markdownLang);
        expect(() => tempParser.delete()).not.toThrow();
    });

    it('node.text returns correct text', () => {
        const source = '# Hello World';
        const tree = parser.parse(source);
        expect(tree!.rootNode.text).toBe(source);
        tree!.delete();
    });

    it('multi-byte characters produce correct positions', () => {
        const source = '# 你好世界\n\nEmoji 🌍 test';
        const tree = parser.parse(source);
        const root = tree!.rootNode;

        expect(root.type).toBe('document');
        expect(root.endIndex).toBeGreaterThan(0);
        expect(root.text).toBe(source);

        tree!.delete();
    });

    it('toString() returns S-expression', () => {
        const tree = parser.parse('# Hi\n');
        const sexpr = tree!.rootNode.toString();
        expect(sexpr).toContain('document');
        expect(sexpr).toContain('atx_heading');
        tree!.delete();
    });
});
