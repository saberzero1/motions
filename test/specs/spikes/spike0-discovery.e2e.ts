import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 0: Discovery — find correct property paths', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should discover cm adapter structure', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            const editor = view.editor;
            const editorKeys = Object.keys(
                editor as unknown as Record<string, unknown>,
            );

            const cm = (editor as unknown as Record<string, unknown>).cm;
            const cmType = typeof cm;
            const cmKeys = cm
                ? Object.keys(cm as Record<string, unknown>).sort()
                : [];

            let cm6Type = 'not found';
            let cmEditorViewKeys: string[] = [];
            if (cm) {
                const cmObj = cm as Record<string, unknown>;
                if (cmObj.cm6) {
                    cm6Type = typeof cmObj.cm6;
                    cmEditorViewKeys = Object.keys(
                        cmObj.cm6 as Record<string, unknown>,
                    ).slice(0, 15);
                }
                if (cmObj.cm) {
                    cm6Type =
                        'found at .cm (not .cm6), type: ' + typeof cmObj.cm;
                    cmEditorViewKeys = Object.keys(
                        cmObj.cm as Record<string, unknown>,
                    ).slice(0, 15);
                }
                if (cmObj.editor) {
                    cm6Type += ' | also has .editor: ' + typeof cmObj.editor;
                }
            }

            return {
                editorKeys: editorKeys.sort(),
                cmType,
                cmKeys,
                cm6Type,
                cmEditorViewKeys,
            };
        });

        console.log('Discovery result:', JSON.stringify(result, null, 2));
        expect(result).not.toHaveProperty('error');
    });

    it('should discover how to focus the editor for keyboard input', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            view.editor.focus();

            const hasFocus = (view.editor as unknown as Record<string, unknown>)
                .hasFocus;
            const hasFocusFn = typeof (
                view.editor as unknown as Record<string, unknown>
            ).hasFocus;

            return {
                focusCalled: true,
                hasFocusType: hasFocusFn,
                hasFocusValue: hasFocus,
            };
        });

        console.log('Focus result:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('focusCalled', true);
    });

    it('should discover CodeMirrorAdapter.Vim structure', async function () {
        const result = await browser.executeObsidian(() => {
            const adapter = (window as unknown as Record<string, unknown>)
                .CodeMirrorAdapter;
            if (!adapter) return { error: 'No CodeMirrorAdapter on window' };

            const adapterObj = adapter as Record<string, unknown>;
            const vim = adapterObj.Vim;
            if (!vim)
                return {
                    error: 'No Vim on CodeMirrorAdapter',
                    adapterKeys: Object.keys(adapterObj),
                };

            const vimObj = vim as Record<string, unknown>;
            const vimKeys = Object.keys(vimObj).sort();

            return {
                hasVim: true,
                vimKeys,
                hasDefineMotion: typeof vimObj.defineMotion === 'function',
                hasDefineAction: typeof vimObj.defineAction === 'function',
                hasDefineOperator: typeof vimObj.defineOperator === 'function',
                hasDefineEx: typeof vimObj.defineEx === 'function',
                hasMapCommand: typeof vimObj.mapCommand === 'function',
                hasMap: typeof vimObj.map === 'function',
                hasUnmap: typeof vimObj.unmap === 'function',
                hasHandleKey: typeof vimObj.handleKey === 'function',
            };
        });

        console.log('Vim API result:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('hasVim', true);
    });

    it('should discover require availability for @codemirror/language', async function () {
        const result = await browser.executeObsidian(({ require: req }) => {
            try {
                const lang = req('@codemirror/language');
                const langObj = lang as Record<string, unknown>;
                return {
                    success: true,
                    hasSyntaxTree: typeof langObj.syntaxTree === 'function',
                    hasEnsureSyntaxTree:
                        typeof langObj.ensureSyntaxTree === 'function',
                    langKeys: Object.keys(langObj).sort().slice(0, 20),
                };
            } catch (e) {
                return { error: 'require failed: ' + String(e) };
            }
        });

        console.log('CM language result:', JSON.stringify(result, null, 2));
        expect(result).toHaveProperty('success', true);
    });
});
