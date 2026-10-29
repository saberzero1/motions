import { browser, expect } from '@wdio/globals';
import {
    canvasPaintSupported,
    ensureLivePreview,
    ensureWindowFocused,
    getCursorPos,
    getEditorValue,
    getVimMode,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
    vimKeys,
} from '../helpers';

/**
 * Features that act on the editor's own lines, inside a revealed table.
 *
 * Each was documented as "the same code path inside a table as outside it,
 * not yet tested". The claim is plausible — a revealed row is an ordinary
 * editor line — but plausibility is exactly what this suite does not accept,
 * and two of these have a specific way to fail here. A composition at the end
 * of a row changes the row's range, so the extender rebuilds the highlight
 * that wraps the composing text. And every label renderer positions its
 * labels from CodeMirror coordinates, which inside a block-replaced table
 * collapse to the widget's edges.
 *
 * Every scenario reads Obsidian's widget alongside what it measures, so a
 * label or a caret that appears for some other reason cannot pass for one
 * inside a revealed table.
 */

const DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Below the table here',
].join('\n');

interface CdpSession {
    send(method: string, params?: unknown): Promise<unknown>;
}

async function createCdpSession(): Promise<CdpSession> {
    const puppeteer = await (
        browser as unknown as {
            getPuppeteer(): Promise<{ pages(): Promise<unknown[]> }>;
        }
    ).getPuppeteer();
    const pages = await puppeteer.pages();
    const page = pages[0] as {
        target(): { createCDPSession(): Promise<CdpSession> };
    };
    return page.target().createCDPSession();
}

async function widgetCount(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: { dom: HTMLElement } })
            ?.cm;
        return cm ? cm.dom.querySelectorAll('.cm-table-widget').length : -1;
    })) as number;
}

/** Enter the table from above with real keys, landing on `line` (0-based). */
async function enterTable(line: number): Promise<void> {
    await setupEditor(DOC, { line: 0, ch: 0 });
    await browser.pause(300);
    await vimKeys(...Array.from({ length: line }, () => 'j'));
    expect((await getCursorPos()).line).toBe(line);
    expect(await widgetCount()).toBe(0);
}

/**
 * Vertical extents of the revealed rows, so a label can be tied to the row it
 * sits on rather than merely counted.
 */
async function revealedRowBands(): Promise<
    { text: string; top: number; bottom: number }[]
> {
    return (await browser.executeObsidian(() =>
        Array.from(document.querySelectorAll('.vim-motions-reveal-row')).map(
            (el) => {
                const r = el.getBoundingClientRect();
                return {
                    text: el.textContent ?? '',
                    top: r.top,
                    bottom: r.bottom,
                };
            },
        ),
    )) as { text: string; top: number; bottom: number }[];
}

interface Label {
    text: string;
    top: number;
    bottom: number;
}

async function labelsBySelector(selector: string): Promise<Label[]> {
    return (await browser.executeObsidian(
        (_ctx, sel: string) =>
            Array.from(document.querySelectorAll(sel)).map((el) => {
                const r = el.getBoundingClientRect();
                return {
                    text: (el.textContent ?? '').trim(),
                    top: r.top,
                    bottom: r.bottom,
                };
            }),
        selector,
    )) as Label[];
}

function rowOf(
    label: Label,
    rows: { text: string; top: number; bottom: number }[],
): string | null {
    const mid = (label.top + label.bottom) / 2;
    return rows.find((r) => mid >= r.top && mid <= r.bottom)?.text ?? null;
}

describe('Reveal surface: line-level features inside a revealed table', function () {
    this.timeout(240000);

    before(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setPluginSettingAndReload('tableWidgetMode', 'reveal');
    });

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await browser.pause(200);
    });

    after(async function () {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    describe('IME composition', function () {
        it('commits a composition mid-row once, and one undo reverses it', async function () {
            const session = await createCdpSession();
            await enterTable(4);
            await vimKeys('0', 'w', 'i');
            expect(await getVimMode()).toBe('insert');

            await session.send('Input.imeSetComposition', {
                text: 'にほ',
                selectionStart: 2,
                selectionEnd: 2,
            });
            await browser.pause(300);
            const during = await widgetCount();
            await session.send('Input.insertText', { text: '日本' });
            await browser.pause(500);
            const committed = await getEditorValue();

            await browser.keys(['Escape']);
            await browser.pause(300);
            const mode = await getVimMode();
            await browser.keys(['u']);
            await browser.pause(500);

            expect(during).toBe(0);
            expect(committed.split('\n')[4]).toBe('| 日本aa   | 11    |');
            expect((committed.match(/[にほ日本]/g) ?? []).length).toBe(2);
            expect(mode).toBe('normal');
            expect(await getEditorValue()).toBe(DOC);
            expect(await widgetCount()).toBe(0);
        });

        it('commits a composition at the end of a row, where the highlight is rebuilt', async function () {
            const session = await createCdpSession();
            await enterTable(4);
            await vimKeys('A');
            expect(await getVimMode()).toBe('insert');

            await session.send('Input.imeSetComposition', {
                text: 'に',
                selectionStart: 1,
                selectionEnd: 1,
            });
            await browser.pause(300);
            await session.send('Input.imeSetComposition', {
                text: 'にほ',
                selectionStart: 2,
                selectionEnd: 2,
            });
            await browser.pause(300);
            const during = await widgetCount();
            await session.send('Input.insertText', { text: '日本' });
            await browser.pause(500);
            const committed = await getEditorValue();
            await browser.keys(['Escape']);
            await browser.pause(300);

            expect(during).toBe(0);
            expect(committed.split('\n')[4]).toBe('| aa   | 11    |日本');
            expect((committed.match(/[にほ日本]/g) ?? []).length).toBe(2);
            expect(await widgetCount()).toBe(0);
        });
    });

    it('flash labels a match inside the revealed table, and jumps to it', async function () {
        await setPluginSettingAndReload('enableFlash', true);
        await setPluginSettingAndReload('flashJumpEnabled', true);
        await setPluginSettingAndReload('flashJumpKey', 's');
        const doc = DOC.replace('| aa   |', '| qa   |').replace(
            '| bb   |',
            '| qb   |',
        );
        await setupEditor(doc, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('j', 'j', 'j', 'j');
        await browser.keys(['s', 'q']);
        await browser.pause(400);
        const labels = await labelsBySelector('.vim-motions-easymotion-label');
        const rows = await revealedRowBands();
        const onLastRow = labels.find(
            (l) => rowOf(l, rows) === '| qb   | 22    |',
        );
        if (onLastRow) {
            for (const ch of onLastRow.text) await browser.keys([ch]);
            await browser.pause(400);
        } else {
            await browser.keys(['Escape']);
        }
        const pos = await getCursorPos();
        await setPluginSettingAndReload('flashJumpEnabled', false);

        expect(labels.length).toBe(2);
        expect(onLastRow).toBeDefined();
        expect(pos).toEqual({ line: 5, ch: 2 });
        expect(await widgetCount()).toBe(0);
    });

    it('EasyMotion labels words inside the revealed table, and jumps to one', async function () {
        await enterTable(3);
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const adapter = (
                view?.editor as unknown as { cm?: { cm?: unknown } }
            )?.cm?.cm;
            if (!Vim || !adapter) throw new Error('no vim adapter');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, '\\');
            Vim.handleKey(adapter, 'w');
        });
        await browser.pause(400);
        const labels = await labelsBySelector(
            '.vim-motions-easymotion .vim-motions-easymotion-label, .vim-motions-easymotion > *',
        );
        const rows = await revealedRowBands();
        const target = labels.find(
            (l) => l.text.length > 0 && rowOf(l, rows) === '| bb   | 22    |',
        );
        if (target) {
            for (const ch of target.text) await browser.keys([ch]);
            await browser.pause(400);
        } else {
            await browser.keys(['Escape']);
        }
        const pos = await getCursorPos();

        expect(target).toBeDefined();
        expect(pos.line).toBe(5);
        expect(await widgetCount()).toBe(0);
    });

    it('hint mode labels a source link in a revealed table as it does any source link, and opens it', async function () {
        const doc =
            ['See [[Target]] here', ''].join('\n') +
            '\n' +
            DOC.replace('| bb   |', '| [[Target]] |');
        const showHints = async (): Promise<void> => {
            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('vim-motions:show-hint-labels');
            });
            await browser.pause(500);
        };
        const lineBand = async (text: string) =>
            (await browser.executeObsidian((_ctx, t: string) => {
                const el = Array.from(
                    document.querySelectorAll('.cm-line'),
                ).find((l) => l.textContent === t);
                const r = el?.getBoundingClientRect();
                return r ? { text: t, top: r.top, bottom: r.bottom } : null;
            }, text)) as { text: string; top: number; bottom: number } | null;

        // Control: the same link on an ordinary line, with the caret inside
        // it so Live Preview shows its source.
        await setupEditor(doc, { line: 0, ch: 7 });
        await browser.pause(400);
        await showHints();
        const plainBand = await lineBand('See [[Target]] here');
        const plainLabels = (
            await labelsBySelector(
                '.vim-motions-hint-overlay .vim-motions-hint-label',
            )
        ).filter((l) => plainBand && rowOf(l, [plainBand]) !== null);
        await browser.keys(['Escape']);
        await browser.pause(200);

        await setupEditor(doc, { line: 6, ch: 2 });
        await browser.pause(400);
        expect(await widgetCount()).toBe(0);
        await showHints();
        const rows = await revealedRowBands();
        const tableLabels = (
            await labelsBySelector(
                '.vim-motions-hint-overlay .vim-motions-hint-label',
            )
        ).filter((l) => rowOf(l, rows) === '| [[Target]] | 22    |');
        const first = tableLabels[0];
        if (first) {
            for (const ch of first.text) await browser.keys([ch]);
            await browser.pause(800);
        } else {
            await browser.keys(['Escape']);
        }
        const opened = (await browser.executeObsidian(
            ({ app }) => app.workspace.getActiveFile()?.path ?? '',
        )) as string;

        expect(plainBand).not.toBeNull();
        expect(plainLabels.length).toBeGreaterThan(0);
        expect(tableLabels.length).toBe(plainLabels.length);
        expect(opened).toBe('Target.md');
    });

    it('expands a snippet in a revealed cell and walks its tabstops', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                snippetRegistry?: {
                                    loadFile: (
                                        f: Record<
                                            string,
                                            { prefix: string; body: string }
                                        >,
                                        s: string,
                                    ) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin?.snippetRegistry) throw new Error('no snippetRegistry');
            plugin.snippetRegistry.loadFile(
                { 'Reveal Pair': { prefix: 'zpair', body: '${1:x}-${2:y}$0' } },
                'user',
            );
        });
        await enterTable(4);
        await vimKeys('0', 'w', 'i');
        await browser.keys(['z', 'p', 'a', 'i', 'r']);
        await browser.pause(200);
        await browser.keys(['Tab']);
        await browser.pause(500);
        const expanded = await getEditorValue();
        const first = await selectedText();
        await browser.keys(['Q']);
        await browser.keys(['Tab']);
        await browser.pause(400);
        const second = await selectedText();
        await browser.keys(['W']);
        await browser.keys(['Escape']);
        await browser.pause(300);

        expect(expanded.split('\n')[4]).toBe('| x-yaa   | 11    |');
        expect(first).toBe('x');
        expect(second).toBe('y');
        expect((await getEditorValue()).split('\n')[4]).toBe(
            '| Q-Waa   | 11    |',
        );
        expect(await widgetCount()).toBe(0);
    });

    it('paints the animated cursor on the caret inside the revealed table', async function () {
        if (!(await canvasPaintSupported())) {
            console.log('SKIP canvas readback unavailable on this runner');
            this.skip();
        }
        await ensureWindowFocused();
        await setPluginSettingAndReload('animatedCursor', true);
        await setPluginSettingAndReload('smoothCursor', false);
        await setPluginSettingAndReload('smearTrail', false);
        try {
            await enterTable(5);
            await vimKeys('0', 'w');
            let painted = await paintedCursorBounds();
            for (let i = 0; i < 20 && !painted.painted; i++) {
                await browser.pause(100);
                painted = await paintedCursorBounds();
            }
            const caret = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    const cm = (
                        view?.editor as unknown as {
                            cm?: {
                                state: {
                                    selection: { main: { head: number } };
                                };
                                coordsAtPos: (
                                    p: number,
                                    s: number,
                                ) => { top: number; left: number } | null;
                            };
                        }
                    )?.cm;
                    const c = cm?.coordsAtPos(cm.state.selection.main.head, 1);
                    return c ? { top: c.top, left: c.left } : null;
                },
            )) as { top: number; left: number } | null;

            expect(painted.painted).toBe(true);
            expect(caret).not.toBeNull();
            expect(Math.abs(painted.top - caret!.top)).toBeLessThanOrEqual(4);
            expect(Math.abs(painted.left - caret!.left)).toBeLessThanOrEqual(4);
            expect(await widgetCount()).toBe(0);
        } finally {
            await setPluginSettingAndReload('animatedCursor', false);
        }
    });
});

async function selectedText(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getSelection() ?? '';
    })) as string;
}

/** The painted bounds on the animated cursor's canvas, read from its pixels. */
async function paintedCursorBounds(): Promise<{
    painted: boolean;
    left: number;
    top: number;
}> {
    return (await browser.execute(() => {
        const empty = { painted: false, left: 0, top: 0 };
        const canvas = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return empty;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0) return empty;
        const w = canvas.width;
        const h = canvas.height;
        const d = ctx.getImageData(0, 0, w, h).data;
        let minX = Infinity;
        let minY = Infinity;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            for (let x = 0; x < w; x++) {
                if ((d[row + x * 4 + 3] ?? 0) > 8) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                }
            }
        }
        if (minX === Infinity) return empty;
        const scale = w / (parseFloat(canvas.style.width) || w) || 1;
        return { painted: true, left: minX / scale, top: minY / scale };
    })) as { painted: boolean; left: number; top: number };
}
