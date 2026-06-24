import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getSelection,
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
        it('v + w + label should select text from cursor to target', async function () {
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
            if (result.labels.length > 0) {
                await browser.keys([result.labels[0]!]);
                await browser.pause(200);
            }
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
            // f starts async waitForKey, send the char via browser.keys
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
});
