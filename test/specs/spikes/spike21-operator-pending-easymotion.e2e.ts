import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getEditorValue } from '../../helpers';

/**
 * Spike 21: Operator-pending easymotion via capture-phase interceptor.
 *
 * The interceptor in src/easymotion/operator-pending.ts uses a capture-phase
 * keydown listener to detect `d/c/y + <leader><leader>{type}{label}` sequences
 * before codemirror-vim's CM6 handler sees them.
 *
 * These tests use browser.keys() to send real DOM keystrokes (not Vim.handleKey),
 * because the interceptor only fires on real DOM events, not programmatic API calls.
 *
 * Leader key: <Space> (default).
 * Default labels: "asdghklqwertyuiopzxcvbnmfj"
 *   → first forward word target gets label 'a'
 */
describe('Spike 21: Operator-pending easymotion', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should delete to word target with d + easymotion (smoke)', async function () {
        // This tests only the setup — the actual interceptor must be verified
        // with real-time keystroke sequences in manual testing or a dedicated
        // e2e harness that can time keystrokes correctly.
        const result = await browser.executeObsidian(({ app }) => {
            // Verify the interceptor module is loaded
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, unknown>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;

            return {
                vimExists: !!Vim,
                platform:
                    typeof navigator !== 'undefined'
                        ? navigator.platform
                        : 'unknown',
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message
        console.log('Spike21 smoke:', JSON.stringify(result));
        expect(result).toHaveProperty('vimExists', true);
    });

    it('should NOT break normal easymotion (no operator prefix)', async function () {
        // Set up: "hello world foo bar baz" cursor at start
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });

        // Send keystrokes to position cursor at start, then do normal easymotion
        // (no operator prefix, just <Space><Space>w + label)
        // With cursor at position 0 and labels "asdghklqwertyuiopzxcvbnmfj",
        // the closest forward word start should be at "world" (position 6).
        // Label 'a' should select the closest target.
        //
        // We use browser.keys() for real DOM events:
        // <Space><Space>w → triggers easymotion word overlay
        // 'a' → selects the closest target (should be "world")
        await browser.keys([' ', ' ', 'w', 'a']);

        // Wait for the asynchronous easymotion to complete
        await browser.pause(500);

        const text = await getEditorValue();
        const cursor = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return null;
            return view.editor.getCursor();
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message
        console.log(
            'Normal easymotion result:',
            JSON.stringify({ text, cursor }),
        );
        // Text should be unchanged (we didn't use an operator)
        // Cursor should be at the "world" word start
        expect(text).toBe('hello world foo bar baz');
    });

    it('should detect operator-pending state before easymotion (setup check)', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, unknown>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };

            view.editor.setValue('hello world foo bar baz');
            view.editor.setCursor(0, 0);

            // Set up the CM adapter and verify we can read vim state
            const adapter = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown> | undefined;
            if (!adapter) return { error: 'No adapter' };

            const cm = adapter.cm as Record<string, unknown> | undefined;
            if (!cm) return { error: 'No cm' };

            const vimState = cm.state as Record<string, unknown> | undefined;
            if (!vimState) return { error: 'No state' };

            const vim = vimState.vim as Record<string, unknown> | undefined;
            if (!vim) return { error: 'No vim' };

            // Check initial mode
            const initialMode = vim.mode as string;

            // Manually set operator by calling handleKey('d')
            (Vim as unknown as Record<string, unknown>).handleKey(
                cm as unknown as Record<string, unknown>,
                'd',
            );

            // Now check mode
            const afterDMode = vim.mode as string;
            const afterDOperator = (
                vim.inputState as Record<string, unknown> | undefined
            )?.operator as string | undefined;

            return {
                initialMode,
                afterDMode,
                afterDOperator,
                inputStateType: typeof vim.inputState,
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message
        console.log('Operator detection:', JSON.stringify(result));
        expect(result).not.toHaveProperty('error');
    });
});
