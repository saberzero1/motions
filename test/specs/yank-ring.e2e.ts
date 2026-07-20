import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getCursorPos,
    getRegisterContent,
    setupEditor,
    vimKeys,
} from '../helpers';

async function vimHandleKeys(...keys: string[]): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, keyList: string[]) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm as Record<string, unknown> | undefined;
        if (!adapter) return;
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        for (const key of keyList) {
            Vim.handleKey(adapter, key);
        }
    }, keys);
    await browser.pause(300);
}

describe('Yank-ring paste cycling', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('basic cycling', function () {
        it('p then <C-p> should replace pasted text with previous register', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            await vimKeys('p');
            await browser.pause(100);
            const afterPaste = await getEditorValue();
            expect(afterPaste).toContain('bbb');

            await vimHandleKeys('<C-p>');
            const afterCycle = await getEditorValue();
            expect(afterCycle).toContain('aaa');
            expect(afterCycle).not.toContain('bbb');
        });

        it('<C-n> should reverse cycling direction', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            await vimKeys('p');
            await browser.pause(100);

            await vimHandleKeys('<C-p>');
            const afterCp = await getEditorValue();
            expect(afterCp).toContain('aaa');

            await vimHandleKeys('<C-n>');
            const afterCn = await getEditorValue();
            expect(afterCn).toContain('bbb');
            expect(afterCn).not.toContain('aaa');
        });
    });

    describe('cancellation', function () {
        it('non-cycling command should cancel cycling state', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            await vimKeys('p');
            await browser.pause(100);
            await vimKeys('j');
            await vimHandleKeys('<C-p>');
            const pos = await getCursorPos();
            expect(pos.line).toBeLessThanOrEqual(0);
        });

        it('<C-p> without prior paste should act as k', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 2,
                ch: 0,
            });
            await vimHandleKeys('<C-p>');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('<C-n> without prior paste should act as j', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimHandleKeys('<C-n>');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });

    describe('paste variants', function () {
        it('should work after P (paste before)', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            await vimKeys('P');
            await browser.pause(100);
            const afterPaste = await getEditorValue();
            expect(afterPaste).toContain('bbb');

            await vimHandleKeys('<C-p>');
            const afterCycle = await getEditorValue();
            expect(afterCycle).toContain('aaa');
        });

        it('charwise paste then cycle should replace inline', async function () {
            await setupEditor('hello world test', { line: 0, ch: 0 });
            await vimKeys('d', 'w');
            await vimKeys('d', 'w');
            await vimKeys('p');
            await browser.pause(100);
            const afterPaste = await getEditorValue();
            expect(afterPaste).toContain('world');

            await vimHandleKeys('<C-p>');
            const afterCycle = await getEditorValue();
            const reg2 = await getRegisterContent('2');
            expect(afterCycle).toContain(
                reg2?.text?.replace(/\n$/, '') ?? 'hello',
            );
        });
    });

    describe('register preservation', function () {
        it('original register should be unchanged after cycling', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            await vimKeys('p');
            await browser.pause(100);
            await vimHandleKeys('<C-p>');

            const reg1 = await getRegisterContent('1');
            expect(reg1).not.toBeNull();
            expect(reg1?.text).toContain('second');

            const reg2 = await getRegisterContent('2');
            expect(reg2).not.toBeNull();
            expect(reg2?.text).toContain('first');
        });
    });
});
