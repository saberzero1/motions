/**
 * Regression test for Issue #89: propertiesFoldObserver should only
 * dispatch scrollIntoView when the `is-collapsed` class actually toggles
 * on `.metadata-container`, not on arbitrary class mutations.
 *
 * Tests both synthetic class mutations (deterministic) and real Meta Bind
 * plugin interaction (end-to-end, matching the user-reported scenario).
 *
 * @see https://github.com/saberzero1/motions/issues/89
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { setupEditor, PAUSE, ensureLivePreview } from '../helpers.js';

const LONG_CONTENT = [
    '---',
    'title: Scroll Test',
    'tags: [regression]',
    '---',
    '',
    ...Array.from(
        { length: 80 },
        (_, i) => `Line ${i + 1}: Lorem ipsum dolor sit amet.`,
    ),
    '',
    '# Bottom Heading',
    '',
    'Final paragraph.',
].join('\n');

const LONG_CONTENT_WITH_SUMMARY = [
    '---',
    'Summary:',
    '---',
    '',
    ...Array.from(
        { length: 80 },
        (_, i) => `Line ${i + 1}: Lorem ipsum dolor sit amet.`,
    ),
    '',
    '# Bottom Heading',
    '',
    'Final paragraph.',
].join('\n');

const SCROLL_TOLERANCE = 5;
const SETTLE_MS = 300;

type CommandsApi = {
    commands: { executeCommandById: (id: string) => boolean };
};

async function prepareScrollTest(content = LONG_CONTENT): Promise<void> {
    await setupEditor(content, { line: 70, ch: 0 });
    await browser.pause(PAUSE.EDITOR_SETTLE);

    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            | { scrollDOM: HTMLElement }
            | undefined;
        if (cm6?.scrollDOM) cm6.scrollDOM.scrollTop = 0;
    });
    await browser.pause(SETTLE_MS);
}

async function getScrollTop(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return -1;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            | { scrollDOM: HTMLElement }
            | undefined;
        return cm6?.scrollDOM.scrollTop ?? -1;
    })) as number;
}

async function hasMetadataContainer(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            | { scrollDOM: HTMLElement }
            | undefined;
        const container =
            view.contentEl ?? cm6?.scrollDOM.closest('.workspace-leaf-content');
        return !!container?.querySelector('.metadata-container');
    })) as boolean;
}

describe('Properties fold observer scroll behavior (Issue #89)', function () {
    before(async function () {
        this.timeout(120000);
        await browser.reloadObsidian({
            vault: 'test-vault',
            plugins: ['vim-motions', 'obsidian-meta-bind-plugin'],
        });
        await browser.pause(5000);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
    });

    describe('synthetic class mutations must not cause scroll', function () {
        it('adding a non-fold class preserves scroll position', async function () {
            await prepareScrollTest();
            const before = await getScrollTop();
            expect(before).toBeGreaterThanOrEqual(0);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm6 = (view.editor as unknown as Record<string, unknown>)
                    .cm as { scrollDOM: HTMLElement } | undefined;
                const container =
                    view.contentEl ??
                    cm6?.scrollDOM.closest('.workspace-leaf-content');
                const metadata = container?.querySelector(
                    '.metadata-container',
                );
                if (metadata) metadata.classList.add('dummy-class');
            });
            await browser.pause(SETTLE_MS);

            const after = await getScrollTop();

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm6 = (view.editor as unknown as Record<string, unknown>)
                    .cm as { scrollDOM: HTMLElement } | undefined;
                const container =
                    view.contentEl ??
                    cm6?.scrollDOM.closest('.workspace-leaf-content');
                container
                    ?.querySelector('.metadata-container')
                    ?.classList.remove('dummy-class');
            });

            expect(Math.abs(after - before)).toBeLessThan(SCROLL_TOLERANCE);
        });

        it('no-op class re-assignment preserves scroll position', async function () {
            await prepareScrollTest();
            const before = await getScrollTop();
            expect(before).toBeGreaterThanOrEqual(0);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm6 = (view.editor as unknown as Record<string, unknown>)
                    .cm as { scrollDOM: HTMLElement } | undefined;
                const container =
                    view.contentEl ??
                    cm6?.scrollDOM.closest('.workspace-leaf-content');
                const metadata = container?.querySelector(
                    '.metadata-container',
                ) as HTMLElement | null;
                if (metadata) {
                    metadata.className = metadata.className;
                }
            });
            await browser.pause(SETTLE_MS);

            const after = await getScrollTop();
            expect(Math.abs(after - before)).toBeLessThan(SCROLL_TOLERANCE);
        });
    });

    describe('is-collapsed toggle must trigger scroll', function () {
        it('fold properties triggers scroll away from top', async function () {
            await prepareScrollTest();
            expect(await hasMetadataContainer()).toBe(true);

            const before = await getScrollTop();
            expect(before).toBeLessThan(SCROLL_TOLERANCE);

            await browser.executeObsidian(({ app }) => {
                (app as unknown as CommandsApi).commands.executeCommandById(
                    'editor:toggle-fold-properties',
                );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getScrollTop();
            expect(after).toBeGreaterThan(before);
        });

        it('unfold properties also triggers scroll', async function () {
            await prepareScrollTest();

            await browser.executeObsidian(({ app }) => {
                (app as unknown as CommandsApi).commands.executeCommandById(
                    'editor:toggle-fold-properties',
                );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm6 = (view.editor as unknown as Record<string, unknown>)
                    .cm as { scrollDOM: HTMLElement } | undefined;
                if (cm6?.scrollDOM) cm6.scrollDOM.scrollTop = 0;
            });
            await browser.pause(SETTLE_MS);

            const beforeUnfold = await getScrollTop();
            expect(beforeUnfold).toBeLessThan(SCROLL_TOLERANCE);

            await browser.executeObsidian(({ app }) => {
                (app as unknown as CommandsApi).commands.executeCommandById(
                    'editor:toggle-fold-properties',
                );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const afterUnfold = await getScrollTop();
            expect(afterUnfold).toBeGreaterThan(beforeUnfold);
        });
    });

    describe('Meta Bind integration (user-reported scenario)', function () {
        it('focusing a properties input does not cause scroll jump', async function () {
            await prepareScrollTest(LONG_CONTENT_WITH_SUMMARY);
            const before = await getScrollTop();
            expect(before).toBeLessThan(SCROLL_TOLERANCE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { found: false };
                    const container = view.contentEl;
                    const input = container?.querySelector(
                        '.metadata-container input,' +
                            '.metadata-container textarea',
                    ) as HTMLInputElement | HTMLTextAreaElement | null;
                    if (!input) return { found: false };
                    input.focus();
                    await new Promise((r) => setTimeout(r, 300));
                    return { found: true };
                },
            )) as { found: boolean };

            expect(result.found).toBe(true);
            const after = await getScrollTop();
            expect(Math.abs(after - before)).toBeLessThan(SCROLL_TOLERANCE);
        });

        it('typing in a properties input does not cause scroll jump', async function () {
            await prepareScrollTest(LONG_CONTENT_WITH_SUMMARY);
            const before = await getScrollTop();
            expect(before).toBeLessThan(SCROLL_TOLERANCE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { found: false };
                    const container = view.contentEl;
                    const input = container?.querySelector(
                        '.metadata-container input,' +
                            '.metadata-container textarea',
                    ) as HTMLInputElement | HTMLTextAreaElement | null;
                    if (!input) return { found: false };
                    input.focus();
                    await new Promise((r) => setTimeout(r, 200));
                    input.value = 'test summary text';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise((r) => setTimeout(r, 300));
                    return { found: true };
                },
            )) as { found: boolean };

            expect(result.found).toBe(true);
            const after = await getScrollTop();
            expect(Math.abs(after - before)).toBeLessThan(SCROLL_TOLERANCE);
        });

        it('blurring a properties input does not cause scroll jump', async function () {
            await prepareScrollTest(LONG_CONTENT_WITH_SUMMARY);
            const before = await getScrollTop();
            expect(before).toBeLessThan(SCROLL_TOLERANCE);

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { found: false };
                    const container = view.contentEl;
                    const input = container?.querySelector(
                        '.metadata-container input,' +
                            '.metadata-container textarea',
                    ) as HTMLInputElement | HTMLTextAreaElement | null;
                    if (!input) return { found: false };
                    input.focus();
                    await new Promise((r) => setTimeout(r, 200));
                    input.value = 'blur test';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise((r) => setTimeout(r, 200));
                    input.blur();
                    await new Promise((r) => setTimeout(r, 300));
                    return { found: true };
                },
            )) as { found: boolean };

            expect(result.found).toBe(true);
            const after = await getScrollTop();
            expect(Math.abs(after - before)).toBeLessThan(SCROLL_TOLERANCE);
        });
    });
});
