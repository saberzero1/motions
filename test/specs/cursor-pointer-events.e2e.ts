/**
 * Regression test for issue #170:
 * Hover tooltips from other plugins and Obsidian's page preview
 * don't work reliably when Vim Motions is enabled in fork mode.
 *
 * Verifies that mouse event targets inside the editor are never
 * blocked by the vim cursor layer or other plugin overlays.
 *
 * NOTE: Full reproduction of the Obsidian page-preview hover popover
 * is not possible in the e2e environment (Obsidian's hover-link
 * mechanism requires real user interaction, not synthetic events).
 * These tests validate the DOM-level prerequisites instead.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, ensureLivePreview, PAUSE } from '../helpers';

describe('Hover tooltip works with fork vim mode (#170)', function () {
    before(async function () {
        this.timeout(30000);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
    });

    it('cm-vimCursorLayer should have pointer-events none', async function () {
        this.timeout(15000);
        await setupEditor('hello world', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const result = (await browser.executeObsidian(() => {
            const layer = document.querySelector('.cm-vimCursorLayer');
            if (!layer) return { error: 'no .cm-vimCursorLayer found' };
            const computed = activeWindow.getComputedStyle(layer as Element);
            return { pointerEvents: computed.pointerEvents };
        })) as { pointerEvents: string; error?: string };

        expect(result).not.toHaveProperty('error');
        expect(result.pointerEvents).toBe('none');
    });

    it('mousemove targets during drag should all be inside cm-content', async function () {
        this.timeout(20000);
        await setupEditor('hello world test', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(() => {
            const w = window as unknown as Record<string, unknown>;
            w.__mousemoveTargets = [] as unknown[];
            const editor = document.querySelector('.cm-editor');
            if (!editor) return;
            const handler = (e: Event) => {
                const el = (e as MouseEvent).target as HTMLElement;
                (w.__mousemoveTargets as unknown[]).push({
                    tagName: el.tagName,
                    className: el.className,
                    isInsideContent: !!el.closest('.cm-content'),
                    isInsideCursorLayer: !!el.closest('.cm-cursorLayer'),
                    isInsideScrollDOM: !!el.closest('.cm-scroller'),
                });
            };
            editor.addEventListener('mousemove', handler);
            w.__removeMouseHandler = () =>
                editor.removeEventListener('mousemove', handler);
        });

        const contentEl = await browser.$('.cm-content');
        const loc = await contentEl.getLocation();

        await browser.performActions([
            {
                type: 'pointer',
                id: 'mouse1',
                parameters: { pointerType: 'mouse' },
                actions: [
                    {
                        type: 'pointerMove',
                        duration: 0,
                        x: Math.round(loc.x + 5),
                        y: Math.round(loc.y + 10),
                    },
                    { type: 'pause', duration: 50 },
                    {
                        type: 'pointerMove',
                        duration: 100,
                        x: Math.round(loc.x + 40),
                        y: Math.round(loc.y + 10),
                    },
                    { type: 'pause', duration: 50 },
                    {
                        type: 'pointerMove',
                        duration: 100,
                        x: Math.round(loc.x + 80),
                        y: Math.round(loc.y + 10),
                    },
                ],
            },
        ]);
        await browser.pause(200);

        const targets = (await browser.executeObsidian(() => {
            const w = window as unknown as Record<string, unknown>;
            (w.__removeMouseHandler as () => void)?.();
            const result = w.__mousemoveTargets;
            delete w.__mousemoveTargets;
            delete w.__removeMouseHandler;
            return result;
        })) as Array<{
            tagName: string;
            className: string;
            isInsideContent: boolean;
            isInsideCursorLayer: boolean;
            isInsideScrollDOM: boolean;
        }>;

        expect(targets.length).toBeGreaterThan(0);

        const badTargets = targets.filter(
            (t) => !t.isInsideContent && t.isInsideScrollDOM,
        );
        expect(badTargets).toHaveLength(0);
    });

    it('Decoration.mark should be hit-testable at cursor position', async function () {
        this.timeout(20000);
        await setupEditor('hello world test', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Register a Decoration.mark on "hello" (pos 0-5) and a mousemove
        // listener that checks if the target is inside the mark — same
        // pattern the auto-linker plugin uses.
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const editorView = (view.editor as unknown as { cm: unknown })
                .cm as import('@codemirror/view').EditorView;
            if (!editorView) return;

            const { Decoration, ViewPlugin } =
                require('@codemirror/view') as typeof import('@codemirror/view');
            const { StateEffect, RangeSetBuilder } =
                require('@codemirror/state') as typeof import('@codemirror/state');

            const mark = Decoration.mark({
                class: 'test-hover-mark-170',
                attributes: { 'data-test-id': 'hello-mark' },
            });
            const builder = new RangeSetBuilder<
                import('@codemirror/view').Decoration
            >();
            builder.add(0, 5, mark);
            const decoSet = builder.finish();

            const plugin = ViewPlugin.define(
                () => ({
                    decorations: decoSet,
                    destroy() {},
                }),
                { decorations: (v) => v.decorations },
            );

            editorView.dispatch({
                effects: StateEffect.appendConfig.of(plugin),
            });

            const w = window as unknown as Record<string, unknown>;
            w.__markHoverHit = false;
            editorView.dom.addEventListener(
                'mousemove',
                (e: MouseEvent) => {
                    const el = e.target as HTMLElement;
                    if (el.closest?.('.test-hover-mark-170')) {
                        w.__markHoverHit = true;
                    }
                },
                { once: true },
            );
        });

        await browser.pause(PAUSE.EDITOR_SETTLE);

        const contentEl = await browser.$('.cm-content');
        const loc = await contentEl.getLocation();

        await browser.performActions([
            {
                type: 'pointer',
                id: 'mouse1',
                parameters: { pointerType: 'mouse' },
                actions: [
                    {
                        type: 'pointerMove',
                        duration: 0,
                        x: Math.round(loc.x + 15),
                        y: Math.round(loc.y + 10),
                    },
                ],
            },
        ]);
        await browser.pause(300);

        const hit = (await browser.executeObsidian(() => {
            const w = window as unknown as Record<string, unknown>;
            const result = w.__markHoverHit;
            delete w.__markHoverHit;
            return result;
        })) as boolean;

        expect(hit).toBe(true);
    });

    it('caretRangeFromPoint resolves to content on all lines', async function () {
        this.timeout(20000);
        await setupEditor('Mari.\nThis is Mari.\nMore text here.', {
            line: 0,
            ch: 0,
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editorView = (view.editor as unknown as { cm: unknown })
                .cm as import('@codemirror/view').EditorView;
            if (!editorView) return { error: 'no editorView' };

            const lines = editorView.contentDOM.querySelectorAll('.cm-line');
            const results: Array<{
                lineIndex: number;
                lineText: string;
                caretNodeTag: string | null;
                caretNodeClass: string | null;
                caretInContent: boolean | null;
                caretInCursorLayer: boolean | null;
                posAtCoords: number | null;
            }> = [];

            for (let i = 0; i < Math.min(lines.length, 3); i++) {
                const rect = lines[i].getBoundingClientRect();
                const x = rect.left + 10;
                const y = rect.top + rect.height / 2;

                let caretNode: Node | null = null;
                if ('caretRangeFromPoint' in document) {
                    const range = document.caretRangeFromPoint(x, y);
                    caretNode = range?.startContainer ?? null;
                } else if ('caretPositionFromPoint' in document) {
                    const pos = (
                        document as unknown as {
                            caretPositionFromPoint(
                                x: number,
                                y: number,
                            ): { offsetNode: Node } | null;
                        }
                    ).caretPositionFromPoint(x, y);
                    caretNode = pos?.offsetNode ?? null;
                }

                const caretEl =
                    caretNode instanceof HTMLElement
                        ? caretNode
                        : (caretNode?.parentElement ?? null);

                const posResult = editorView.posAtCoords({ x, y });

                results.push({
                    lineIndex: i,
                    lineText: lines[i].textContent?.substring(0, 20) ?? '',
                    caretNodeTag: caretEl?.tagName ?? null,
                    caretNodeClass: caretEl?.className ?? null,
                    caretInContent: caretEl
                        ? !!caretEl.closest('.cm-content')
                        : null,
                    caretInCursorLayer: caretEl
                        ? !!caretEl.closest('.cm-cursorLayer')
                        : null,
                    posAtCoords: posResult,
                });
            }
            return { results };
        })) as { results: Array<Record<string, unknown>>; error?: string };

        expect(result).not.toHaveProperty('error');
        console.log(
            '[#170 caretRange]',
            JSON.stringify(result.results, null, 2),
        );

        for (const r of result.results) {
            expect(r.caretInContent).toBe(true);
            expect(r.caretInCursorLayer).toBe(false);
            expect(r.posAtCoords).not.toBeNull();
        }
    });

    it('mouseover fires on first line content', async function () {
        this.timeout(20000);
        await setupEditor('Mari.\nThis is Mari.', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(() => {
            const w = window as unknown as Record<string, unknown>;
            w.__mouseoverTargets = [] as unknown[];

            const editor = document.querySelector('.cm-editor');
            if (!editor) return;

            editor.addEventListener('mouseover', (e: Event) => {
                const el = (e as MouseEvent).target as HTMLElement;
                (w.__mouseoverTargets as unknown[]).push({
                    tagName: el.tagName,
                    className: el.className,
                    isContent: !!el.closest('.cm-content'),
                    textSnippet: el.textContent?.substring(0, 15) ?? '',
                });
            });
        });

        const firstLine = await browser.$('.cm-line');
        const loc = await firstLine.getLocation();
        const size = await firstLine.getSize();

        await browser.performActions([
            {
                type: 'pointer',
                id: 'mouse1',
                parameters: { pointerType: 'mouse' },
                actions: [
                    {
                        type: 'pointerMove',
                        duration: 0,
                        x: Math.round(loc.x - 50),
                        y: Math.round(loc.y - 20),
                    },
                    { type: 'pause', duration: 50 },
                    {
                        type: 'pointerMove',
                        duration: 200,
                        x: Math.round(loc.x + 15),
                        y: Math.round(loc.y + size.height / 2),
                    },
                ],
            },
        ]);
        await browser.pause(300);

        const targets = (await browser.executeObsidian(() => {
            const w = window as unknown as Record<string, unknown>;
            const result = w.__mouseoverTargets;
            delete w.__mouseoverTargets;
            return result;
        })) as Array<{
            tagName: string;
            className: string;
            isContent: boolean;
            textSnippet: string;
        }>;

        console.log('[#170 mouseover]', JSON.stringify(targets, null, 2));
        expect(targets.length).toBeGreaterThan(0);

        const contentTargets = targets.filter((t) => t.isContent);
        expect(contentTargets.length).toBeGreaterThan(0);
    });

    it('hoverTooltip callback should fire at cursor position', async function () {
        this.timeout(20000);
        await setupEditor('hello world test', { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const installed = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const editorView = (view.editor as unknown as { cm: unknown })
                    .cm as import('@codemirror/view').EditorView;
                if (!editorView) return false;

                (window as unknown as Record<string, unknown>).__hoverTestHit =
                    false;

                const { hoverTooltip } =
                    require('@codemirror/view') as typeof import('@codemirror/view');
                const { StateEffect } =
                    require('@codemirror/state') as typeof import('@codemirror/state');

                const ext = hoverTooltip(
                    (_view, pos) => {
                        (
                            window as unknown as Record<string, unknown>
                        ).__hoverTestHit = true;
                        return null;
                    },
                    { hoverTime: 50 },
                );

                editorView.dispatch({
                    effects: StateEffect.appendConfig.of(ext),
                });
                return true;
            },
        )) as boolean;

        expect(installed).toBe(true);

        const contentEl = await browser.$('.cm-content');
        const loc = await contentEl.getLocation();

        await browser.performActions([
            {
                type: 'pointer',
                id: 'mouse1',
                parameters: { pointerType: 'mouse' },
                actions: [
                    {
                        type: 'pointerMove',
                        duration: 0,
                        x: Math.round(loc.x + 20),
                        y: Math.round(loc.y + 10),
                    },
                ],
            },
        ]);
        await browser.pause(500);

        const hit = (await browser.executeObsidian(() => {
            const result = (window as unknown as Record<string, unknown>)
                .__hoverTestHit;
            delete (window as unknown as Record<string, unknown>)
                .__hoverTestHit;
            return result;
        })) as boolean;

        expect(hit).toBe(true);
    });
});
