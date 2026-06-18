import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../../helpers';

describe('Normal mode — bracket commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('[( / ]) — unmatched parens', function () {
        it('[( should jump to previous unmatched (', async function () {
            await setupEditor('(hello (world) end)', { line: 0, ch: 10 });
            await vimKeys('[', '(');
            expect((await getCursorPos()).ch).toBe(7);
        });

        it(']) should jump to next unmatched )', async function () {
            await setupEditor('(hello (world) end)', { line: 0, ch: 10 });
            await vimKeys(']', ')');
            expect((await getCursorPos()).ch).toBe(13);
        });
    });

    describe('[{ / ]} — unmatched braces', function () {
        it('[{ should jump to previous unmatched {', async function () {
            await setupEditor('{ outer { inner } end }', { line: 0, ch: 12 });
            await vimKeys('[', '{');
            expect((await getCursorPos()).ch).toBe(8);
        });

        it(']} should jump to next unmatched }', async function () {
            await setupEditor('{ outer { inner } end }', { line: 0, ch: 12 });
            await vimKeys(']', '}');
            expect((await getCursorPos()).ch).toBe(16);
        });
    });
});
