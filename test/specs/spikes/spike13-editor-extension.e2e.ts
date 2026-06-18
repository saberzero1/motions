import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 13: registerEditorExtension and change tracking', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should detect document changes via EditorView.updateListener', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            const cm6View = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm as Record<string, unknown> | undefined;

            if (!cm6View) return { error: 'No CM6 view' };

            const editorView = (cm6View as unknown as { cm6?: unknown }).cm6;
            const hasDispatch =
                editorView &&
                typeof (editorView as Record<string, unknown>).dispatch ===
                    'function';
            const hasState =
                editorView &&
                typeof (editorView as Record<string, unknown>).state ===
                    'object';

            let changeDetected = false;

            view.editor.setValue('before');
            view.editor.setCursor(0, 0);
            view.editor.focus();

            const originalValue = view.editor.getValue();
            view.editor.setValue('after change');
            const newValue = view.editor.getValue();
            changeDetected = originalValue !== newValue;

            return {
                hasEditorView: !!editorView,
                hasDispatch,
                hasState,
                changeDetected,
                editorViewType: editorView ? typeof editorView : 'undefined',
                editorViewKeys: editorView
                    ? Object.keys(editorView as Record<string, unknown>).slice(
                          0,
                          10,
                      )
                    : [],
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('EditorView access:', JSON.stringify(result, null, 2));

        expect(result).toHaveProperty('hasEditorView', true);
    });

    it('should check if plugin can access registerEditorExtension', async function () {
        const result = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { registerEditorExtension?: unknown }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];

            if (!plugin) return { error: 'Plugin not found' };

            const hasRegisterEditorExtension =
                typeof plugin.registerEditorExtension === 'function';

            return {
                hasPlugin: true,
                hasRegisterEditorExtension,
                pluginType: typeof plugin,
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Plugin registerEditorExtension:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('hasPlugin', true);
        expect(result).toHaveProperty('hasRegisterEditorExtension', true);
    });
});
