import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getSelection,
    setupEditor,
    vimKeys,
    sendVimEscape,
} from '../helpers';

describe('Phase 4 text objects', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Strikethrough (i~/a~)', function () {
        it('di~ should delete inside strikethrough delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~strikethrough~~ world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe('Hello ~~~~ world');
        });

        it('da~ should delete around strikethrough including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~strikethrough~~ world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '~');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('should no-op when cursor is outside ~~ delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~strikethrough~~ world');
                view.editor.setCursor(0, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe(
                'Hello ~~strikethrough~~ world',
            );
        });
    });

    describe('Highlight (i=/a=)', function () {
        it('di= should delete inside highlight delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==highlight== world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '=');
            expect(await getEditorValue()).toBe('Hello ==== world');
        });

        it('da= should delete around highlight including delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==highlight== world');
                view.editor.setCursor(0, 12);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '=');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('should no-op when cursor is outside == delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==highlight== world');
                view.editor.setCursor(0, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '=');
            expect(await getEditorValue()).toBe('Hello ==highlight== world');
        });
    });

    describe('Smart asterisk (i* with single vs double)', function () {
        it('di* should delete inside single *italic*', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello *italic* world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello ** world');
        });

        it('da* should delete around single *italic*', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello *italic* world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('di* should still work inside **bold**', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold** world');
                view.editor.setCursor(0, 10);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });
    });

    describe('Multi-line delimiter text objects', function () {
        it('di* should delete inside bold spanning two lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold\ntext** world');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('da* should delete around bold spanning two lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **bold\ntext** world');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('di_ should delete inside italic spanning two lines', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello _italic\ntext_ world');
                view.editor.setCursor(1, 2);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '_');
            expect(await getEditorValue()).toBe('Hello __ world');
        });
    });

    describe('Empty delimiter edge cases', function () {
        it('di* on empty bold should not change content', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **** world');
                view.editor.setCursor(0, 8);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('da* on empty bold should delete delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello **** world');
                view.editor.setCursor(0, 8);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('di~ on empty strikethrough should not change', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ~~~~ world');
                view.editor.setCursor(0, 9);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe('Hello ~~~~ world');
        });

        it('da= on empty highlight should delete delimiters', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Hello ==== world');
                view.editor.setCursor(0, 9);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys('d', 'a', '=');
            expect(await getEditorValue()).toBe('Hello  world');
        });
    });

    describe('Visual and yank with text objects', function () {
        it('vi* should select exactly inside bold', async function () {
            await setupEditor('Hello **bold** world', { line: 0, ch: 10 });
            await vimKeys('v', 'i', '*');
            expect(await getSelection()).toBe('bold');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('va* should select exactly around bold', async function () {
            await setupEditor('Hello **bold** world', { line: 0, ch: 10 });
            await vimKeys('v', 'a', '*');
            expect(await getSelection()).toBe('**bold**');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('vi$ should select exactly inside math', async function () {
            await setupEditor('Hello $x + y$ world', { line: 0, ch: 9 });
            await vimKeys('v', 'i', '$');
            expect(await getSelection()).toBe('x + y');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('va$ should select exactly around math', async function () {
            await setupEditor('Hello $x + y$ world', { line: 0, ch: 9 });
            await vimKeys('v', 'a', '$');
            expect(await getSelection()).toBe('$x + y$');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('vi~ should select exactly inside strikethrough', async function () {
            await setupEditor('Hello ~~strike~~ world', { line: 0, ch: 10 });
            await vimKeys('v', 'i', '~');
            expect(await getSelection()).toBe('strike');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('va~ should select exactly around strikethrough', async function () {
            await setupEditor('Hello ~~strike~~ world', { line: 0, ch: 10 });
            await vimKeys('v', 'a', '~');
            expect(await getSelection()).toBe('~~strike~~');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('vi= should select exactly inside highlight', async function () {
            await setupEditor('Hello ==highlight== world', { line: 0, ch: 12 });
            await vimKeys('v', 'i', '=');
            expect(await getSelection()).toBe('highlight');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('va= should select exactly around highlight', async function () {
            await setupEditor('Hello ==highlight== world', { line: 0, ch: 12 });
            await vimKeys('v', 'a', '=');
            expect(await getSelection()).toBe('==highlight==');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('vi_ should select exactly inside underscore italic', async function () {
            await setupEditor('Hello _italic_ world', { line: 0, ch: 10 });
            await vimKeys('v', 'i', '_');
            expect(await getSelection()).toBe('italic');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('va_ should select exactly around underscore italic', async function () {
            await setupEditor('Hello _italic_ world', { line: 0, ch: 10 });
            await vimKeys('v', 'a', '_');
            expect(await getSelection()).toBe('_italic_');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('vi` should select exactly inside inline code', async function () {
            await setupEditor('Hello `code` world', { line: 0, ch: 9 });
            await vimKeys('v', 'i', '`');
            expect(await getSelection()).toBe('code');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('va` should select exactly around inline code', async function () {
            await setupEditor('Hello `code` world', { line: 0, ch: 9 });
            await vimKeys('v', 'a', '`');
            expect(await getSelection()).toBe('`code`');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('vi* on short italic should select exactly', async function () {
            await setupEditor('Hello *ab* world', { line: 0, ch: 8 });
            await vimKeys('v', 'i', '*');
            expect(await getSelection()).toBe('ab');
            await sendVimEscape();
            await browser.pause(200);
        });

        it.skip('should diagnose formatting mark CSS on inactive line', async function () {
            await setupEditor('*aaaaa*\n*aa*\n*a*', { line: 0, ch: 1 });

            const step1 = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (!view) return { error: 'no view' };
                return { step: 'after setupEditor', cursor: view.editor.getCursor() };
            })) as Record<string, unknown>;

            await sendVimEscape();

            const step2 = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (!view) return { error: 'no view' };
                return { step: 'after sendVimEscape', cursor: view.editor.getCursor() };
            })) as Record<string, unknown>;

            await browser.pause(50);

            const step3 = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (!view) return { error: 'no view' };
                const editorView = (view.editor as unknown as Record<string, unknown>).cm as
                    { contentDOM: HTMLElement } | undefined;
                const lineEl = editorView?.contentDOM.querySelector('.cm-line');
                const isActive = lineEl?.classList.contains('cm-active') ?? false;
                const formattingEls = lineEl ? Array.from(lineEl.querySelectorAll('[class*="formatting"]')).map(s => ({
                    className: (s as HTMLElement).className,
                    display: getComputedStyle(s as HTMLElement).display,
                    width: (s as HTMLElement).getBoundingClientRect().width,
                })) : [];
                return {
                    step: 'after pause',
                    cursor: view.editor.getCursor(),
                    isActiveLine: isActive,
                    formattingEls,
                };
            })) as Record<string, unknown>;

            await setupEditor('*aaaaa*\n*aa*\n*a*', { line: 1, ch: 1 });
            const step4 = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                return view ? { step: 'line1 ch:1', cursor: view.editor.getCursor() } : { error: 'no view' };
            })) as Record<string, unknown>;

            await setupEditor('*aaaaa*\n*aa*\n*a*', { line: 2, ch: 1 });
            const step5 = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                return view ? { step: 'line2 ch:1', cursor: view.editor.getCursor() } : { error: 'no view' };
            })) as Record<string, unknown>;

            await setupEditor('Hello *x* world', { line: 0, ch: 7 });
            const step6 = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                return view ? { step: 'Hello *x* ch:7', cursor: view.editor.getCursor() } : { error: 'no view' };
            })) as Record<string, unknown>;

            const cssCheck = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                if (!view) return { error: 'no view' };
                const editorView = (view.editor as unknown as Record<string, unknown>).cm as
                    { contentDOM: HTMLElement } | undefined;
                if (!editorView) return { error: 'no editorView' };
                const lines = Array.from(editorView.contentDOM.querySelectorAll('.cm-line'));
                return lines.map((line, i) => {
                    const isActive = line.classList.contains('cm-active');
                    const fmtEls = Array.from(line.querySelectorAll('[class*="formatting"]'));
                    return {
                        lineIdx: i,
                        isActive,
                        text: line.textContent,
                        formattingMarks: fmtEls.map(el => {
                            const cs = getComputedStyle(el as HTMLElement);
                            return {
                                text: el.textContent,
                                display: cs.display,
                                visibility: cs.visibility,
                                width: (el as HTMLElement).getBoundingClientRect().width,
                                height: (el as HTMLElement).getBoundingClientRect().height,
                                fontSize: cs.fontSize,
                                opacity: cs.opacity,
                                overflow: cs.overflow,
                                position: cs.position,
                                clip: cs.clip,
                            };
                        }),
                    };
                });
            })) as unknown[];
            console.log('CSS formatting diag:', JSON.stringify(cssCheck, null, 2));
            console.log('LP snap sequence:', JSON.stringify([step1, step2, step3, step4, step5, step6], null, 2));
            expect(step1).not.toHaveProperty('error');
        });

        it.skip('vi*y on italic content is affected by Live Preview cursor snap', async function () {
            // Live Preview snaps cursor positions inside italic markers (*...*).
            // setupEditor(ch:1) on *aa* places cursor at ch:0 (the * boundary).
            // This is an Obsidian-level CM6 decoration behavior, not a vim or
            // text object bug. The snap occurs for short italic content and
            // for cursor positions inside *...* even with surrounding text.
            // *aaaaa* does NOT snap (ch:1 stays), but *aa* and *a* both snap
            // to ch:0. prefix *aaaaa* suffix with ch:8 snaps to ch:7.
            await setupEditor('*aaaaa*', { line: 0, ch: 1 });
            await vimKeys('v', 'i', '*');
            await browser.keys(['y']);
            await browser.pause(50);
            await vimKeys('$', 'p');
            expect(await getEditorValue()).toBe('*aaaaa*aaaaa');
        });

        it.skip('vi* on single-char italic should select the character', async function () {
            await setupEditor('Hello *x* world', { line: 0, ch: 7 });
            await vimKeys('v', 'i', '*');
            expect(await getSelection()).toBe('x');
            await sendVimEscape();
            await browser.pause(200);
        });

        it('yi* should yank inside bold', async function () {
            await setupEditor('Hello **bold** world', { line: 0, ch: 10 });
            await vimKeys('y', 'i', '*');
            await vimKeys('$', 'p');
            expect(await getEditorValue()).toBe('Hello **bold** worldbold');
        });

        it('visual mode should not break delete operator', async function () {
            await setupEditor('Hello **bold** world', { line: 0, ch: 10 });
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('visual mode should not break around delete', async function () {
            await setupEditor('Hello $x + y$ world', { line: 0, ch: 9 });
            await vimKeys('d', 'a', '$');
            expect(await getEditorValue()).toBe('Hello  world');
        });
    });
});
