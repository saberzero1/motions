import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimRawKeys,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
    PAUSE,
} from '../../helpers';
import { SUITES } from '../../neovim/test-definitions';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';

describe('Fold motions (zj, zk, [z, ]z)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    const suite = SUITES.find((s) => s.name === 'fold-motions');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('fold-motions', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    } else {
        it('suite "fold-motions" exists in test-definitions', function () {
            throw new Error(
                'Suite "fold-motions" not found in SUITES — was it renamed in test-definitions.ts?',
            );
        });
    }

    it('zj works with operator-pending mode (dzj)', async function () {
        await setupEditor(
            '# Heading 1\n\nSome text\n\n# Heading 2\n\nMore text',
            { line: 0, ch: 0 },
        );
        await vimRawKeys('dzj');
        await browser.pause(PAUSE.KEY_GAP);
        const value = await getEditorValue();
        expect(value).not.toContain('Some text');
    });

    it('zk works with operator-pending mode (dzk)', async function () {
        await setupEditor(
            '# Heading 1\n\nSome text\n\n## Heading 2\n\nMore text',
            {
                line: 4,
                ch: 0,
            },
        );
        await vimRawKeys('dzk');
        await browser.pause(PAUSE.KEY_GAP);
        const value = await getEditorValue();
        expect(value.length).toBeLessThan(
            '# Heading 1\n\nSome text\n\n## Heading 2\n\nMore text'.length,
        );
    });

    it('zj no-op in document without foldable regions', async function () {
        await setupEditor('Plain line 1\nPlain line 2\nPlain line 3', {
            line: 0,
            ch: 0,
        });
        await vimRawKeys('zj');
        await browser.pause(PAUSE.KEY_GAP);
        const cursor = await getCursorPos();
        expect(cursor.line).toBe(0);
        expect(cursor.ch).toBe(0);
    });

    it('zk no-op in document without foldable regions', async function () {
        await setupEditor('Plain line 1\nPlain line 2\nPlain line 3', {
            line: 2,
            ch: 0,
        });
        await vimRawKeys('zk');
        await browser.pause(PAUSE.KEY_GAP);
        const cursor = await getCursorPos();
        expect(cursor.line).toBe(2);
        expect(cursor.ch).toBe(0);
    });
});
