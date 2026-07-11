import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    getCursorPos,
    PAUSE,
    loadSingleFileWorkspace,
} from '../helpers.js';

const FRONTMATTER_DOC = [
    '---',
    'title: Test Note',
    'tags: [fold, cursor]',
    'date: 2025-07-11',
    '---',
    '',
    '# Heading After Frontmatter',
    '',
    'Body text after heading.',
    '',
    '## Second Heading',
    '',
    'More body text here.',
].join('\n');

const HEADING_DOC = [
    '# First Heading',
    '',
    'Content under first heading.',
    '',
    '## Second Heading',
    '',
    'Content under second heading.',
    '',
    '## Third Heading',
    '',
    'Content under third heading.',
].join('\n');

type CommandsApi = {
    commands: { executeCommandById: (id: string) => boolean };
};

async function execObsidianCommand(cmdId: string): Promise<void> {
    await browser.executeObsidian(({ app }, cmd: string) => {
        (app as unknown as CommandsApi).commands.executeCommandById(cmd);
    }, cmdId);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function sendVimFoldKey(key: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, k: string) => {
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
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleKey(adapter, 'z');
        Vim.handleKey(adapter, k);
    }, key);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Fold cursor/viewport stability (Issue #54)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
    });

    describe('Properties fold — editor:toggle-fold-properties', function () {
        it('cursor below frontmatter stays on same line', async function () {
            await setupEditor(FRONTMATTER_DOC, { line: 6, ch: 0 });
            const before = await getCursorPos();

            await execObsidianCommand('editor:toggle-fold-properties');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
            expect(after.ch).toBe(before.ch);
        });

        it('cursor inside frontmatter stays on same line', async function () {
            await setupEditor(FRONTMATTER_DOC, { line: 2, ch: 0 });
            const before = await getCursorPos();

            await execObsidianCommand('editor:toggle-fold-properties');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
        });

        it('round-trip fold/unfold restores cursor exactly', async function () {
            await setupEditor(FRONTMATTER_DOC, { line: 8, ch: 5 });
            const original = await getCursorPos();

            await execObsidianCommand('editor:toggle-fold-properties');
            await execObsidianCommand('editor:toggle-fold-properties');

            const restored = await getCursorPos();
            expect(restored.line).toBe(original.line);
            expect(restored.ch).toBe(original.ch);
        });
    });

    describe('Heading fold — zc/zo', function () {
        it('zc on heading keeps cursor on fold summary line', async function () {
            await setupEditor(HEADING_DOC, { line: 0, ch: 0 });
            const before = await getCursorPos();

            await sendVimFoldKey('c');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
        });

        it('zo on folded heading keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 0, ch: 0 });

            await sendVimFoldKey('c');
            const afterFold = await getCursorPos();

            await sendVimFoldKey('o');
            const afterUnfold = await getCursorPos();

            expect(afterUnfold.line).toBe(afterFold.line);
        });

        it('za toggle keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 0, ch: 0 });
            const before = await getCursorPos();

            await sendVimFoldKey('a');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
        });
    });

    describe('Fold all — editor:fold-all / editor:unfold-all', function () {
        it('editor:fold-all keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 6, ch: 0 });
            const before = await getCursorPos();

            await execObsidianCommand('editor:fold-all');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
        });

        it('editor:unfold-all keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 6, ch: 0 });
            await execObsidianCommand('editor:fold-all');

            const beforeUnfold = await getCursorPos();
            await execObsidianCommand('editor:unfold-all');

            const after = await getCursorPos();
            expect(after.line).toBe(beforeUnfold.line);
        });

        it('zM keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 6, ch: 0 });
            const before = await getCursorPos();

            await sendVimFoldKey('M');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
        });

        it('zR keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 6, ch: 0 });
            await sendVimFoldKey('M');

            const beforeUnfold = await getCursorPos();
            await sendVimFoldKey('R');

            const after = await getCursorPos();
            expect(after.line).toBe(beforeUnfold.line);
        });
    });

    describe('Incremental fold — editor:fold-more / editor:fold-less', function () {
        it('editor:fold-more keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 6, ch: 0 });
            const before = await getCursorPos();

            await execObsidianCommand('editor:fold-more');

            const after = await getCursorPos();
            expect(after.line).toBe(before.line);
        });

        it('editor:fold-less keeps cursor on same line', async function () {
            await setupEditor(HEADING_DOC, { line: 6, ch: 0 });
            await execObsidianCommand('editor:fold-more');

            const beforeLess = await getCursorPos();
            await execObsidianCommand('editor:fold-less');

            const after = await getCursorPos();
            expect(after.line).toBe(beforeLess.line);
        });
    });
});
