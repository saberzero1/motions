import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape } from '../helpers';

type ExecResult = { success: true } | { error: string };

async function handleEx(command: string): Promise<ExecResult> {
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
    }, command)) as ExecResult;
}

async function isPickerOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-picker');
    })) as boolean;
}

async function getPickerItemLabels(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll(
            '.vim-motions-picker-item .vim-motions-picker-item-label',
        );
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

async function closePicker(): Promise<void> {
    await browser.executeObsidian(() => {
        const input = document.querySelector(
            '.vim-motions-picker-input',
        ) as HTMLInputElement | null;
        if (input) {
            input.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                }),
            );
        }
    });
    await browser.pause(200);
}

describe(':files and :buffers with non-markdown files (#169)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });

        await browser.executeObsidian(async ({ app }) => {
            const existing =
                app.vault.getAbstractFileByPath('TestCanvas.canvas');
            if (existing) await app.vault.delete(existing);
            await app.vault.create(
                'TestCanvas.canvas',
                '{"nodes":[],"edges":[]}',
            );
        });

        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);
    });

    afterEach(async function () {
        await closePicker();
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }) => {
            const file = app.vault.getAbstractFileByPath('TestCanvas.canvas');
            if (file) await app.vault.delete(file);
        });
    });

    describe(':files should include non-markdown files', function () {
        it('should show .canvas files in :files picker (#169)', async function () {
            const result = await handleEx('files');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);

            const labels = await getPickerItemLabels();
            expect(labels).toContain('TestCanvas');
        });
    });

    describe(':buffers should include non-markdown leaves', function () {
        before(async function () {
            await browser.executeObsidian(async ({ app }) => {
                await app.workspace.openLinkText(
                    'TestCanvas.canvas',
                    '',
                    false,
                );
            });
            await browser.pause(500);

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(500);
        });

        it('should show canvas leaf in :buffers picker (#169)', async function () {
            const result = await handleEx('buffers');
            expect(result).toHaveProperty('success', true);
            await browser.pause(300);
            expect(await isPickerOpen()).toBe(true);

            const labels = await getPickerItemLabels();
            expect(labels).toContain('TestCanvas');
        });
    });

    describe(':find should locate non-markdown files (#169)', function () {
        it('should navigate to a .canvas file via :find', async function () {
            const result = await handleEx('find TestCanvas');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);

            const activePath = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activePath).toBe('TestCanvas.canvas');

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
        });
    });

    describe(':b should switch to non-markdown buffer (#169)', function () {
        before(async function () {
            await browser.executeObsidian(async ({ app }) => {
                const newLeaf = app.workspace.getLeaf('tab');
                await newLeaf.openFile(
                    app.vault.getAbstractFileByPath(
                        'TestCanvas.canvas',
                    ) as import('obsidian').TFile,
                );
            });
            await browser.pause(500);

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(500);
        });

        it(':b TestCanvas should switch to canvas leaf (#169)', async function () {
            const result = await handleEx('b TestCanvas');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);

            const activePath = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activePath).toBe('TestCanvas.canvas');

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
        });
    });

    describe(':bfirst/:blast should include non-markdown leaves (#169)', function () {
        before(async function () {
            await browser.executeObsidian(async ({ app }) => {
                const newLeaf = app.workspace.getLeaf('tab');
                await newLeaf.openFile(
                    app.vault.getAbstractFileByPath(
                        'TestCanvas.canvas',
                    ) as import('obsidian').TFile,
                );
            });
            await browser.pause(500);

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(500);
        });

        it(':blast should not error with canvas leaf present (#169)', async function () {
            const result = await handleEx('blast');
            expect(result).toHaveProperty('success', true);
            await browser.pause(500);

            const activePath = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activePath.length).toBeGreaterThan(0);

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
        });
    });

    describe(']b/[b should cycle through non-markdown leaves (#169)', function () {
        before(async function () {
            await browser.executeObsidian(async ({ app }) => {
                const newLeaf = app.workspace.getLeaf('tab');
                await newLeaf.openFile(
                    app.vault.getAbstractFileByPath(
                        'TestCanvas.canvas',
                    ) as import('obsidian').TFile,
                );
            });
            await browser.pause(500);

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(500);
        });

        it(']b should reach a canvas leaf (#169)', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(300);

            const beforePath = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(beforePath).toBe('Welcome.md');

            await browser.executeObsidian(({ app, obsidian }) => {
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
                if (!Vim) return;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'b');
            });
            await browser.pause(500);

            const afterPath = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(afterPath).toBe('TestCanvas.canvas');

            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);
        });
    });
});
