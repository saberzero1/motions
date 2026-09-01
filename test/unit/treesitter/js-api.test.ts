import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Parser, Language } from 'web-tree-sitter';

vi.mock('../../../src/treesitter/runtime', () => ({}));
vi.mock('../../../src/treesitter/bridge', () => ({
    getTreeForView: () => null,
}));

const { hasAncestorOfType, findAncestorOfType } =
    await import('../../../src/treesitter/js-api');

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
const markdownInlineWasm = readFileSync(
    resolve(
        __dirname,
        '../../../src/treesitter/grammars/tree-sitter-markdown-inline.wasm',
    ),
);

describe('treesitter js-api helpers', () => {
    let parser: Parser;
    let lang: Language;

    beforeAll(async () => {
        await Parser.init({
            wasmBinary: runtimeWasm.buffer,
            locateFile: () => '',
        });
        lang = await Language.load(markdownWasm);
        parser = new Parser();
        parser.setLanguage(lang);
    });

    afterAll(() => {
        parser?.delete();
    });

    describe('hasAncestorOfType', () => {
        it('returns true when ancestor exists', () => {
            const tree = parser.parse('# Hello World\n');
            const heading = tree!.rootNode.child(0)?.child(0);
            expect(heading).toBeDefined();
            expect(hasAncestorOfType(heading!, 'section')).toBe(true);
            expect(hasAncestorOfType(heading!, 'document')).toBe(true);
            tree!.delete();
        });

        it('returns false when no ancestor matches', () => {
            const tree = parser.parse('# Hello\n');
            const root = tree!.rootNode;
            expect(hasAncestorOfType(root, 'fenced_code_block')).toBe(false);
            tree!.delete();
        });

        it('returns false for root node', () => {
            const tree = parser.parse('text\n');
            expect(hasAncestorOfType(tree!.rootNode, 'document')).toBe(false);
            tree!.delete();
        });
    });

    describe('findAncestorOfType', () => {
        it('returns the ancestor node when found', () => {
            const tree = parser.parse('# Hello\n\nParagraph\n');
            const section = tree!.rootNode.child(0);
            expect(section).toBeDefined();
            expect(section!.type).toBe('section');
            const heading = section!.child(0);
            expect(heading).toBeDefined();
            const found = findAncestorOfType(heading!, 'section');
            expect(found).not.toBeNull();
            expect(found!.type).toBe('section');
            tree!.delete();
        });

        it('returns null when no ancestor matches', () => {
            const tree = parser.parse('Plain text\n');
            const root = tree!.rootNode;
            expect(findAncestorOfType(root, 'fenced_code_block')).toBeNull();
            tree!.delete();
        });
    });

    describe('node position queries (via raw tree)', () => {
        it('descendantForPosition finds node at heading', () => {
            const tree = parser.parse('# Hello\n\nWorld\n');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 2,
            });
            expect(node).not.toBeNull();
            expect(
                hasAncestorOfType(node!, 'atx_heading') ||
                    node!.type === 'atx_heading' ||
                    hasAncestorOfType(node!, 'section'),
            ).toBe(true);
            tree!.delete();
        });

        it('descendantForPosition finds node in paragraph', () => {
            const tree = parser.parse('# Heading\n\nParagraph text\n');
            const node = tree!.rootNode.descendantForPosition({
                row: 2,
                column: 0,
            });
            expect(node).not.toBeNull();
            tree!.delete();
        });

        it('namedDescendantForPosition finds named node', () => {
            const tree = parser.parse('# Hello\n\nWorld\n');
            const node = tree!.rootNode.namedDescendantForPosition({
                row: 0,
                column: 0,
            });
            expect(node).not.toBeNull();
            expect(node!.isNamed).toBe(true);
            tree!.delete();
        });
    });

    describe('node type checking for context detection', () => {
        it('detects position inside fenced code block', () => {
            const source =
                '# Heading\n\n```js\nconsole.log("hi")\n```\n\nText\n';
            const tree = parser.parse(source);
            const nodeInCode = tree!.rootNode.descendantForPosition({
                row: 3,
                column: 0,
            });
            expect(nodeInCode).not.toBeNull();
            const inCodeBlock =
                nodeInCode!.type === 'fenced_code_block' ||
                hasAncestorOfType(nodeInCode!, 'fenced_code_block');
            expect(inCodeBlock).toBe(true);
            tree!.delete();
        });

        it('detects position outside fenced code block', () => {
            const source =
                '# Heading\n\n```js\nconsole.log("hi")\n```\n\nText\n';
            const tree = parser.parse(source);
            const nodeOutside = tree!.rootNode.descendantForPosition({
                row: 6,
                column: 0,
            });
            expect(nodeOutside).not.toBeNull();
            const inCodeBlock =
                nodeOutside!.type === 'fenced_code_block' ||
                hasAncestorOfType(nodeOutside!, 'fenced_code_block');
            expect(inCodeBlock).toBe(false);
            tree!.delete();
        });

        it('detects position inside blockquote', () => {
            const source = '> Quoted text\n> More quoted\n\nNormal\n';
            const tree = parser.parse(source);
            const nodeInQuote = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 2,
            });
            expect(nodeInQuote).not.toBeNull();
            const inBlockquote =
                nodeInQuote!.type === 'block_quote' ||
                hasAncestorOfType(nodeInQuote!, 'block_quote');
            expect(inBlockquote).toBe(true);
            tree!.delete();
        });

        it('detects headings via section nesting', () => {
            const source = '# One\n\n## Two\n\n### Three\n';
            const tree = parser.parse(source);
            const sections = tree!.rootNode.namedChildren.filter(
                (n) => n.type === 'section',
            );
            expect(sections.length).toBeGreaterThanOrEqual(1);
            tree!.delete();
        });
    });

    describe('tree cursor iteration', () => {
        it('collects all headings via tree walk', () => {
            const source = '# One\n\n## Two\n\n## Three\n\n# Four\n';
            const tree = parser.parse(source);
            const headings: Array<{ type: string; row: number }> = [];

            function walk(node: import('web-tree-sitter').Node): void {
                if (node.type === 'atx_heading') {
                    headings.push({
                        type: node.type,
                        row: node.startPosition.row,
                    });
                }
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (child) walk(child);
                }
            }
            walk(tree!.rootNode);

            expect(headings.length).toBe(4);
            expect(headings[0]!.row).toBe(0);
            expect(headings[1]!.row).toBe(2);
            expect(headings[2]!.row).toBe(4);
            expect(headings[3]!.row).toBe(6);
            tree!.delete();
        });

        it('section nesting reflects heading hierarchy', () => {
            const source = '# Parent\n\n## Child A\n\n## Child B\n';
            const tree = parser.parse(source);
            const topSections = tree!.rootNode.namedChildren.filter(
                (n) => n.type === 'section',
            );
            expect(topSections.length).toBe(1);
            const parentSection = topSections[0]!;
            const nestedSections = parentSection.namedChildren.filter(
                (n) => n.type === 'section',
            );
            expect(nestedSections.length).toBe(2);
            tree!.delete();
        });
    });

    describe('inline node detection', () => {
        let inlineParser: Parser;
        let inlineLang: Language;

        beforeAll(async () => {
            inlineLang = await Language.load(markdownInlineWasm);
            inlineParser = new Parser();
            inlineParser.setLanguage(inlineLang);
        });

        afterAll(() => {
            inlineParser?.delete();
        });

        it('detects strong_emphasis node', () => {
            const tree = inlineParser.parse('text **bold** end');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 7,
            });
            expect(node).not.toBeNull();
            const isStrong =
                node!.type === 'strong_emphasis' ||
                hasAncestorOfType(node!, 'strong_emphasis');
            expect(isStrong).toBe(true);
            tree!.delete();
        });

        it('detects emphasis node', () => {
            const tree = inlineParser.parse('text *italic* end');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 6,
            });
            expect(node).not.toBeNull();
            const isEmph =
                node!.type === 'emphasis' ||
                hasAncestorOfType(node!, 'emphasis');
            expect(isEmph).toBe(true);
            tree!.delete();
        });

        it('detects code_span node', () => {
            const tree = inlineParser.parse('text `code` end');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 6,
            });
            expect(node).not.toBeNull();
            const isCode =
                node!.type === 'code_span' ||
                hasAncestorOfType(node!, 'code_span');
            expect(isCode).toBe(true);
            tree!.delete();
        });

        it('detects inline_link node', () => {
            const tree = inlineParser.parse('see [link](url) here');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 5,
            });
            expect(node).not.toBeNull();
            const isLink =
                node!.type === 'inline_link' ||
                hasAncestorOfType(node!, 'inline_link');
            expect(isLink).toBe(true);
            tree!.delete();
        });

        it('detects strikethrough node', () => {
            const tree = inlineParser.parse('text ~~struck~~ end');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 7,
            });
            expect(node).not.toBeNull();
            const isStrike =
                node!.type === 'strikethrough' ||
                hasAncestorOfType(node!, 'strikethrough');
            expect(isStrike).toBe(true);
            tree!.delete();
        });

        it('position outside emphasis returns false', () => {
            const tree = inlineParser.parse('text **bold** end');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 0,
            });
            expect(node).not.toBeNull();
            expect(hasAncestorOfType(node!, 'strong_emphasis')).toBe(false);
            expect(node!.type).not.toBe('strong_emphasis');
            tree!.delete();
        });

        it('nested emphasis: cursor on inner italic finds emphasis', () => {
            const tree = inlineParser.parse('**bold *italic* bold**');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 8,
            });
            expect(node).not.toBeNull();
            const isEmph =
                node!.type === 'emphasis' ||
                hasAncestorOfType(node!, 'emphasis');
            expect(isEmph).toBe(true);
            tree!.delete();
        });

        it('nested emphasis: cursor on outer bold finds strong_emphasis', () => {
            const tree = inlineParser.parse('**bold *italic* bold**');
            const node = tree!.rootNode.descendantForPosition({
                row: 0,
                column: 3,
            });
            expect(node).not.toBeNull();
            const isStrong =
                node!.type === 'strong_emphasis' ||
                hasAncestorOfType(node!, 'strong_emphasis');
            expect(isStrong).toBe(true);
            tree!.delete();
        });
    });
});
