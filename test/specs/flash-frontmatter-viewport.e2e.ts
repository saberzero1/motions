/**
 * Regression test for Issue #114: Flash f/F/t/T labels missing from the
 * top half of the viewport when frontmatter properties are scrolled
 * off-screen in Live Preview mode.
 *
 * The root cause was getVisibleRange() using lineBlockAtHeight() which
 * produces incorrect document ranges when collapsed frontmatter widgets
 * have estimated heights that differ from their actual rendered height.
 * coordsAtPos() then returns null for targets near the viewport top,
 * causing filterVisibleTargets() to drop them.
 *
 * @see https://github.com/saberzero1/motions/issues/114
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    ensureLivePreview,
    sendVimEscape,
    PAUSE,
} from '../helpers';

const FRONTMATTER_PROPS = Array.from(
    { length: 15 },
    (_, i) => `prop${i + 1}: value${i + 1}`,
);

const BODY_LINES = Array.from(
    { length: 60 },
    (_, i) => `a]line ${i + 1} has alpha characters and more a letters aa`,
);

const CONTENT = ['---', ...FRONTMATTER_PROPS, '---', '', ...BODY_LINES].join(
    '\n',
);

function ensureFlashEnabled(enabled: boolean): Promise<void> {
    return browser.executeObsidian(({ app }, val: boolean) => {
        const plugin = (app as unknown as Record<string, unknown>).plugins as
            | Record<string, unknown>
            | undefined;
        const internal = (plugin?.plugins as Record<string, unknown>)?.[
            'vim-motions'
        ] as { settings: Record<string, unknown> } | undefined;
        if (internal?.settings) {
            internal.settings.enableFlash = val;
            internal.settings.flashMultiLine = true;
        }
    }, enabled) as unknown as Promise<void>;
}

function getFlashLabelCount(): Promise<number> {
    return browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-easymotion-label')
            .length;
    }) as unknown as Promise<number>;
}

interface LabelPosition {
    top: number;
    left: number;
}

function getFlashLabelPositions(): Promise<LabelPosition[]> {
    return browser.executeObsidian(() => {
        const labels = document.querySelectorAll(
            '.vim-motions-easymotion-label',
        );
        return Array.from(labels).map((el) => {
            const rect = el.getBoundingClientRect();
            return { top: rect.top, left: rect.left };
        });
    }) as unknown as Promise<LabelPosition[]>;
}

function getViewportHeight(): Promise<number> {
    return browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            | { scrollDOM: HTMLElement }
            | undefined;
        return cm6?.scrollDOM.clientHeight ?? 0;
    }) as unknown as Promise<number>;
}

function getViewportTop(): Promise<number> {
    return browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            | { scrollDOM: HTMLElement }
            | undefined;
        return cm6?.scrollDOM.getBoundingClientRect().top ?? 0;
    }) as unknown as Promise<number>;
}

describe('Flash labels with frontmatter scrolled off-screen (Issue #114)', function () {
    before(async function () {
        this.timeout(120000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureFlashEnabled(true);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await ensureLivePreview();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('flash labels should appear in the top half of the viewport', async function () {
        await setupEditor(CONTENT, { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await ensureLivePreview();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Scroll down past the frontmatter and position cursor near the
        // top of the now-visible body text.
        const bodyStartLine = FRONTMATTER_PROPS.length + 3; // after ---, props, ---, blank
        await browser.executeObsidian(({ app, obsidian }, line: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(line, 0);
            view.editor.scrollIntoView(
                {
                    from: { line, ch: 0 },
                    to: { line: line + 30, ch: 0 },
                },
                true,
            );
        }, bodyStartLine);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        // Move cursor to the body start line (should be near viewport top)
        await browser.executeObsidian(({ app, obsidian }, line: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(line, 0);
            view.editor.focus();
        }, bodyStartLine);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Trigger flash f with 'a' — the body lines are full of 'a' chars
        await browser.keys(['f', 'a']);
        await browser.pause(300);

        const labelCount = await getFlashLabelCount();
        expect(labelCount).toBeGreaterThanOrEqual(2);

        const positions = await getFlashLabelPositions();
        const vpHeight = await getViewportHeight();
        const vpTop = await getViewportTop();

        // Calculate which labels fall in the top half of the viewport
        const vpMidpoint = vpTop + vpHeight / 2;
        const labelsInTopHalf = positions.filter((p) => p.top < vpMidpoint);
        const labelsInBottomHalf = positions.filter((p) => p.top >= vpMidpoint);

        // The bug caused ALL labels to appear only in the bottom half.
        // With the fix, labels should appear in both halves since 'a'
        // appears on every body line.
        expect(labelsInTopHalf.length).toBeGreaterThan(0);

        // Sanity: labels should span a reasonable portion of the viewport
        // (not be clustered in just one half)
        expect(labelsInBottomHalf.length).toBeGreaterThan(0);
    });
});
