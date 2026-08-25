import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getSelection,
    getEditorValue,
    getRegisterContent,
    sendVimEscape,
} from '../helpers';

type VimHandle = {
    handleKey: (cm: unknown, key: string) => boolean;
};

type EasyMotionSetupResult = {
    labels: string[];
    error?: string;
};

async function triggerEasyMotion(
    content: string,
    cursor: { line: number; ch: number },
    keys: string[],
): Promise<EasyMotionSetupResult> {
    return (await browser.executeObsidian(
        (
            { app, obsidian },
            text: string,
            line: number,
            ch: number,
            keySeq: string[],
        ) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { labels: [] };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { labels: [] };
            view.editor.setValue(text);
            view.editor.setCursor(line, ch);
            view.editor.focus();
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { labels: [] };

            for (const k of keySeq) {
                Vim.handleKey(adapter, k);
            }

            const overlay = activeDocument.querySelector(
                '.vim-motions-easymotion',
            );
            if (!overlay) return { labels: [] };

            const labelEls = overlay.querySelectorAll(
                '.vim-motions-easymotion-label',
            );
            const labels: string[] = [];
            labelEls.forEach((el) => labels.push(el.textContent ?? ''));
            return { labels };
        },
        content,
        cursor.line,
        cursor.ch,
        keys,
    )) as EasyMotionSetupResult;
}

async function dismissOverlay(): Promise<void> {
    await sendVimEscape();
    await browser.pause(200);
}

describe('EasyMotion comprehensive', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(100);
    });

    describe('cursor landing - word motions', function () {
        it('w should jump cursor to the selected word start', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 0 },
                ['\\', '\\', 'w'],
            );
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(3);

            // Press the second label (should jump to 'beta' or 'gamma')
            const label = result.labels[1]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // 'beta' starts at ch=6, 'gamma' at ch=11 — second forward word
            expect(pos.ch).toBe(11);
        });

        it('b should jump cursor to a word start before cursor', async function () {
            // 'alpha beta gamma delta': word starts at ch=0,6,11,17
            // Cursor at ch=22 (end). Backward closest-first: ch=17, ch=11, ch=6, ch=0
            const result = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 22 },
                ['\\', '\\', 'b'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(3);

            // label[1] should be second-closest backward = 'gamma' at ch=11
            const label = result.labels[1]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(11);
        });

        it('e should jump cursor to end of word forward', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma',
                { line: 0, ch: 0 },
                ['\\', '\\', 'e'],
            );
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            const label = result.labels[0]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // First word-end forward from ch=0: 'alpha' ends at ch=4
            expect(pos.ch).toBe(4);
        });

        it('W should jump to WORD start (treating punctuation as part of word)', async function () {
            const result = await triggerEasyMotion(
                'hello-world foo.bar baz',
                { line: 0, ch: 0 },
                ['\\', '\\', 'W'],
            );
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(1);

            const label = result.labels[0]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // 'foo.bar' starts at ch=12 (WORD skips hello-world as one unit)
            expect(pos.ch).toBe(12);
        });
    });

    describe('cursor landing - char motions', function () {
        it('f should jump to forward char occurrence', async function () {
            // handleKey sends \\f which starts async waitForKey;
            // browser.keys sends the search char to the async listener
            await triggerEasyMotion(
                'apple apricot avocado',
                { line: 0, ch: 0 },
                ['\\', '\\', 'f'],
            );
            await browser.keys(['r']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([labels[0]!]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // 'apple apricot avocado': 'r' at ch=8
            expect(pos.ch).toBe(8);
        });

        it('F should jump to backward char occurrence', async function () {
            await triggerEasyMotion(
                'apple apricot avocado',
                { line: 0, ch: 20 },
                ['\\', '\\', 'F'],
            );
            await browser.keys(['p']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([labels[0]!]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // 'apple apricot avocado': 'p' at ch=1, ch=2, ch=7
            // Closest backward from ch=20: ch=7
            expect(pos.ch).toBe(7);
        });

        it('t should jump to one position before char', async function () {
            await triggerEasyMotion('the quick brown fox', { line: 0, ch: 0 }, [
                '\\',
                '\\',
                't',
            ]);
            await browser.keys(['o']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([labels[0]!]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // First 'o' forward: 'brown' has 'o' at ch=12 → till puts cursor at ch=11
            expect(pos.ch).toBe(11);
        });

        it('s should find char bidirectionally', async function () {
            await triggerEasyMotion('axa bxb cxc', { line: 0, ch: 5 }, [
                '\\',
                '\\',
                's',
            ]);
            await browser.keys(['x']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(2);
            await dismissOverlay();
        });

        it('s should find capital letter typed with Shift (issue #84)', async function () {
            // Clean up any stale overlays from previous tests
            await browser.executeObsidian(() => {
                activeDocument
                    .querySelectorAll('.vim-motions-easymotion')
                    .forEach((el) => el.remove());
            });
            await browser.pause(100);

            await triggerEasyMotion(
                'Zero apples, a Zephyr blows',
                { line: 0, ch: 10 },
                ['\\', '\\', 's'],
            );
            await browser.keys(['Z']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);
            await dismissOverlay();
        });
    });

    describe('cursor landing - line motions', function () {
        it('j should jump to line below cursor', async function () {
            const result = await triggerEasyMotion(
                'line one\nline two\nline three\nline four',
                { line: 0, ch: 0 },
                ['\\', '\\', 'j'],
            );
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            const label = result.labels[1]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            // Second forward line target should be line 2 or 3
            expect(pos.line).toBeGreaterThanOrEqual(2);
        });

        it('k should show line labels above cursor', async function () {
            const result = await triggerEasyMotion(
                'line one\nline two\nline three\nline four',
                { line: 3, ch: 0 },
                ['\\', '\\', 'k'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(1);
            await dismissOverlay();
        });
    });

    describe('cursor landing - ge and gE', function () {
        it('ge should jump to end of word backward', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 18 },
                ['\\', '\\', 'g', 'e'],
            );
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            const label = result.labels[0]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // Closest word-end backward from ch=18: 'gamma' ends at ch=15
            expect(pos.ch).toBe(15);
        });

        it('gE should jump to end of WORD backward', async function () {
            const result = await triggerEasyMotion(
                'hello-world foo.bar baz-qux',
                { line: 0, ch: 25 },
                ['\\', '\\', 'g', 'E'],
            );
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(1);

            const label = result.labels[0]!;
            await browser.keys([label]);
            await browser.pause(300);

            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            // Closest WORD-end backward from ch=25: 'foo.bar' ends at ch=18
            expect(pos.ch).toBe(18);
        });
    });

    describe('2-char combo labels', function () {
        it('should produce 2-char labels when targets exceed label pool', async function () {
            const manyWords = Array.from(
                { length: 40 },
                (_, i) => `word${i}`,
            ).join(' ');
            const result = await triggerEasyMotion(
                manyWords,
                { line: 0, ch: 0 },
                ['\\', '\\', 'w'],
            );
            expect(result.error).toBeUndefined();
            // Default label pool is 26 chars, 40 words → must have 2-char labels
            const multiCharLabels = result.labels.filter((l) => l.length > 1);
            expect(multiCharLabels.length).toBeGreaterThan(0);
            await dismissOverlay();
        });

        it('should jump correctly with 2-char label', async function () {
            const manyWords = Array.from(
                { length: 40 },
                (_, i) => `w${i}`,
            ).join(' ');
            const result = await triggerEasyMotion(
                manyWords,
                { line: 0, ch: 0 },
                ['\\', '\\', 'w'],
            );
            expect(result.error).toBeUndefined();

            const twoCharLabel = result.labels.find((l) => l.length === 2);
            if (twoCharLabel) {
                await browser.keys([twoCharLabel[0]!]);
                await browser.pause(200);
                await browser.keys([twoCharLabel[1]!]);
                await browser.pause(300);

                const pos = await getCursorPos();
                expect(pos.line).toBe(0);
                expect(pos.ch).toBeGreaterThan(0);
            } else {
                await dismissOverlay();
            }
        });
    });

    describe('dimming', function () {
        it('should show shade overlay when dimming is enabled', async function () {
            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: { Vim?: VimHandle };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    view.editor.setValue('hello world foo bar');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, 'w');

                    const shade = activeDocument.querySelector(
                        '.vim-motions-easymotion-shade',
                    );
                    return { hasShade: !!shade };
                },
            )) as { hasShade: boolean; error?: string };
            expect(result.error).toBeUndefined();
            expect(result.hasShade).toBe(true);
            await dismissOverlay();
        });
    });

    describe('repeat', function () {
        it('should repeat the last easymotion motion', async function () {
            // First: trigger word forward to prime the repeat state
            const first = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 0 },
                ['\\', '\\', 'w'],
            );
            expect(first.error).toBeUndefined();
            expect(first.labels.length).toBeGreaterThanOrEqual(2);

            // Press first label to jump (this primes lastTrigger)
            await browser.keys([first.labels[0]!]);
            await browser.pause(300);

            // Now trigger repeat via the registered action
            const repeatResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: { Vim?: VimHandle };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };

                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, 'w');

                    const overlay = activeDocument.querySelector(
                        '.vim-motions-easymotion',
                    );
                    return {
                        hasOverlay: !!overlay,
                        labelCount:
                            overlay?.querySelectorAll(
                                '.vim-motions-easymotion-label',
                            ).length ?? 0,
                    };
                },
            )) as { hasOverlay: boolean; labelCount: number; error?: string };
            expect(repeatResult.error).toBeUndefined();
            expect(repeatResult.hasOverlay).toBe(true);
            expect(repeatResult.labelCount).toBeGreaterThan(0);
            await dismissOverlay();
        });
    });

    describe('visual mode cursor landing', function () {
        it.skip('v + w + label should select text from cursor to target (WebDriver label key routing — see KNOWN_LIMITATIONS.md)', async function () {
            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: { Vim?: VimHandle };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { labels: [], error: 'No Vim' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { labels: [], error: 'No view' };
                    view.editor.setValue('alpha beta gamma delta');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { labels: [], error: 'No adapter' };

                    Vim.handleKey(adapter, 'v');
                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, '\\');
                    Vim.handleKey(adapter, 'w');

                    const overlay = activeDocument.querySelector(
                        '.vim-motions-easymotion',
                    );
                    if (!overlay) return { labels: [], error: 'No overlay' };
                    const labelEls = overlay.querySelectorAll(
                        '.vim-motions-easymotion-label',
                    );
                    const labels: string[] = [];
                    labelEls.forEach((el) => labels.push(el.textContent ?? ''));
                    return { labels };
                },
            )) as EasyMotionSetupResult;
            expect(result.error).toBeUndefined();
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            const label = result.labels[1]!;
            await browser.keys([label]);
            await browser.pause(500);

            const selection = await getSelection();
            expect(selection.length).toBeGreaterThan(0);
            expect(selection).toContain('alpha');
        });

        it('v + f + label should select text from cursor to char target', async function () {
            // f is async (waitForKey), so handleKey sends v, \\, \\, f
            // then browser.keys sends the search char
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('the quick brown fox');
                view.editor.setCursor(0, 0);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;

                Vim.handleKey(adapter, 'v');
                Vim.handleKey(adapter, '\\');
                Vim.handleKey(adapter, '\\');
                Vim.handleKey(adapter, 'f');
            });
            await browser.keys(['o']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([labels[0]!]);
            await browser.pause(300);

            const selection = await getSelection();
            expect(selection.length).toBeGreaterThan(0);
        });
    });

    describe('edge cases', function () {
        it('should not crash on empty document', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            const result = await triggerEasyMotion('', { line: 0, ch: 0 }, [
                '\\',
                '\\',
                'w',
            ]);
            expect(result.labels.length).toBe(0);
        });

        it('should handle single word document', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            const result = await triggerEasyMotion(
                'hello',
                { line: 0, ch: 0 },
                ['\\', '\\', 'w'],
            );
            expect(result.labels.length).toBe(0);
            const value = await getEditorValue();
            expect(value).toBe('hello');
        });

        it('should handle document with only empty lines', async function () {
            await setupEditor('\n\n\n', { line: 0, ch: 0 });
            const result = await triggerEasyMotion(
                '\n\n\n',
                { line: 0, ch: 0 },
                ['\\', '\\', 'j'],
            );
            expect(result.labels.length).toBe(0);
        });

        it('f with non-existent char should produce no overlay', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await triggerEasyMotion('hello world', { line: 0, ch: 0 }, [
                '\\',
                '\\',
                'f',
            ]);
            await browser.keys(['z']);
            await browser.pause(300);
            const overlayGone = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                return !overlay || overlay.children.length === 0;
            })) as boolean;
            expect(overlayGone).toBe(true);
        });
    });

    describe('operator-pending easymotion', function () {
        it('d + easymotion w should delete to target', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 0 },
                ['d', '\\', '\\', 'w'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);
            await browser.keys([result.labels[1]!]);
            await browser.pause(500);
            const text = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                return view?.editor.getValue() ?? '';
            })) as string;
            expect(text).not.toBe('alpha beta gamma delta');
            expect(text.length).toBeLessThan('alpha beta gamma delta'.length);
        });

        it('y + easymotion w should yank to target without deleting', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 0 },
                ['y', '\\', '\\', 'w'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);
            await browser.keys([result.labels[0]!]);
            await browser.pause(500);
            const state = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: Record<
                                    string,
                                    (...args: unknown[]) => unknown
                                >;
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    const controller = Vim?.getRegisterController() as
                        | Record<string, (...args: unknown[]) => unknown>
                        | undefined;
                    const reg = controller?.getRegister('"') as {
                        toString: () => string;
                    } | null;
                    return {
                        text: view?.editor.getValue() ?? '',
                        register: reg?.toString() ?? '',
                    };
                },
            )) as { text: string; register: string };
            expect(state.text).toBe('alpha beta gamma delta');
            expect(state.register.length).toBeGreaterThan(0);
        });

        it('y + easymotion f should include the target character (inclusive)', async function () {
            // Issue #109: f motion is inclusive — yank should include the target char
            // 'alpha beta gamma': cursor at 0, search for 'g', label for 'g' at ch=11
            await triggerEasyMotion('alpha beta gamma', { line: 0, ch: 0 }, [
                'y',
                '\\',
                '\\',
                'f',
            ]);
            await browser.keys(['g']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([labels[0]!]);
            await browser.pause(500);

            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            // Inclusive: yank from 'a' (ch=0) through 'g' (ch=11) = "alpha beta g"
            expect(reg!.text).toBe('alpha beta g');
        });

        it('d + easymotion e should include the end-of-word character (inclusive)', async function () {
            // e motion is inclusive — delete should include the last char of the word
            const result = await triggerEasyMotion(
                'alpha beta gamma',
                { line: 0, ch: 0 },
                ['d', '\\', '\\', 'e'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(1);

            // First label = end of 'alpha' (ch=4)
            await browser.keys([result.labels[0]!]);
            await browser.pause(500);

            const text = await getEditorValue();
            // Inclusive: delete 'alpha' (ch 0-4 inclusive), leaving ' beta gamma'
            expect(text).toBe(' beta gamma');
        });

        it('y + easymotion w should NOT include the target character (exclusive)', async function () {
            // w motion is exclusive — yank should stop before the target word
            const result = await triggerEasyMotion(
                'alpha beta gamma',
                { line: 0, ch: 0 },
                ['y', '\\', '\\', 'w'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            // Second label = 'gamma' at ch=11
            await browser.keys([result.labels[1]!]);
            await browser.pause(500);

            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            // Exclusive: yank from 'a' (ch=0) up to but not including 'g' (ch=11) = "alpha beta "
            expect(reg!.text).toBe('alpha beta ');
        });

        it('v + easymotion f + y should include the target character (visual regression)', async function () {
            // Visual mode must still include target char — regression test
            await setupEditor('alpha beta gamma', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: VimHandle };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('alpha beta gamma');
                view.editor.setCursor(0, 0);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return;
                Vim.handleKey(adapter, 'v');
                Vim.handleKey(adapter, '\\');
                Vim.handleKey(adapter, '\\');
                Vim.handleKey(adapter, 'f');
            });
            await browser.keys(['g']);
            await browser.pause(300);

            const labels = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-easymotion',
                );
                if (!overlay) return [];
                const els = overlay.querySelectorAll(
                    '.vim-motions-easymotion-label',
                );
                const result: string[] = [];
                els.forEach((el) => result.push(el.textContent ?? ''));
                return result;
            })) as string[];
            expect(labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([labels[0]!]);
            await browser.pause(300);

            await browser.keys(['y']);
            await browser.pause(300);

            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            // Visual mode includes the target char
            expect(reg!.text).toBe('alpha beta g');
        });

        it('c + easymotion w should change to target and enter insert mode', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma delta',
                { line: 0, ch: 0 },
                ['c', '\\', '\\', 'w'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);
            await browser.keys([result.labels[0]!]);
            await browser.pause(500);
            const state = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm as
                        | Record<string, unknown>
                        | undefined;
                    const vim = (adapter?.state as Record<string, unknown>)
                        ?.vim as Record<string, boolean> | undefined;
                    return {
                        text: view.editor.getValue(),
                        insertMode: vim?.insertMode ?? false,
                    };
                },
            )) as { text: string; insertMode: boolean };
            expect(state.text.length).toBeLessThan(
                'alpha beta gamma delta'.length,
            );
            expect(state.insertMode).toBe(true);
            await sendVimEscape();
        });

        it('d + easymotion j should delete linewise (not characterwise)', async function () {
            // Issue: EasyMotion line motions (j/k) lack motionArgs.linewise,
            // causing d+easymotion j to delete characterwise instead of linewise.
            // Native vim `dj` deletes two full lines; easymotion j should match.
            const result = await triggerEasyMotion(
                'line one\nline two\nline three\nline four',
                { line: 0, ch: 3 },
                ['d', '\\', '\\', 'j'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(1);

            // Select the first label (line two = line 1)
            await browser.keys([result.labels[0]!]);
            await browser.pause(500);

            const text = await getEditorValue();
            // Linewise delete from line 0 to line 1 should remove both full lines,
            // leaving only 'line three\nline four'
            expect(text).toBe('line three\nline four');
        });

        it('y + easymotion j should yank linewise with register linewise flag', async function () {
            // Issue: EasyMotion line motions lack motionArgs.linewise.
            // Native vim `yj` yanks two full lines with linewise register flag.
            const result = await triggerEasyMotion(
                'line one\nline two\nline three\nline four',
                { line: 0, ch: 3 },
                ['y', '\\', '\\', 'j'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([result.labels[0]!]);
            await browser.pause(500);

            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            // Linewise yank should include full lines with trailing newlines
            expect(reg!.text).toBe('line one\nline two\n');
            expect(reg!.linewise).toBe(true);
        });

        it('d + easymotion k should delete linewise upward', async function () {
            const result = await triggerEasyMotion(
                'aaa\nbbb\nccc\nddd\neee',
                { line: 4, ch: 0 },
                ['d', '\\', '\\', 'k'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            await browser.keys([result.labels[1]!]);
            await browser.pause(500);

            const text = await getEditorValue();
            expect(text).not.toContain('eee');
            expect(text).not.toContain('ddd');
            expect(text).toContain('aaa');
        });
    });

    describe('operator-pending easyMotionRepeat', function () {
        it('d + easyMotionRepeat should delete to the repeated target', async function () {
            const result = await triggerEasyMotion(
                'alpha beta gamma delta epsilon',
                { line: 0, ch: 0 },
                ['\\', '\\', 'w'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            await browser.keys([result.labels[0]!]);
            await browser.pause(300);

            const posAfterJump = await getCursorPos();
            expect(posAfterJump.ch).toBeGreaterThan(0);

            const repeatResult = await triggerEasyMotion(
                'alpha beta gamma delta epsilon',
                posAfterJump,
                ['d', '\\', '\\', '.'],
            );
            expect(repeatResult.labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([repeatResult.labels[0]!]);
            await browser.pause(500);

            const text = await getEditorValue();
            expect(text.length).toBeLessThan(
                'alpha beta gamma delta epsilon'.length,
            );
        });

        it('d + easyMotionRepeat after line motion should delete linewise', async function () {
            const result = await triggerEasyMotion(
                'aaa\nbbb\nccc\nddd\neee',
                { line: 0, ch: 0 },
                ['\\', '\\', 'j'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(2);

            await browser.keys([result.labels[0]!]);
            await browser.pause(300);

            const repeatResult = await triggerEasyMotion(
                'aaa\nbbb\nccc\nddd\neee',
                { line: 1, ch: 0 },
                ['d', '\\', '\\', '.'],
            );
            expect(repeatResult.labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([repeatResult.labels[0]!]);
            await browser.pause(500);

            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.linewise).toBe(true);
        });
    });

    describe('EXTRA_DEFS operator-pending motionArgs', function () {
        it('y + easyMotionBdLine should yank linewise via motionArgs mutation', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                mapCommand: (
                                    keys: string,
                                    type: string,
                                    name: string,
                                    args: Record<string, unknown>,
                                ) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.mapCommand('g<Space>', 'motion', 'easyMotionBdLine', {});
            });
            await browser.pause(100);

            const result = await triggerEasyMotion(
                'aaa\nbbb\nccc\nddd',
                { line: 0, ch: 0 },
                ['y', 'g', '<Space>'],
            );
            expect(result.labels.length).toBeGreaterThanOrEqual(1);

            await browser.keys([result.labels[0]!]);
            await browser.pause(500);

            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.linewise).toBe(true);
        });
    });
});
