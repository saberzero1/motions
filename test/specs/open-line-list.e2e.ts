import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    vimRawKeys,
} from '../helpers';

describe('Smart list continuation (o/O)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('unordered lists', function () {
        it('o on "- " item should continue with "- "', async function () {
            await setupEditor('- item1', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- item1\n- ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
        });

        it('O on "- " item should insert "- " above', async function () {
            await setupEditor('- item1', { line: 0, ch: 0 });
            await vimRawKeys('O\x1b');
            expect(await getEditorValue()).toBe('- \n- item1');
            expect(await getCursorPos()).toEqual({ line: 0, ch: 1 });
        });

        it('o on "* " item should continue with "* "', async function () {
            await setupEditor('* item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('* item\n* ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
        });

        it('o on "+ " item should continue with "+ "', async function () {
            await setupEditor('+ item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('+ item\n+ ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
        });
    });

    describe('ordered lists', function () {
        it('o on "1. " should continue with "2. "', async function () {
            await setupEditor('1. item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('1. item\n2. ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 2 });
        });

        it('O on ordered list should insert numbered line above', async function () {
            await setupEditor('2. item', { line: 0, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines.length).toBe(2);
            expect(lines[1]).toBe('2. item');
            expect(lines[0]).toMatch(/^\d+\.\s$/);
            expect(await getCursorPos()).toEqual({ line: 0, ch: 2 });
        });

        it('o on "1) " should continue with "2) "', async function () {
            await setupEditor('1) item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('1) item\n2) ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 2 });
        });
    });

    describe('task lists', function () {
        it('o on unchecked task should continue with "- [ ] "', async function () {
            await setupEditor('- [ ] todo', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- [ ] todo\n- [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });

        it('o on checked task should continue with "- [ ] "', async function () {
            await setupEditor('- [x] done', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- [x] done\n- [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });

        it('o on custom "[!]" task should continue with "- [ ] "', async function () {
            await setupEditor('- [!] urgent', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- [!] urgent\n- [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });

        it('o on custom "[?]" task should continue with "- [ ] "', async function () {
            await setupEditor('- [?] maybe', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- [?] maybe\n- [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });

        it('o on custom "[/]" task should continue with "- [ ] "', async function () {
            await setupEditor('- [/] partial', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- [/] partial\n- [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });
    });

    describe('ordered task lists', function () {
        it('o on "1. [ ] " should continue with "2. [ ] "', async function () {
            await setupEditor('1. [ ] todo', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('1. [ ] todo\n2. [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 6 });
        });

        it('o on "1. [x] " should continue with "2. [ ] "', async function () {
            await setupEditor('1. [x] done', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('1. [x] done\n2. [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 6 });
        });

        it('O on "2. [ ] " should insert above with same number', async function () {
            await setupEditor('2. [ ] task', { line: 0, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            expect(value).toContain('[ ] \n2. [ ] task');
            const cursor = await getCursorPos();
            expect(cursor.line).toBe(0);
        });
    });

    describe('indented lists', function () {
        it('o on indented unordered "  - "', async function () {
            await setupEditor('  - nested', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('  - nested\n  - ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 3 });
        });

        it('o on indented ordered "  1. "', async function () {
            await setupEditor('  1. nested', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('  1. nested\n  2. ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 4 });
        });

        it('o on indented task "  - [ ] "', async function () {
            await setupEditor('  - [ ] nested', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('  - [ ] nested\n  - [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 7 });
        });

        it('o on indented ordered task "  1. [ ] "', async function () {
            await setupEditor('  1. [ ] nested', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('  1. [ ] nested\n  2. [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 8 });
        });
    });

    describe('blockquote lists', function () {
        it('o on blockquote unordered "> - "', async function () {
            await setupEditor('> - item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> - item\n> - ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 3 });
        });

        it('O on blockquote unordered "> - "', async function () {
            await setupEditor('> - item', { line: 0, ch: 0 });
            await vimRawKeys('O\x1b');
            expect(await getEditorValue()).toBe('> - \n> - item');
            expect(await getCursorPos()).toEqual({ line: 0, ch: 3 });
        });

        it('o on blockquote ordered "> 1. "', async function () {
            await setupEditor('> 1. item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> 1. item\n> 2. ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 4 });
        });

        it('o on blockquote task "> - [ ] "', async function () {
            await setupEditor('> - [ ] item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> - [ ] item\n> - [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 7 });
        });

        it('o on blockquote ordered task "> 1. [ ] "', async function () {
            await setupEditor('> 1. [ ] item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> 1. [ ] item\n> 2. [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 8 });
        });
    });

    describe('nested blockquote lists', function () {
        it('o on nested blockquote unordered "> > - "', async function () {
            await setupEditor('> > - item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> > - item\n> > - ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });

        it('o on nested blockquote ordered "> > 1. "', async function () {
            await setupEditor('> > 1. item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> > 1. item\n> > 2. ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 6 });
        });

        it('o on nested blockquote task "> > - [ ] "', async function () {
            await setupEditor('> > - [ ] item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> > - [ ] item\n> > - [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 9 });
        });

        it('o on nested blockquote ordered task "> > 1. [ ] "', async function () {
            await setupEditor('> > 1. [ ] item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('> > 1. [ ] item\n> > 2. [ ] ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 10 });
        });
    });

    describe('frontmatter boundary', function () {
        it('O on first list line after frontmatter should insert above', async function () {
            const content = ['---', 'title: test', '---', '- item1'].join('\n');
            await setupEditor(content, { line: 3, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toBe('- ');
            expect(lines[4]).toBe('- item1');
            expect(await getCursorPos()).toEqual({ line: 3, ch: 1 });
        });

        it('o on first list line after frontmatter should insert below', async function () {
            const content = ['---', 'title: test', '---', '- item1'].join('\n');
            await setupEditor(content, { line: 3, ch: 0 });
            await vimRawKeys('o\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toBe('- item1');
            expect(lines[4]).toBe('- ');
            expect(await getCursorPos()).toEqual({ line: 4, ch: 1 });
        });

        it('O on ordered list after frontmatter should insert above', async function () {
            const content = ['---', 'title: test', '---', '1. first'].join(
                '\n',
            );
            await setupEditor(content, { line: 3, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toMatch(/^\d+\.\s$/);
            expect(lines[4]).toMatch(/^\d+\.\sfirst$/);
            expect((await getCursorPos()).line).toBe(3);
        });

        it('O on task list after frontmatter should insert above', async function () {
            const content = ['---', 'title: test', '---', '- [ ] todo'].join(
                '\n',
            );
            await setupEditor(content, { line: 3, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toBe('- [ ] ');
            expect(lines[4]).toBe('- [ ] todo');
            expect(await getCursorPos()).toEqual({ line: 3, ch: 5 });
        });

        it('O on non-list line after frontmatter should insert above', async function () {
            const content = ['---', 'title: test', '---', 'plain text'].join(
                '\n',
            );
            await setupEditor(content, { line: 3, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toBe('');
            expect(lines[4]).toBe('plain text');
        });

        it('o on non-list line after frontmatter should insert below', async function () {
            const content = ['---', 'title: test', '---', 'plain text'].join(
                '\n',
            );
            await setupEditor(content, { line: 3, ch: 0 });
            await vimRawKeys('o\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toBe('plain text');
            expect(lines[4]).toBe('');
        });

        it('O on second line after frontmatter should use normal insertion', async function () {
            const content = [
                '---',
                'title: test',
                '---',
                '- first',
                '- second',
            ].join('\n');
            await setupEditor(content, { line: 4, ch: 0 });
            await vimRawKeys('O\x1b');
            const value = await getEditorValue();
            const lines = value.split('\n');
            expect(lines[3]).toBe('- first');
            expect(lines[4]).toBe('- ');
            expect(lines[5]).toBe('- second');
            expect(await getCursorPos()).toEqual({ line: 4, ch: 1 });
        });
    });

    describe('fallback and edge cases', function () {
        it('o on non-list line should not add marker', async function () {
            await setupEditor('plain text', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            const value = await getEditorValue();
            expect(value).toBe('plain text\n');
        });

        it('o with cursor mid-line should still continue list', async function () {
            await setupEditor('- item', { line: 0, ch: 3 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- item\n- ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
        });

        it('o on bare marker should continue list', async function () {
            await setupEditor('- ', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- \n- ');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
        });

        it('o between list items should insert correctly', async function () {
            await setupEditor('- a\n- b', { line: 0, ch: 0 });
            await vimRawKeys('o\x1b');
            expect(await getEditorValue()).toBe('- a\n- \n- b');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 1 });
        });

        it('o then typing content should place text after marker', async function () {
            await setupEditor('- item1', { line: 0, ch: 0 });
            await vimRawKeys('otext\x1b');
            expect(await getEditorValue()).toBe('- item1\n- text');
            expect(await getCursorPos()).toEqual({ line: 1, ch: 5 });
        });

        it('u should undo o on list line', async function () {
            await setupEditor('- item', { line: 0, ch: 0 });
            await vimRawKeys('o\x1bu');
            expect(await getEditorValue()).toBe('- item');
        });

        it('o inside code block should not add list marker', async function () {
            await setupEditor('```\n- not a list\n```', { line: 1, ch: 0 });
            await vimRawKeys('o\x1b');
            const value = await getEditorValue();
            expect(value).not.toContain('- \n- ');
        });
    });
});
