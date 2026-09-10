import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getRegisterContent,
    getInfoModalTitles,
    getNotices,
    getVimMarkLetters,
    getWorkspaceSnapshot,
    dismissNotices,
    handleEx,
    loadSingleFileWorkspace,
    loadTwoFileWorkspace,
    sendVimEscape,
    vimKeys,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

async function readActiveFileFromDisk(): Promise<string | null> {
    return (await browser.executeObsidian(async ({ app }) => {
        const file = app.workspace.getActiveFile();
        if (!file) return null;
        return await app.vault.read(file);
    })) as string | null;
}

async function waitForMarkdownLeafCount(expected: number): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await getWorkspaceSnapshot()).markdownLeafCount === expected,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: `expected ${expected} markdown leaves`,
        },
    );
}

async function waitForActiveFile(expected: string): Promise<void> {
    await browser.waitUntil(
        async () => (await getWorkspaceSnapshot()).activeFile === expected,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: `expected ${expected} to become the active file`,
        },
    );
}

describe('Expanded Ex commands', function () {
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

    const suite = SUITES.find((s) => s.name === 'ex-commands-expanded');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('ex-commands-expanded', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    } else {
        it('suite "ex-commands-expanded" exists in test-definitions', function () {
            throw new Error(
                'Suite "ex-commands-expanded" not found in SUITES — was it renamed in test-definitions.ts?',
            );
        });
    }

    describe('Phase 1: File operations', function () {
        it(':update dispatches Obsidian\u2019s save command', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            await setupEditor('update test', { line: 0, ch: 0 });

            const result = await handleEx('update');

            expect(result.unknownCommand).toBe(false);
            expect(result.error).toBeUndefined();
            expect(result.dispatchedCommands).toContain('editor:save-file');
        });

        it(':xit saves and closes the active leaf', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            const before = await getWorkspaceSnapshot();
            expect(before.markdownLeafCount).toBe(2);

            const result = await handleEx('xit');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain('editor:save-file');
            expect(result.dispatchedCommands).toContain('workspace:close');
            await waitForMarkdownLeafCount(1);
        });

        it(':find opens the file matching a partial name', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');

            const result = await handleEx('find Welcome');

            expect(result.unknownCommand).toBe(false);
            await waitForActiveFile('Welcome.md');
        });

        it(':version reports the plugin name and version', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            await dismissNotices();

            const result = await handleEx('version');

            expect(result.unknownCommand).toBe(false);
            const notices = await getNotices();
            expect(
                notices.some((n) => /Vim Motions v\d+\.\d+\.\d+/.test(n)),
            ).toBe(true);
        });

        it(':edit! discards buffer changes and re-reads the file', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            const onDisk = await readActiveFileFromDisk();
            expect(onDisk).not.toBeNull();
            const scratch = `scratch-${Date.now()}`;
            await setupEditor(scratch, { line: 0, ch: 0 });
            expect(await getEditorValue()).toBe(scratch);

            const result = await handleEx('edit!');

            expect(result.unknownCommand).toBe(false);
            await browser.waitUntil(
                async () => (await getEditorValue()) === onDisk,
                {
                    timeout: 5000,
                    interval: 100,
                    timeoutMsg: 'buffer was not restored from disk',
                },
            );
        });

        it(':saveas without an argument reports its usage', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            await dismissNotices();

            const result = await handleEx('saveas');

            expect(result.unknownCommand).toBe(false);
            expect(await getNotices()).toContain('Usage: :saveas {filename}');
        });
    });

    describe('Phase 2: Buffer navigation', function () {
        it(':bfirst activates the first buffer', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');

            const result = await handleEx('bfirst');

            expect(result.unknownCommand).toBe(false);
            await waitForActiveFile('Welcome.md');
        });

        it(':blast activates the last buffer', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'first');
            expect((await getWorkspaceSnapshot()).activeFile).toBe(
                'Welcome.md',
            );

            const result = await handleEx('blast');

            expect(result.unknownCommand).toBe(false);
            await waitForActiveFile('Target.md');
        });

        it(':bwipeout closes the active buffer', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(2);

            const result = await handleEx('bwipeout');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain('workspace:close');
            await waitForMarkdownLeafCount(1);
        });
    });

    describe('Phase 3: Split/tab commands', function () {
        it(':split opens a horizontal split', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(1);

            const result = await handleEx('split');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain(
                'workspace:split-horizontal',
            );
            await waitForMarkdownLeafCount(2);
        });

        it(':vsplit opens a vertical split', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(1);

            const result = await handleEx('vsplit');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain(
                'workspace:split-vertical',
            );
            await waitForMarkdownLeafCount(2);
        });

        it(':tabclose closes the active tab', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(2);

            const result = await handleEx('tabclose');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain('workspace:close');
            await waitForMarkdownLeafCount(1);
        });

        it(':tabonly closes every other tab', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(2);

            const result = await handleEx('tabonly');

            expect(result.unknownCommand).toBe(false);
            await waitForMarkdownLeafCount(1);
            expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');
        });

        it(':tabfirst activates the first tab', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');

            const result = await handleEx('tabfirst');

            expect(result.unknownCommand).toBe(false);
            await waitForActiveFile('Welcome.md');
        });

        it(':tablast activates the last tab', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'first');
            expect((await getWorkspaceSnapshot()).activeFile).toBe(
                'Welcome.md',
            );

            const result = await handleEx('tablast');

            expect(result.unknownCommand).toBe(false);
            await waitForActiveFile('Target.md');
        });
    });

    describe('Phase 4: Utility commands', function () {
        it(':delmarks a should delete mark a', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('m', 'a');
            await browser.pause(100);
            expect(await getVimMarkLetters()).toContain('a');

            const result = await handleEx('delmarks a');

            expect(result.unknownCommand).toBe(false);
            expect(await getVimMarkLetters()).not.toContain('a');
        });

        it(':changes opens the change list', async function () {
            await loadSingleFileWorkspace('Welcome.md');
            await setupEditor('test', { line: 0, ch: 0 });
            expect(await getInfoModalTitles()).not.toContain('Changes');

            const result = await handleEx('changes');

            expect(result.unknownCommand).toBe(false);
            await browser.waitUntil(
                async () => (await getInfoModalTitles()).includes('Changes'),
                {
                    timeout: 5000,
                    interval: 100,
                    timeoutMsg: 'the Changes modal never opened',
                },
            );
            await browser.keys(['Escape']);
            await browser.pause(200);
        });
    });

    describe('Phase 5: CM Vim native Ex commands', function () {
        it(':yank should not error', async function () {
            await setupEditor('line one\nline two', { line: 0, ch: 0 });
            const result = await handleEx('yank');
            expect(result.unknownCommand).toBe(false);
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('line one');
        });

        it(':join should join lines', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await handleEx('1,2join');
            expect(await getEditorValue()).toBe('hello world');
        });

        it(':nohlsearch should not error', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            const result = await handleEx('nohlsearch');
            expect(result.unknownCommand).toBe(false);
            const content = await getEditorValue();
            expect(content).toBe('test');
        });

        it(':undo should not error', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await browser.pause(100);
            await handleEx('undo');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('hello');
        });

        it(':redo should not error', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await browser.pause(100);
            await handleEx('undo');
            await browser.pause(100);
            await handleEx('redo');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('');
        });

        it(':global should execute on matching lines', async function () {
            await setupEditor('keep\nremove\nkeep\nremove', { line: 0, ch: 0 });
            await handleEx('g/remove/d');
            expect(await getEditorValue()).toBe('keep\nkeep');
        });

        it(':sort should sort lines', async function () {
            await setupEditor('cherry\napple\nbanana', { line: 0, ch: 0 });
            await handleEx('sort');
            expect(await getEditorValue()).toBe('apple\nbanana\ncherry');
        });
    });
});
