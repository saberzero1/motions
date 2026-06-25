import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    PAUSE,
} from '../helpers';

/**
 * Regression tests for issue #14: gj/gk should navigate into block MathJax
 * widgets in live preview instead of skipping over them.
 *
 * These tests require live preview mode (Obsidian's default). In source mode,
 * $$ blocks are plain text and gj/gk works normally regardless.
 *
 * The fix is in the fork's cm_adapter.ts findPosV method, which detects when
 * moveVertically jumps over multiple document lines (indicating a replaced
 * widget decoration) and uses coordinate-based resolution to land inside the
 * widget's source range.
 */
describe('Widget navigation — gj/gk with block widgets (#14)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    const mathjaxContent = [
        'line above',
        '$$',
        'E = mc^2',
        '$$',
        'line below',
    ].join('\n');

    it('gj should step into $$ block one line at a time', async function () {
        await setupEditor(mathjaxContent, { line: 0, ch: 0 });
        await vimKeys('g', 'j');
        expect((await getCursorPos()).line).toBe(1);
        await vimKeys('g', 'j');
        expect((await getCursorPos()).line).toBe(2);
        await vimKeys('g', 'j');
        expect((await getCursorPos()).line).toBe(3);
        await vimKeys('g', 'j');
        expect((await getCursorPos()).line).toBe(4);
    });

    it('gk should step into $$ block one line at a time', async function () {
        await setupEditor(mathjaxContent, { line: 4, ch: 0 });
        await vimKeys('g', 'k');
        expect((await getCursorPos()).line).toBe(3);
        await vimKeys('g', 'k');
        expect((await getCursorPos()).line).toBe(2);
        await vimKeys('g', 'k');
        expect((await getCursorPos()).line).toBe(1);
        await vimKeys('g', 'k');
        expect((await getCursorPos()).line).toBe(0);
    });

    it('j should step into $$ block one line at a time', async function () {
        await setupEditor(mathjaxContent, { line: 0, ch: 0 });
        await vimKeys('j');
        expect((await getCursorPos()).line).toBe(1);
        await vimKeys('j');
        expect((await getCursorPos()).line).toBe(2);
        await vimKeys('j');
        expect((await getCursorPos()).line).toBe(3);
        await vimKeys('j');
        expect((await getCursorPos()).line).toBe(4);
    });

    it('k should step into $$ block one line at a time', async function () {
        await setupEditor(mathjaxContent, { line: 4, ch: 0 });
        await vimKeys('k');
        expect((await getCursorPos()).line).toBe(3);
        await vimKeys('k');
        expect((await getCursorPos()).line).toBe(2);
        await vimKeys('k');
        expect((await getCursorPos()).line).toBe(1);
        await vimKeys('k');
        expect((await getCursorPos()).line).toBe(0);
    });

    it('content should not be modified by navigation', async function () {
        await setupEditor(mathjaxContent, { line: 0, ch: 0 });
        await vimKeys('g', 'j');
        await vimKeys('g', 'j');
        await vimKeys('g', 'k');
        const content = await getEditorValue();
        expect(content).toBe(mathjaxContent);
    });

    const multiBlockContent = [
        'first paragraph',
        '$$',
        'x^2 + y^2 = r^2',
        '$$',
        'middle text',
        '$$',
        '\\int_0^\\infty e^{-x} dx = 1',
        '$$',
        'last paragraph',
    ].join('\n');

    it('gj should navigate through multiple $$ blocks', async function () {
        await setupEditor(multiBlockContent, { line: 0, ch: 0 });
        const positions: number[] = [];
        for (let i = 0; i < 8; i++) {
            await vimKeys('g', 'j');
            positions.push((await getCursorPos()).line);
        }
        for (let i = 1; i < positions.length; i++) {
            expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]!);
        }
        expect(positions.at(-1)).toBe(8);
    });
});
