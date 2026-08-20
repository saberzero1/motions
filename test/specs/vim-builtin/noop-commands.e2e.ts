import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';

/** Dispatch vim keys via handleKey inside Obsidian. Returns success/error. */
async function handleKeys(
    ...keys: string[]
): Promise<{ success?: boolean; error?: string }> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, keyList: string[]) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                for (const k of keyList) {
                    Vim.handleKey(adapter, k);
                }
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        },
        keys,
    )) as { success?: boolean; error?: string };
}

/** Dispatch an ex command via handleEx inside Obsidian. */
async function handleEx(
    input: string,
): Promise<{ success?: boolean; error?: string }> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, input)) as { success?: boolean; error?: string };
}

const TEST_CONTENT = 'test content';

describe('No-op commands — crash guards', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('Window resize no-ops', function () {
        it('[crash-guard] <C-w>= should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('<C-w>', '=');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });

        it('[crash-guard] <C-w>_ should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('<C-w>', '_');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });

        it('[crash-guard] <C-w>| should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('<C-w>', '|');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });
    });

    describe('Window rotation no-ops', function () {
        it('[crash-guard] <C-w>r should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('<C-w>', 'r');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });

        it('[crash-guard] <C-w>R should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('<C-w>', 'R');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });

        it('[crash-guard] <C-w>x should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('<C-w>', 'x');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });
    });

    describe(':tabmove no-op', function () {
        it('[crash-guard] :tabmove should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleEx('tabmove');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });
    });

    describe('Spelling no-ops', function () {
        it('[crash-guard] ]s should not error and not move cursor unexpectedly', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys(']', 's');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });

        it('[crash-guard] [s should not error', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('[', 's');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });
    });

    describe('Other no-ops', function () {
        it('[crash-guard] U in normal mode should not error (content unchanged)', async function () {
            await setupEditor(TEST_CONTENT, { line: 0, ch: 0 });
            const result = await handleKeys('U');
            expect(result).toHaveProperty('success', true);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
            expect(await getEditorValue()).toBe(TEST_CONTENT);
        });
    });
});
