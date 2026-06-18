import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getCursorLine, vimKeys } from '../helpers';

describe('Structural navigation (Phase 1.3-1.4)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Heading navigation (]h/[h)', function () {
        it(']h should jump to next heading', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# H1\n\ntext\n\n## H2\n\nmore\n\n### H3');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'h');
            expect(await getCursorLine()).toBe(4);
        });

        it('[h should jump to previous heading', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# H1\n\ntext\n\n## H2\n\nmore\n\n### H3');
                view.editor.setCursor(8, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('[', 'h');
            expect(await getCursorLine()).toBe(4);
        });

        it(']h with count should skip headings', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# H1\n\n## H2\n\n### H3\n\n#### H4');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('2', ']', 'h');
            expect(await getCursorLine()).toBe(4);
        });

        it('should stay at cursor when no heading found', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('no headings here\njust text');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'h');
            expect(await getCursorLine()).toBe(0);
        });
    });

    describe('Heading by level (]1-]6/[1-[6)', function () {
        it(']2 should jump to next H2', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# H1\n\n### H3\n\n## H2\n\ntext');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', '2');
            expect(await getCursorLine()).toBe(4);
        });

        it('[1 should jump to previous H1', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# First\n\n## Sub\n\n# Second\n\ntext');
                view.editor.setCursor(6, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('[', '1');
            expect(await getCursorLine()).toBe(4);
        });
    });

    describe('List navigation (]l/[l)', function () {
        it(']l should jump to next list item at same indent', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '- item 1\n  - sub item\n- item 2\n- item 3',
                );
                view.editor.setCursor(0, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'l');
            expect(await getCursorLine()).toBe(2);
        });

        it('[l should jump to previous list item at same indent', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '- item 1\n  - sub item\n- item 2\n- item 3',
                );
                view.editor.setCursor(3, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('[', 'l');
            expect(await getCursorLine()).toBe(2);
        });
    });

    describe('Link navigation (]n/[n)', function () {
        it(']n should jump to next link', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('text [[link1]] more [[link2]] end');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'n');
            expect(await getCursorLine()).toBe(0);
        });

        it('[n should jump to previous link', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('text [[link1]] more [[link2]] end');
                view.editor.setCursor(0, 25);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('[', 'n');
            expect(await getCursorLine()).toBe(0);
        });
    });

    describe('Heading by level extended (]3-]6/[3-[6)', function () {
        it(']3 should jump to next H3', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# H1\n\n## H2\n\n### H3\n\ntext');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', '3');
            expect(await getCursorLine()).toBe(4);
        });

        it(']4 should jump to next H4', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# H1\n\n#### H4\n\ntext');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', '4');
            expect(await getCursorLine()).toBe(2);
        });

        it('[3 should jump to previous H3', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue(
                    '### H3\n\ntext\n\n### Another H3\n\nmore',
                );
                view.editor.setCursor(6, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('[', '3');
            expect(await getCursorLine()).toBe(4);
        });
    });

    describe('List navigation extended', function () {
        it(']l with ordered list should jump to next item', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('1. item 1\n2. item 2\n3. item 3');
                view.editor.setCursor(0, 3);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'l');
            expect(await getCursorLine()).toBe(1);
        });
    });

    describe('Edge cases', function () {
        it(']h at last heading should stay put', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('# Only heading');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'h');
            expect(await getCursorLine()).toBe(0);
        });

        it(']n across multiple lines should jump to link on next line', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('text\n[[link1]]\nmore\n[[link2]]');
                view.editor.setCursor(0, 0);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'n');
            expect(await getCursorLine()).toBe(1);
        });
    });
});
