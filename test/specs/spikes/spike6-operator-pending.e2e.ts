import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 6: Operator-pending state in action callbacks', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should detect pending operator when action fires after d', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (
                                    cm: unknown,
                                    actionArgs: unknown,
                                    vim: unknown,
                                ) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            let capturedInputState: unknown = null;
            let capturedVimState: unknown = null;

            Vim.defineAction(
                'spikeTestAction',
                (_cm: unknown, _actionArgs: unknown, vim: unknown) => {
                    capturedVimState = vim;
                    capturedInputState = (vim as Record<string, unknown>)
                        ?.inputState;
                },
            );
            Vim.mapCommand('\\\\t', 'action', 'spikeTestAction', {});

            view.editor.setValue('Hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, 'd');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 't');

            const inputState = capturedInputState as Record<
                string,
                unknown
            > | null;
            const hasOperator =
                inputState !== null && 'operator' in (inputState ?? {});
            const operatorValue = hasOperator
                ? (inputState as Record<string, unknown>)['operator']
                : null;

            return {
                hasCapturedState: capturedVimState !== null,
                hasCapturedInputState: capturedInputState !== null,
                hasOperator,
                operatorValue:
                    operatorValue !== null
                        ? JSON.stringify(operatorValue)
                        : null,
                inputStateKeys:
                    inputState !== null
                        ? Object.keys(inputState as Record<string, unknown>)
                        : [],
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Operator-pending state in action:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('hasCapturedState', false);
    });

    it('should capture vim state when action fires without operator prefix', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineAction: (
                                name: string,
                                fn: (
                                    cm: unknown,
                                    actionArgs: unknown,
                                    vim: unknown,
                                ) => void,
                            ) => void;
                            mapCommand: (
                                keys: string,
                                type: string,
                                name: string,
                                args: Record<string, unknown>,
                            ) => void;
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

            let capturedInputState: unknown = null;

            Vim.defineAction(
                'spikeTestAction2',
                (_cm: unknown, _actionArgs: unknown, vim: unknown) => {
                    capturedInputState = (vim as Record<string, unknown>)
                        ?.inputState;
                },
            );
            Vim.mapCommand('\\\\u', 'action', 'spikeTestAction2', {});

            view.editor.setValue('Hello world test');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'u');

            const inputState = capturedInputState as Record<
                string,
                unknown
            > | null;
            const hasOperator =
                inputState !== null && 'operator' in (inputState ?? {});

            return {
                hasCapturedInputState: capturedInputState !== null,
                hasOperator,
                inputStateKeys:
                    inputState !== null
                        ? Object.keys(inputState as Record<string, unknown>)
                        : [],
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'No-operator state in action:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('hasCapturedInputState', true);
    });
});
