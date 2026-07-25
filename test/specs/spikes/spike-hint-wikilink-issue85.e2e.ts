import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE, setupEditor, sendVimEscape } from '../../helpers';

/**
 * Spike: Issue #85 — Hint mode wikilink regression investigation
 *
 * After the initial fix in 0.82.0 (commit 8ced0f5), users report:
 *
 * 1. Live Preview: hint labels appear on wikilinks but typing the label
 *    auto-exits hint mode without navigating (nothing happens).
 * 2. Source mode: no hint labels appear on wikilinks at all (`.cm-underline`
 *    spans are only rendered in Live Preview, not in source mode where
 *    wikilinks are plain `[[text]]`).
 * 3. Reading view: works fine (links are `<a>` elements with proper hrefs).
 *
 * This spike investigates the root cause by probing:
 * - Whether `.cm-underline` spans exist in Live Preview vs Source mode
 * - Whether `posAtDOM()` correctly maps `.cm-underline` to raw text positions
 * - Whether `findLinkAtCursor()` finds a link at the resolved position
 * - Whether the full hint activation flow works end-to-end
 *
 * @see https://github.com/saberzero1/motions/issues/85#issuecomment-5078089914
 */

function triggerHintModeViaCommand(): Promise<void> {
    return browser.executeObsidian(({ app }) => {
        (
            app as unknown as {
                commands: {
                    executeCommandById: (id: string) => boolean;
                };
            }
        ).commands.executeCommandById('vim-motions:show-hint-labels');
    }) as Promise<void>;
}

function getActiveFilePath(): Promise<string> {
    return browser.executeObsidian(({ app }) => {
        return app.workspace.getActiveFile()?.path ?? '';
    }) as Promise<string>;
}

async function isLivePreview(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source !== true;
    })) as boolean;
}

async function ensureLivePreview(): Promise<void> {
    const isLP = await isLivePreview();
    if (!isLP) {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.getState();
            state.mode = 'source';
            state.source = false;
            view.setState(state, { history: false });
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
    }
}

async function ensureSourceMode(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = true;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function isSourceMode(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source === true;
    })) as boolean;
}

interface DomProbeResult {
    mode: string;
    underlineCount: number;
    underlineTexts: string[];
    anchorCount: number;
    dataHrefCount: number;
    cmLinkCount: number;
    internalLinkCount: number;
}

async function probeLinkDomElements(
    textMatch: string,
): Promise<DomProbeResult> {
    return (await browser.executeObsidian(({ app, obsidian }, text: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                mode: 'unknown',
                underlineCount: 0,
                underlineTexts: [],
                anchorCount: 0,
                dataHrefCount: 0,
                cmLinkCount: 0,
                internalLinkCount: 0,
            };

        const state = view.getState();
        const mode =
            state.source === true
                ? 'source'
                : state.mode === 'source'
                  ? 'live-preview'
                  : state.mode;

        const container = (view as unknown as { contentEl: HTMLElement })
            .contentEl;

        const underlines = Array.from(
            container.querySelectorAll('.cm-underline'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const underlineTexts = underlines.map((el) =>
            (el.textContent ?? '').slice(0, 100),
        );

        const anchors = Array.from(
            container.querySelectorAll('a[href]'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const dataHrefs = Array.from(
            container.querySelectorAll('[data-href]'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const cmLinks = Array.from(
            container.querySelectorAll('.cm-link, .cm-hmd-internal-link'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const internalLinks = Array.from(
            container.querySelectorAll('.internal-link'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        return {
            mode,
            underlineCount: underlines.length,
            underlineTexts,
            anchorCount: anchors.length,
            dataHrefCount: dataHrefs.length,
            cmLinkCount: cmLinks.length,
            internalLinkCount: internalLinks.length,
        };
    }, textMatch)) as DomProbeResult;
}

interface PosAtDomResult {
    success: boolean;
    pos?: number;
    ch?: number;
    lineText?: string;
    textContent?: string;
    className?: string;
    error?: string;
}

async function probePosAtDom(): Promise<PosAtDomResult[]> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const mdView = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!mdView) return [{ success: false, error: 'no MarkdownView' }];

        // Access EditorView via Obsidian's editor.cm path (same as test/helpers.ts)
        const editorCm = (mdView.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown> | undefined;
        if (!editorCm) return [{ success: false, error: 'no editor.cm' }];
        const editorView = editorCm as unknown as {
            posAtDOM: Function;
            state: { doc: { lineAt: Function } };
            dom: Element;
        };
        if (!editorView.posAtDOM)
            return [{ success: false, error: 'editorView has no posAtDOM' }];

        const cmEditor =
            editorView.dom?.closest('.cm-editor') ??
            (
                mdView as unknown as { contentEl: HTMLElement }
            ).contentEl.querySelector('.cm-editor');
        if (!cmEditor) return [{ success: false, error: 'no cm-editor' }];

        // Try .cm-underline first, fall back to .cm-hmd-internal-link
        let linkElements = Array.from(
            cmEditor.querySelectorAll('.cm-underline'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        if (linkElements.length === 0) {
            linkElements = Array.from(
                cmEditor.querySelectorAll('.cm-hmd-internal-link'),
            ).filter((el) => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
        }

        if (linkElements.length === 0) {
            return [{ success: false, error: 'no visible link elements' }];
        }

        return linkElements.map((el) => {
            try {
                const pos = editorView.posAtDOM(el, 0);
                const line = editorView.state.doc.lineAt(pos);
                const ch = pos - line.from;
                return {
                    success: true,
                    pos,
                    ch,
                    lineText: line.text,
                    textContent: (el.textContent ?? '').slice(0, 100),
                    className: (el as HTMLElement).className,
                };
            } catch (e) {
                return {
                    success: false,
                    error: (e as Error).message,
                    textContent: (el.textContent ?? '').slice(0, 100),
                };
            }
        });
    })) as PosAtDomResult[];
}

interface LinkResolutionResult {
    underlineText: string;
    pos: number;
    ch: number;
    lineText: string;
    linkFound: boolean;
    linkTarget?: string;
    linkStart?: number;
    linkEnd?: number;
    isExternal?: boolean;
    chInsideLinkBrackets?: boolean;
    className?: string;
    error?: string;
}

async function probeLinkResolution(): Promise<
    LinkResolutionResult[] | { error: string }
> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const mdView = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!mdView) return { error: 'no MarkdownView' };

        const editorCm = (mdView.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown> | undefined;
        if (!editorCm) return { error: 'no editor.cm' };
        const editorView = editorCm as unknown as {
            posAtDOM: Function;
            state: { doc: { lineAt: Function } };
            dom: Element;
        };
        if (!editorView.posAtDOM)
            return { error: 'editorView has no posAtDOM' };

        const cmEditor =
            editorView.dom?.closest('.cm-editor') ??
            (
                mdView as unknown as { contentEl: HTMLElement }
            ).contentEl.querySelector('.cm-editor');
        if (!cmEditor) return { error: 'no cm-editor' };

        let linkElements = Array.from(
            cmEditor.querySelectorAll('.cm-underline'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        if (linkElements.length === 0) {
            linkElements = Array.from(
                cmEditor.querySelectorAll('.cm-hmd-internal-link'),
            ).filter((el) => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
        }

        if (linkElements.length === 0) {
            return {
                error: 'no visible link elements (.cm-underline or .cm-hmd-internal-link)',
            };
        }

        // Inline the link-finding logic from goto-definition.ts
        const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
        const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
        const BARE_URL_RE = /https?:\/\/[^\s)>\]]+/g;

        function findLinksOnLine(lineText: string) {
            const results: Array<{
                start: number;
                end: number;
                target: string;
                isExternal: boolean;
            }> = [];

            let match: RegExpExecArray | null;
            const wikiRe = new RegExp(WIKILINK_RE.source, 'g');
            while ((match = wikiRe.exec(lineText)) !== null) {
                const target = match[1]?.split('|')[0];
                if (target) {
                    results.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        target,
                        isExternal: false,
                    });
                }
            }

            const mdRe = new RegExp(MD_LINK_RE.source, 'g');
            while ((match = mdRe.exec(lineText)) !== null) {
                const url = match[2];
                if (url) {
                    results.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        target: url,
                        isExternal: /^https?:\/\//.test(url),
                    });
                }
            }

            const bareRe = new RegExp(BARE_URL_RE.source, 'g');
            while ((match = bareRe.exec(lineText)) !== null) {
                const alreadyCovered = results.some(
                    (r) => match!.index >= r.start && match!.index < r.end,
                );
                if (!alreadyCovered) {
                    results.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        target: match[0],
                        isExternal: true,
                    });
                }
            }

            return results.sort((a, b) => a.start - b.start);
        }

        return linkElements.map((el) => {
            try {
                const pos = editorView.posAtDOM(el, 0);
                const line = editorView.state.doc.lineAt(pos);
                const ch = pos - line.from;

                const links = findLinksOnLine(line.text);
                const linkAtCh = links.find((l) => ch >= l.start && ch < l.end);

                return {
                    underlineText: (el.textContent ?? '').slice(0, 100),
                    pos,
                    ch,
                    lineText: line.text,
                    linkFound: !!linkAtCh,
                    linkTarget: linkAtCh?.target,
                    linkStart: linkAtCh?.start,
                    linkEnd: linkAtCh?.end,
                    isExternal: linkAtCh?.isExternal,
                    chInsideLinkBrackets: linkAtCh
                        ? ch >= linkAtCh.start && ch < linkAtCh.end
                        : false,
                    className: (el as HTMLElement).className,
                };
            } catch (e) {
                return {
                    underlineText: (el.textContent ?? '').slice(0, 100),
                    pos: -1,
                    ch: -1,
                    lineText: '',
                    linkFound: false,
                    error: (e as Error).message,
                };
            }
        });
    })) as LinkResolutionResult[] | { error: string };
}

interface HintActivationResult {
    overlayCreated: boolean;
    hintCount: number;
    wikilinksWithHints: Array<{
        underlineText: string;
        closestLabel: string;
        closestDist: number;
    }>;
}

async function probeHintOverlayForWikilinks(): Promise<HintActivationResult> {
    return (await browser.executeObsidian(() => {
        const overlay = activeDocument.querySelector(
            '.vim-motions-hint-overlay',
        );
        if (!overlay)
            return {
                overlayCreated: false,
                hintCount: 0,
                wikilinksWithHints: [],
            };

        const labels = Array.from(
            overlay.querySelectorAll('.vim-motions-hint-label'),
        ) as HTMLElement[];
        const cmEditor = activeDocument.querySelector('.cm-editor');
        if (!cmEditor)
            return {
                overlayCreated: true,
                hintCount: labels.length,
                wikilinksWithHints: [],
            };

        const underlines = Array.from(
            cmEditor.querySelectorAll('.cm-underline'),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const results = underlines.map((el) => {
            const targetRect = el.getBoundingClientRect();
            const targetLeft = targetRect.left + activeWindow.scrollX;
            const targetTop = targetRect.top + activeWindow.scrollY;

            let closestLabel = '';
            let closestDist = Infinity;
            for (const labelEl of labels) {
                const left = Number.parseFloat(
                    labelEl.style.getPropertyValue('--vim-motions-hint-left'),
                );
                const top = Number.parseFloat(
                    labelEl.style.getPropertyValue('--vim-motions-hint-top'),
                );
                if (Number.isNaN(left) || Number.isNaN(top)) continue;
                const dist = Math.hypot(left - targetLeft, top - targetTop);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestLabel = labelEl.textContent ?? '';
                }
            }

            return {
                underlineText: (el.textContent ?? '').slice(0, 100),
                closestLabel,
                closestDist,
            };
        });

        return {
            overlayCreated: true,
            hintCount: labels.length,
            wikilinksWithHints: results,
        };
    })) as HintActivationResult;
}

async function typeHintLabel(label: string): Promise<void> {
    for (const ch of label) {
        await browser.keys([ch]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Spike: Issue #85 — Hint mode wikilink regression', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    afterEach(async function () {
        await browser.executeObsidian(() => {
            activeDocument
                .querySelectorAll('.vim-motions-hint-overlay')
                .forEach((el) => el.remove());
        });
        await browser.pause(100);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    // ─── Section 1: Live Preview DOM probe ─────────────────────────────

    describe('Live Preview — DOM element discovery', function () {
        before(async function () {
            await ensureLivePreview();
        });

        it('should confirm we are in Live Preview mode', async function () {
            expect(await isLivePreview()).toBe(true);
        });

        it('should have .cm-underline spans for wikilinks in Live Preview', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const probe = await probeLinkDomElements('Target');
            console.log(
                '[SPIKE #85] Live Preview DOM probe:',
                JSON.stringify(probe, null, 2),
            );

            // Key diagnostic: do .cm-underline spans exist?
            expect(probe.mode).toBe('live-preview');
            // This is the critical assertion — if this fails, the issue is
            // that Live Preview doesn't create .cm-underline for wikilinks
            console.log(
                `[SPIKE #85] .cm-underline count: ${probe.underlineCount}`,
            );
            console.log(
                `[SPIKE #85] .cm-underline texts: ${JSON.stringify(probe.underlineTexts)}`,
            );
        });

        it('should dump full DOM hierarchy for wikilink elements', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const hierarchy = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    const cmEditor = container.querySelector('.cm-editor');
                    if (!cmEditor) return { error: 'no cm-editor' };

                    const cmLines = Array.from(
                        cmEditor.querySelectorAll('.cm-line'),
                    );
                    const firstLine = cmLines[0];
                    if (!firstLine) return { error: 'no cm-line' };

                    function dumpElement(el: Element, depth: number): unknown {
                        const rect = el.getBoundingClientRect();
                        return {
                            tag: el.tagName,
                            class: el.className,
                            text: (el.textContent ?? '').slice(0, 50),
                            visible: rect.width > 0 && rect.height > 0,
                            rect: {
                                w: Math.round(rect.width),
                                h: Math.round(rect.height),
                            },
                            hasHref: el.hasAttribute('href'),
                            hasDataHref: el.hasAttribute('data-href'),
                            children:
                                depth < 4
                                    ? Array.from(el.children).map((c) =>
                                          dumpElement(c, depth + 1),
                                      )
                                    : `[${el.children.length} children]`,
                        };
                    }

                    return dumpElement(firstLine, 0);
                },
            );
            console.log(
                '[SPIKE #85] Live Preview wikilink DOM hierarchy:',
                JSON.stringify(hierarchy, null, 2),
            );
        });

        it('should have .cm-underline spans for aliased wikilinks', async function () {
            await setupEditor('[[Target|My Alias]]\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const probe = await probeLinkDomElements('My Alias');
            console.log(
                '[SPIKE #85] Live Preview aliased wikilink DOM probe:',
                JSON.stringify(probe, null, 2),
            );

            console.log(
                `[SPIKE #85] Aliased wikilink .cm-underline count: ${probe.underlineCount}`,
            );
            console.log(
                `[SPIKE #85] Aliased wikilink .cm-underline texts: ${JSON.stringify(probe.underlineTexts)}`,
            );
        });
    });

    // ─── Section 2: Source Mode DOM probe ──────────────────────────────

    describe('Source mode — DOM element discovery', function () {
        before(async function () {
            await ensureSourceMode();
        });

        it('should confirm we are in Source mode', async function () {
            expect(await isSourceMode()).toBe(true);
        });

        it('should probe whether .cm-underline spans exist for wikilinks in Source mode', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const probe = await probeLinkDomElements('Target');
            console.log(
                '[SPIKE #85] Source mode DOM probe:',
                JSON.stringify(probe, null, 2),
            );

            // Key diagnostic: .cm-underline should NOT exist in source mode
            // This explains why no hint labels appear in source mode
            console.log(
                `[SPIKE #85] Source mode .cm-underline count: ${probe.underlineCount} (expected: 0)`,
            );
            console.log(
                `[SPIKE #85] Source mode .cm-hmd-internal-link count: ${probe.cmLinkCount}`,
            );
            // In source mode, wikilinks are rendered via .cm-hmd-internal-link
            // but NOT .cm-underline, so the TARGET_SELECTOR misses them entirely
        });
    });

    // ─── Section 3: Live Preview posAtDOM mapping ──────────────────────

    describe('Live Preview — posAtDOM mapping accuracy', function () {
        before(async function () {
            await ensureLivePreview();
        });

        it('should probe posAtDOM mapping for plain wikilink', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const results = await probePosAtDom();
            console.log(
                '[SPIKE #85] posAtDOM for [[Target]]:',
                JSON.stringify(results, null, 2),
            );

            // Key question: does posAtDOM return a position within the
            // raw [[Target]] text, or does it map to a widget/decoration offset?
            for (const r of results) {
                if (r.success) {
                    console.log(
                        `[SPIKE #85] pos=${r.pos}, ch=${r.ch}, lineText="${r.lineText}", underlineText="${r.textContent}"`,
                    );
                    console.log(
                        `[SPIKE #85] Raw text at ch=${r.ch}: "${r.lineText?.charAt(r.ch ?? 0)}"`,
                    );
                } else {
                    console.log(`[SPIKE #85] posAtDOM FAILED: ${r.error}`);
                }
            }
        });

        it('should probe posAtDOM mapping for aliased wikilink', async function () {
            await setupEditor('[[Target|My Alias]]\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const results = await probePosAtDom();
            console.log(
                '[SPIKE #85] posAtDOM for [[Target|My Alias]]:',
                JSON.stringify(results, null, 2),
            );

            for (const r of results) {
                if (r.success) {
                    console.log(
                        `[SPIKE #85] Aliased: pos=${r.pos}, ch=${r.ch}, lineText="${r.lineText}", underlineText="${r.textContent}"`,
                    );
                }
            }
        });

        it('should probe posAtDOM mapping for inline wikilink in paragraph', async function () {
            await setupEditor(
                'Some text with a [[Target]] link in the middle.\n\nMore text.',
                { line: 0, ch: 0 },
            );
            await browser.pause(500);

            const results = await probePosAtDom();
            console.log(
                '[SPIKE #85] posAtDOM for inline [[Target]]:',
                JSON.stringify(results, null, 2),
            );

            for (const r of results) {
                if (r.success) {
                    console.log(
                        `[SPIKE #85] Inline: pos=${r.pos}, ch=${r.ch}, lineText="${r.lineText}", underlineText="${r.textContent}"`,
                    );
                    // In Live Preview, the line text should be the raw markdown:
                    // "Some text with a [[Target]] link in the middle."
                    // The ch should land inside the [[ ]] brackets for findLinkAtCursor to work
                    const rawText = r.lineText ?? '';
                    const bracketStart = rawText.indexOf('[[');
                    const bracketEnd = rawText.indexOf(']]') + 2;
                    const chVal = r.ch ?? -1;
                    console.log(
                        `[SPIKE #85] Brackets at [${bracketStart}, ${bracketEnd}), ch=${chVal}, inside=${chVal >= bracketStart && chVal < bracketEnd}`,
                    );
                }
            }
        });
    });

    // ─── Section 4: Link resolution (findLinkAtCursor) ─────────────────

    describe('Live Preview — findLinkAtCursor resolution', function () {
        before(async function () {
            await ensureLivePreview();
        });

        it('should probe link resolution for plain wikilink', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const result = await probeLinkResolution();
            console.log(
                '[SPIKE #85] Link resolution for [[Target]]:',
                JSON.stringify(result, null, 2),
            );

            if (!('error' in result)) {
                for (const r of result) {
                    console.log(
                        `[SPIKE #85] underline="${r.underlineText}", linkFound=${r.linkFound}, target="${r.linkTarget}", ch=${r.ch}, lineText="${r.lineText}"`,
                    );
                    if (!r.linkFound) {
                        console.log(
                            '[SPIKE #85] BUG CONFIRMED: posAtDOM maps to ch that is outside the link bracket range',
                        );
                        console.log(
                            `[SPIKE #85] ch=${r.ch} but link brackets are at different positions in: "${r.lineText}"`,
                        );
                    }
                }
            } else {
                console.log(
                    `[SPIKE #85] Link resolution error: ${result.error}`,
                );
            }
        });

        it('should probe link resolution for aliased wikilink', async function () {
            await setupEditor('[[Target|My Alias]]\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const result = await probeLinkResolution();
            console.log(
                '[SPIKE #85] Link resolution for [[Target|My Alias]]:',
                JSON.stringify(result, null, 2),
            );

            if (!('error' in result)) {
                for (const r of result) {
                    console.log(
                        `[SPIKE #85] Aliased: underline="${r.underlineText}", linkFound=${r.linkFound}, target="${r.linkTarget}"`,
                    );
                }
            }
        });

        it('should probe link resolution for multiple wikilinks on same line', async function () {
            await setupEditor(
                'See [[Alpha]] and [[Beta]] for details.\n\nMore text.',
                { line: 0, ch: 0 },
            );
            await browser.pause(500);

            const result = await probeLinkResolution();
            console.log(
                '[SPIKE #85] Link resolution for multiple wikilinks:',
                JSON.stringify(result, null, 2),
            );

            if (!('error' in result)) {
                for (const r of result) {
                    console.log(
                        `[SPIKE #85] Multi: underline="${r.underlineText}", linkFound=${r.linkFound}, target="${r.linkTarget}", ch=${r.ch}`,
                    );
                }
            }
        });
    });

    // ─── Section 5: End-to-end hint activation in Live Preview ─────────

    describe('Live Preview — end-to-end hint activation', function () {
        before(async function () {
            await ensureLivePreview();
        });

        it('should show hint labels on wikilinks and activate on selection', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const beforeFile = await getActiveFilePath();
            expect(beforeFile).toBe('Welcome.md');

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintProbe = await probeHintOverlayForWikilinks();
            console.log(
                '[SPIKE #85] Hint overlay probe:',
                JSON.stringify(hintProbe, null, 2),
            );

            expect(hintProbe.overlayCreated).toBe(true);

            if (hintProbe.wikilinksWithHints.length === 0) {
                console.log(
                    '[SPIKE #85] No wikilink hints found — may be a target discovery issue',
                );
                await browser.keys(['Escape']);
                return;
            }

            const wikiHint = hintProbe.wikilinksWithHints[0];
            if (!wikiHint || wikiHint.closestDist > 50) {
                console.log('[SPIKE #85] No close hint label for wikilink');
                await browser.keys(['Escape']);
                return;
            }

            console.log(
                `[SPIKE #85] Typing hint label: "${wikiHint.closestLabel}" for underline: "${wikiHint.underlineText}"`,
            );
            await typeHintLabel(wikiHint.closestLabel);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterFile = await getActiveFilePath();
            console.log(
                `[SPIKE #85] Navigation result: ${beforeFile} -> ${afterFile}`,
            );

            if (afterFile === 'Welcome.md') {
                console.log(
                    '[SPIKE #85] BUG CONFIRMED: hint label typed but no navigation occurred',
                );
                console.log(
                    '[SPIKE #85] The hint mode auto-exited without activating the link',
                );
            } else {
                console.log(
                    `[SPIKE #85] Navigation succeeded to: ${afterFile}`,
                );
            }

            // This is the key assertion — if this fails, the bug is confirmed
            expect(afterFile).toBe('Target.md');
        });

        it('should show hint labels on aliased wikilinks and navigate correctly', async function () {
            await setupEditor('[[Target|Click Here]]\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintProbe = await probeHintOverlayForWikilinks();
            console.log(
                '[SPIKE #85] Aliased wikilink hint probe:',
                JSON.stringify(hintProbe, null, 2),
            );

            if (hintProbe.wikilinksWithHints.length === 0) {
                console.log('[SPIKE #85] No hints for aliased wikilink');
                await browser.keys(['Escape']);
                return;
            }

            const wikiHint = hintProbe.wikilinksWithHints[0];
            if (!wikiHint || wikiHint.closestDist > 50) {
                await browser.keys(['Escape']);
                return;
            }

            console.log(
                `[SPIKE #85] Aliased: typing hint label "${wikiHint.closestLabel}"`,
            );
            await typeHintLabel(wikiHint.closestLabel);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterFile = await getActiveFilePath();
            console.log(
                `[SPIKE #85] Aliased navigation result: -> ${afterFile}`,
            );

            if (afterFile === 'Welcome.md') {
                console.log(
                    '[SPIKE #85] BUG CONFIRMED: aliased wikilink hint did not navigate',
                );
            }

            expect(afterFile).toBe('Target.md');
        });
    });

    // ─── Section 6: Source Mode — hint label generation ────────────────

    describe('Source mode — hint target discovery', function () {
        before(async function () {
            await ensureSourceMode();
        });

        it('should probe whether hint mode discovers wikilinks in Source mode', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            expect(await isSourceMode()).toBe(true);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintProbe = await probeHintOverlayForWikilinks();
            console.log(
                '[SPIKE #85] Source mode hint overlay probe:',
                JSON.stringify(hintProbe, null, 2),
            );

            // Probe what DOM elements exist for the wikilink in source mode
            const domProbe = await probeLinkDomElements('Target');
            console.log(
                '[SPIKE #85] Source mode DOM during hints:',
                JSON.stringify(domProbe, null, 2),
            );

            if (hintProbe.wikilinksWithHints.length === 0) {
                console.log(
                    '[SPIKE #85] BUG CONFIRMED: no hint labels for wikilinks in source mode',
                );
                console.log(
                    '[SPIKE #85] ROOT CAUSE: .cm-underline does not exist in source mode',
                );
                console.log(
                    `[SPIKE #85] .cm-hmd-internal-link count: ${domProbe.cmLinkCount} (these are the source mode link spans)`,
                );
                console.log(
                    '[SPIKE #85] FIX NEEDED: Add .cm-hmd-internal-link to TARGET_SELECTOR',
                );
            }

            await browser.keys(['Escape']);
        });

        it('should list all CSS classes on wikilink elements in Source mode', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            const classes = await browser.executeObsidian(() => {
                const cmEditor = activeDocument.querySelector('.cm-editor');
                if (!cmEditor) return { error: 'no cm-editor' };

                // Find all elements that might be related to wikilinks
                const allSpans = Array.from(
                    cmEditor.querySelectorAll('.cm-line span'),
                );
                const linkSpans = allSpans.filter((span) => {
                    const text = span.textContent ?? '';
                    return (
                        text.includes('Target') ||
                        text.includes('[[') ||
                        text.includes(']]')
                    );
                });

                return linkSpans.map((span) => ({
                    text: (span.textContent ?? '').slice(0, 50),
                    className: span.className,
                    tagName: span.tagName,
                    hasHref: span.hasAttribute('href'),
                    hasDataHref: span.hasAttribute('data-href'),
                }));
            });

            console.log(
                '[SPIKE #85] Source mode wikilink CSS classes:',
                JSON.stringify(classes, null, 2),
            );
        });
    });

    // ─── Section 7: Reading view control (should work) ─────────────────

    describe('Reading view — control test (expected to work)', function () {
        it('should have proper <a> elements for wikilinks in reading view', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', { line: 0, ch: 0 });
            await browser.pause(500);

            // Switch to reading view
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'reading-root',
                    type: 'split',
                    children: [
                        {
                            id: 'reading-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'reading-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'preview',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'reading-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const domProbe = await probeLinkDomElements('');
            console.log(
                '[SPIKE #85] Reading view DOM probe:',
                JSON.stringify(domProbe, null, 2),
            );

            // Reading view should have proper <a> or [data-href] elements
            console.log(
                `[SPIKE #85] Reading view: anchors=${domProbe.anchorCount}, dataHref=${domProbe.dataHrefCount}, internalLink=${domProbe.internalLinkCount}`,
            );
            console.log(
                '[SPIKE #85] Reading view uses standard link elements — hint mode works via existing a[href] / [data-href] selectors',
            );

            await browser.keys(['Escape']);
        });
    });

    // ─── Section 8: Markdown link and bare URL DOM classes ─────────────

    describe('Live Preview — markdown link and bare URL DOM classes', function () {
        before(async function () {
            await ensureLivePreview();
        });

        it('should dump DOM hierarchy for markdown link with cursor on line', async function () {
            await setupEditor('[Go to target](Target)\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const hierarchy = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    const cmEditor = container.querySelector('.cm-editor');
                    if (!cmEditor) return { error: 'no cm-editor' };

                    const cmLines = Array.from(
                        cmEditor.querySelectorAll('.cm-line'),
                    );
                    const firstLine = cmLines[0];
                    if (!firstLine) return { error: 'no cm-line' };

                    function dumpElement(el: Element, depth: number): unknown {
                        const rect = el.getBoundingClientRect();
                        return {
                            tag: el.tagName,
                            class: el.className,
                            text: (el.textContent ?? '').slice(0, 50),
                            visible: rect.width > 0 && rect.height > 0,
                            rect: {
                                w: Math.round(rect.width),
                                h: Math.round(rect.height),
                            },
                            children:
                                depth < 4
                                    ? Array.from(el.children).map((c) =>
                                          dumpElement(c, depth + 1),
                                      )
                                    : `[${el.children.length} children]`,
                        };
                    }

                    return dumpElement(firstLine, 0);
                },
            );
            console.log(
                '[SPIKE #85] Markdown link DOM hierarchy (cursor on line):',
                JSON.stringify(hierarchy, null, 2),
            );
        });

        it('should dump DOM hierarchy for bare URL with cursor on line', async function () {
            await setupEditor('https://example.com\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const hierarchy = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    const cmEditor = container.querySelector('.cm-editor');
                    if (!cmEditor) return { error: 'no cm-editor' };

                    const cmLines = Array.from(
                        cmEditor.querySelectorAll('.cm-line'),
                    );
                    const firstLine = cmLines[0];
                    if (!firstLine) return { error: 'no cm-line' };

                    function dumpElement(el: Element, depth: number): unknown {
                        const rect = el.getBoundingClientRect();
                        return {
                            tag: el.tagName,
                            class: el.className,
                            text: (el.textContent ?? '').slice(0, 50),
                            visible: rect.width > 0 && rect.height > 0,
                            rect: {
                                w: Math.round(rect.width),
                                h: Math.round(rect.height),
                            },
                            children:
                                depth < 4
                                    ? Array.from(el.children).map((c) =>
                                          dumpElement(c, depth + 1),
                                      )
                                    : `[${el.children.length} children]`,
                        };
                    }

                    return dumpElement(firstLine, 0);
                },
            );
            console.log(
                '[SPIKE #85] Bare URL DOM hierarchy (cursor on line):',
                JSON.stringify(hierarchy, null, 2),
            );
        });

        it('should dump DOM hierarchy for external markdown link with cursor on line', async function () {
            await setupEditor(
                '[External](https://example.com)\n\nPlain text.',
                { line: 0, ch: 0 },
            );
            await browser.pause(500);

            const hierarchy = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const container = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    const cmEditor = container.querySelector('.cm-editor');
                    if (!cmEditor) return { error: 'no cm-editor' };

                    const cmLines = Array.from(
                        cmEditor.querySelectorAll('.cm-line'),
                    );
                    const firstLine = cmLines[0];
                    if (!firstLine) return { error: 'no cm-line' };

                    function dumpElement(el: Element, depth: number): unknown {
                        const rect = el.getBoundingClientRect();
                        return {
                            tag: el.tagName,
                            class: el.className,
                            text: (el.textContent ?? '').slice(0, 50),
                            visible: rect.width > 0 && rect.height > 0,
                            rect: {
                                w: Math.round(rect.width),
                                h: Math.round(rect.height),
                            },
                            children:
                                depth < 4
                                    ? Array.from(el.children).map((c) =>
                                          dumpElement(c, depth + 1),
                                      )
                                    : `[${el.children.length} children]`,
                        };
                    }

                    return dumpElement(firstLine, 0);
                },
            );
            console.log(
                '[SPIKE #85] External markdown link DOM hierarchy (cursor on line):',
                JSON.stringify(hierarchy, null, 2),
            );
        });
    });
});
