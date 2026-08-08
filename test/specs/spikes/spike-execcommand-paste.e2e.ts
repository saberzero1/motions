import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
} from '../../helpers';

/**
 * Spike: Validate whether `document.execCommand('paste')` triggers Obsidian's
 * native image-paste pipeline (attachment creation + `![[Pasted image …]]`
 * insertion) when the system clipboard contains an image.
 *
 * This is the gating test for the vim `p` non-text clipboard fallback plan.
 * See: .sisyphus/plans/vim-p-image-paste-fallback.md
 *
 * We use Electron's native `clipboard.writeImage()` to place a 1×1 PNG on the
 * system clipboard, then call `document.execCommand('paste')` from within the
 * focused editor and observe whether Obsidian inserts an image embed.
 */
describe('Spike: execCommand paste with image clipboard', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should detect whether execCommand("paste") triggers native image paste', async function () {
        // Set up a clean editor with known content
        await setupEditor('before\nafter', { line: 0, ch: 3 });

        // Place a 1×1 red PNG on the system clipboard via Electron's native API,
        // then call document.execCommand('paste') while the editor is focused.
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            // Access Electron's clipboard and nativeImage modules
            const req = (
                window as Window & { require?: (m: string) => unknown }
            ).require;
            if (!req) return { error: 'No require (not desktop?)' };

            const electron = req('electron') as {
                clipboard?: {
                    writeImage: (img: unknown) => void;
                    readText: () => string;
                    readImage: () => { isEmpty: () => boolean };
                    clear: () => void;
                };
                nativeImage?: {
                    createFromDataURL: (url: string) => unknown;
                };
            };

            const { clipboard, nativeImage } = electron;
            if (!clipboard || !nativeImage)
                return { error: 'No clipboard/nativeImage module' };

            // Create a tiny 1×1 red PNG as a data URL
            const dataUrl =
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
            const img = nativeImage.createFromDataURL(dataUrl);

            // Clear clipboard and write the image (no text)
            clipboard.clear();
            clipboard.writeImage(img);

            // Verify: clipboard should have image but no text
            const textAfterWrite = clipboard.readText();
            const imageIsEmpty = clipboard.readImage().isEmpty();

            // Focus editor and capture state before paste
            view.editor.focus();
            const contentBefore = view.editor.getValue();

            // Fire execCommand('paste')
            const execResult = document.execCommand('paste');

            return {
                textAfterWrite,
                imageIsEmpty,
                execResult,
                contentBefore,
            };
        });

        console.log(
            'execCommand paste result:',
            JSON.stringify(result, null, 2),
        );

        // If there was an error accessing Electron APIs, skip gracefully
        if (result && typeof result === 'object' && 'error' in result) {
            console.log('SKIP: ' + (result as { error: string }).error);
            return;
        }

        const r = result as {
            textAfterWrite: string;
            imageIsEmpty: boolean;
            execResult: boolean;
            contentBefore: string;
        };

        // Verify the clipboard was set up correctly
        console.log(
            'Clipboard text after writeImage:',
            JSON.stringify(r.textAfterWrite),
        );
        console.log('Clipboard image isEmpty:', r.imageIsEmpty);
        console.log('execCommand returned:', r.execResult);

        // Wait for Obsidian to process the paste (attachment creation is async)
        await browser.pause(2000);

        // Check what the editor contains now
        const contentAfter = await getEditorValue();
        console.log('Content before:', JSON.stringify(r.contentBefore));
        console.log('Content after:', JSON.stringify(contentAfter));

        const changed = contentAfter !== r.contentBefore;
        const hasImageEmbed =
            /!\[\[.*\]\]/.test(contentAfter) ||
            /!\[.*\]\(.*\)/.test(contentAfter);

        console.log('Content changed:', changed);
        console.log('Has image embed:', hasImageEmbed);
        console.log('---');

        if (hasImageEmbed) {
            console.log(
                '✅ RESULT: execCommand("paste") WORKS — Obsidian inserted an image embed.',
            );
            console.log('   The fallback approach in the plan is viable.');
        } else if (changed) {
            console.log(
                '⚠️  RESULT: execCommand("paste") changed content but NO image embed.',
            );
            console.log(
                '   Content diff — something happened but not image paste.',
            );
            console.log('   This might mean CM6 intercepted the paste event.');
        } else {
            console.log('❌ RESULT: execCommand("paste") had NO EFFECT.');
            console.log(
                '   Likely CM6 built-in paste handler intercepted and called preventDefault().',
            );
            console.log(
                '   The execCommand approach will NOT work. Need alternative (see plan Risk #1).',
            );
        }

        // Don't hard-fail — this is a spike for information gathering
        // Just log the result. The human reads the output.
    });

    it('should also test execCommand("paste") with text on clipboard as control', async function () {
        await setupEditor('hello world', { line: 0, ch: 5 });

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No MarkdownView' };

            const req = (
                window as Window & { require?: (m: string) => unknown }
            ).require;
            if (!req) return { error: 'No require' };

            const electron = req('electron') as {
                clipboard?: {
                    writeText: (text: string) => void;
                    clear: () => void;
                };
            };
            if (!electron.clipboard) return { error: 'No clipboard module' };

            // Put text on clipboard
            electron.clipboard.clear();
            electron.clipboard.writeText('PASTED');

            view.editor.focus();
            const contentBefore = view.editor.getValue();

            const execResult = document.execCommand('paste');

            return { contentBefore, execResult };
        });

        console.log('Text paste result:', JSON.stringify(result, null, 2));

        if (result && typeof result === 'object' && 'error' in result) {
            console.log('SKIP: ' + (result as { error: string }).error);
            return;
        }

        await browser.pause(500);

        const contentAfter = await getEditorValue();
        const r = result as { contentBefore: string; execResult: boolean };

        console.log('Content before:', JSON.stringify(r.contentBefore));
        console.log('Content after:', JSON.stringify(contentAfter));
        console.log('execCommand returned:', r.execResult);

        const hasPastedText = contentAfter.includes('PASTED');
        console.log('Has pasted text:', hasPastedText);

        if (hasPastedText) {
            console.log('✅ CONTROL: Text paste via execCommand works.');
        } else {
            console.log('❌ CONTROL: Text paste via execCommand did NOT work.');
            console.log('   CM6 may be intercepting all paste events.');
        }
    });

    it('should test vim p with image on clipboard and clipboard=unnamed', async function () {
        // This tests the actual user scenario: clipboard=unnamed, image on clipboard, press p
        await setupEditor('line one\nline two', { line: 0, ch: 4 });

        // Set clipboard=unnamed and put image on clipboard
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;

            // Set clipboard=unnamed via the Vim API
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            setOption: (name: string, value: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (Vim) {
                Vim.setOption('clipboard', 'unnamed');
            }

            // Put image on clipboard
            const req = (
                window as Window & { require?: (m: string) => unknown }
            ).require;
            if (!req) return;

            const electron = req('electron') as {
                clipboard?: {
                    writeImage: (img: unknown) => void;
                    clear: () => void;
                };
                nativeImage?: {
                    createFromDataURL: (url: string) => unknown;
                };
            };
            if (!electron.clipboard || !electron.nativeImage) return;

            const dataUrl =
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
            const img = electron.nativeImage.createFromDataURL(dataUrl);
            electron.clipboard.clear();
            electron.clipboard.writeImage(img);

            view.editor.focus();
        });

        await browser.pause(PAUSE.EDITOR_SETTLE);

        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        const contentBefore = await getEditorValue();
        const modeBefore = await getVimMode();

        // Use browser.keys to send 'p' as a real keypress
        await browser.keys(['p']);
        await browser.pause(2000); // Wait for async readText + potential fallback

        const contentAfter = await getEditorValue();
        const modeAfter = await getVimMode();

        console.log('--- Vim p with image clipboard ---');
        console.log('Mode before:', modeBefore);
        console.log('Mode after:', modeAfter);
        console.log('Content before:', JSON.stringify(contentBefore));
        console.log('Content after:', JSON.stringify(contentAfter));

        const changed = contentAfter !== contentBefore;
        const hasImageEmbed =
            /!\[\[.*\]\]/.test(contentAfter) ||
            /!\[.*\]\(.*\)/.test(contentAfter);

        if (hasImageEmbed) {
            console.log('✅ Vim p pasted the image via native fallback!');
        } else if (changed) {
            console.log('⚠️  Vim p changed content but no image embed.');
        } else {
            console.log('❌ Vim p did nothing — fallback did not fire.');
        }
        console.log('Mode stayed normal:', modeAfter === 'normal');

        // Reset clipboard option
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            setOption: (name: string, value: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (Vim) {
                Vim.setOption('clipboard', '');
            }
        });
    });
});
