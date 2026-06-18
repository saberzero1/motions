import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 11: Register access from executeObsidian', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should read default register after yy', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getRegisterController: () => {
                                registers: Record<
                                    string,
                                    {
                                        toString: () => string;
                                        linewise: boolean;
                                        blockwise: boolean;
                                    }
                                >;
                            };
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('line one\nline two\nline three');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            // Yank current line with yy
            Vim.handleKey(adapter, 'y');
            Vim.handleKey(adapter, 'y');

            // Read the default register
            const rc = Vim.getRegisterController();
            const defaultReg = rc.registers['"'];
            const zeroReg = rc.registers['0'];

            return {
                hasRegisterController: rc !== null && rc !== undefined,
                hasDefaultRegister:
                    defaultReg !== null && defaultReg !== undefined,
                defaultRegText: defaultReg?.toString() ?? null,
                defaultRegLinewise: defaultReg?.linewise ?? null,
                defaultRegBlockwise: defaultReg?.blockwise ?? null,
                hasZeroRegister: zeroReg !== null && zeroReg !== undefined,
                zeroRegText: zeroReg?.toString() ?? null,
                availableRegisters: Object.keys(rc.registers).sort(),
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Register access after yy:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('hasRegisterController', true);
        expect(result).toHaveProperty('hasDefaultRegister', true);
    });

    it('should read named register after "ayy', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getRegisterController: () => {
                                registers: Record<
                                    string,
                                    {
                                        toString: () => string;
                                        linewise: boolean;
                                        blockwise: boolean;
                                    }
                                >;
                            };
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            view.editor.setValue('alpha line\nbeta line\ngamma line');
            view.editor.setCursor(1, 0);
            view.editor.focus();

            // Yank into register a with "ayy
            Vim.handleKey(adapter, '"');
            Vim.handleKey(adapter, 'a');
            Vim.handleKey(adapter, 'y');
            Vim.handleKey(adapter, 'y');

            // Read register a
            const rc = Vim.getRegisterController();
            const regA = rc.registers['a'];

            return {
                hasRegA: regA !== null && regA !== undefined,
                regAText: regA?.toString() ?? null,
                regALinewise: regA?.linewise ?? null,
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Named register access after "ayy:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('hasRegA', true);
    });
});
