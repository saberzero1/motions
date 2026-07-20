import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getSelection,
    getCursorPos,
    getRegisterContent,
    getVimMode,
    vimKeys,
    setupEditor,
} from '../helpers';

describe('Indentation text objects (ii/ai)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('ii (inner indentation)', function () {
        it('vii should select same-indent block', async function () {
            await setupEditor(
                'top\n    indented line one\n    indented line two\n    indented line three\nbottom',
                { line: 2, ch: 4 },
            );
            await vimKeys('v', 'i', 'i');
            const sel = await getSelection();
            expect(sel).toContain('indented line one');
            expect(sel).toContain('indented line two');
            expect(sel).toContain('indented line three');
            expect(sel).not.toContain('top');
            expect(sel).not.toContain('bottom');
        });

        it('dii should delete indented block', async function () {
            await setupEditor('parent\n    child a\n    child b\nsibling', {
                line: 1,
                ch: 4,
            });
            await vimKeys('d', 'i', 'i');
            const value = await getEditorValue();
            expect(value).toContain('parent');
            expect(value).toContain('sibling');
            expect(value).not.toContain('child a');
            expect(value).not.toContain('child b');
        });

        it('should return no match on zero-indent line', async function () {
            await setupEditor('no indent here\nanother line', {
                line: 0,
                ch: 0,
            });
            await vimKeys('v', 'i', 'i');
            const sel = await getSelection();
            expect(sel.length).toBeLessThanOrEqual(1);
        });

        it('should return no match on blank line', async function () {
            await setupEditor('above\n\nbelow', { line: 1, ch: 0 });
            await vimKeys('v', 'i', 'i');
            const sel = await getSelection();
            expect(sel.length).toBeLessThanOrEqual(1);
        });

        it('should select single-line indented block', async function () {
            await setupEditor('parent\n    only child\nsibling', {
                line: 1,
                ch: 4,
            });
            await vimKeys('v', 'i', 'i');
            const sel = await getSelection();
            expect(sel).toContain('only child');
            expect(sel).not.toContain('parent');
            expect(sel).not.toContain('sibling');
        });

        it('should only select inner nesting level', async function () {
            await setupEditor(
                'root\n  level1 a\n    level2 a\n    level2 b\n  level1 b\nroot2',
                { line: 2, ch: 4 },
            );
            await vimKeys('v', 'i', 'i');
            const sel = await getSelection();
            expect(sel).toContain('level2 a');
            expect(sel).toContain('level2 b');
            expect(sel).not.toContain('level1 a');
            expect(sel).not.toContain('level1 b');
        });

        it('yii should yank indented block without modifying buffer', async function () {
            await setupEditor('header\n    item 1\n    item 2\nfooter', {
                line: 1,
                ch: 4,
            });
            await vimKeys('y', 'i', 'i');
            const value = await getEditorValue();
            expect(value).toBe('header\n    item 1\n    item 2\nfooter');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg?.text).toContain('item 1');
            expect(reg?.text).toContain('item 2');
        });
    });

    describe('ai (around indentation)', function () {
        it('vai should include parent line above', async function () {
            await setupEditor(
                'root\nparent\n    child a\n    child b\nsibling',
                { line: 2, ch: 4 },
            );
            await vimKeys('v', 'a', 'i');
            const sel = await getSelection();
            expect(sel).toContain('parent');
            expect(sel).toContain('child a');
            expect(sel).toContain('child b');
            expect(sel).not.toContain('root');
        });

        it('dai should delete parent + indented block + trailing blanks', async function () {
            await setupEditor(
                'root\nparent\n    child a\n    child b\n\nsibling',
                { line: 2, ch: 4 },
            );
            await vimKeys('d', 'a', 'i');
            const value = await getEditorValue();
            expect(value).toContain('root');
            expect(value).toContain('sibling');
            expect(value).not.toContain('parent');
            expect(value).not.toContain('child');
        });

        it('cai should change around indentation and enter insert mode', async function () {
            await setupEditor('before\nparent\n    child\nafter', {
                line: 2,
                ch: 4,
            });
            await vimKeys('c', 'a', 'i');
            const value = await getEditorValue();
            expect(value).toContain('before');
            expect(value).toContain('after');
            expect(value).not.toContain('parent');
            expect(value).not.toContain('child');
            const mode = await getVimMode();
            expect(mode).toBe('insert');
        });
    });

    describe('edge cases', function () {
        it('dii with deeply nested indentation only deletes inner level', async function () {
            await setupEditor(
                'root\n  level1\n    level2 a\n    level2 b\n  level1 end\nroot end',
                { line: 2, ch: 4 },
            );
            await vimKeys('d', 'i', 'i');
            const value = await getEditorValue();
            expect(value).toContain('level1');
            expect(value).toContain('root');
            expect(value).not.toContain('level2');
        });

        it('ii on line with greater indentation includes it in selection', async function () {
            await setupEditor(
                'parent\n    child\n        grandchild\n    child2\nsibling',
                { line: 1, ch: 4 },
            );
            await vimKeys('v', 'i', 'i');
            const sel = await getSelection();
            expect(sel).toContain('child');
            expect(sel).toContain('grandchild');
            expect(sel).toContain('child2');
            expect(sel).not.toContain('parent');
            expect(sel).not.toContain('sibling');
        });

        it('cursor position after dii should be on the line above', async function () {
            await setupEditor('parent\n    child a\n    child b\nsibling', {
                line: 1,
                ch: 4,
            });
            await vimKeys('d', 'i', 'i');
            const pos = await getCursorPos();
            expect(pos.line).toBeLessThanOrEqual(1);
        });
    });
});
