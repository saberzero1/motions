import { browser, expect } from '@wdio/globals';
import {
    ensureSourceMode,
    getEditorValue,
    handleEx,
    loadSingleFileWorkspace,
    setupEditor,
    vimHandleKeys,
} from '../helpers';

/**
 * `=` in a note. Off, `markdownindent` leaves `=` as Neovim's: without an
 * 'indentexpr', Markdown in Neovim 0.12.6 gives each line the indent of the
 * line above, which flattens `- a / <Tab>- b / - c` into one level. On, `=`
 * keeps a list's nesting, normalized to one 'shiftwidth' a level, takes other
 * lines to no indent and leaves a code block alone.
 */
async function reindent(doc: string, line: number, keys: string) {
    await setupEditor(doc, { line, ch: 0 });
    await vimHandleKeys('\x1b' + keys);
    return getEditorValue();
}

describe('Markdown-aware = (markdownindent)', function () {
    before(async function () {
        await loadSingleFileWorkspace();
        await ensureSourceMode();
    });

    after(async function () {
        await handleEx('set nomarkdownindent');
    });

    it('off: flattens a nested list, as Neovim does', async function () {
        await handleEx('set nomarkdownindent');
        expect(await reindent('- a\n\t- b\n- c', 1, '==')).toBe(
            '- a\n- b\n- c',
        );
        expect(await reindent('para\n\tindented text', 1, '==')).toBe(
            'para\nindented text',
        );
    });

    it('on: keeps the nesting', async function () {
        await handleEx('set markdownindent');
        expect(await reindent('- a\n\t- b\n- c', 1, '==')).toBe(
            '- a\n\t- b\n- c',
        );
    });

    it('on: brings an item two levels deep back to one', async function () {
        await handleEx('set markdownindent');
        expect(await reindent('- a\n\t\t- b', 1, '==')).toBe('- a\n\t- b');
    });

    it('on: leaves a fenced code block alone and takes a paragraph to no indent', async function () {
        await handleEx('set markdownindent');
        expect(await reindent('```\n\tcode\n```\n\tpara', 0, 'gg=G')).toBe(
            '```\n\tcode\n```\npara',
        );
    });

    it('back off: Neovim again', async function () {
        await handleEx('set markdownindent');
        await handleEx('set nomarkdownindent');
        expect(await reindent('- a\n\t- b', 1, '==')).toBe('- a\n- b');
    });
});
