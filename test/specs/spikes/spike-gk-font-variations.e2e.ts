import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, PAUSE } from '../../helpers';

/**
 * Spike: gk/gj behavior under varying font sizes, line heights, and editor widths.
 *
 * The findPosV clamp depends on CM6's moveVertically pixel math. Different
 * CSS configurations change line heights and wrapping, which may cause
 * moveVertically to produce unexpected jumps. This spike injects CSS
 * overrides to simulate theme variations and checks that gk never skips
 * document lines.
 */

const LONG_LINE =
    'This is a deliberately long line of text that should wrap multiple times in the editor to create several visual display lines from a single document line in the buffer.';

const TEST_CONTENT = [LONG_LINE, '### Heading', LONG_LINE].join('\n');

async function injectCSS(css: string): Promise<string> {
    return (await browser.executeObsidian((_ctx, cssText: string) => {
        const el = document.createElement('style');
        el.id = 'spike-gk-override-' + Date.now();
        el.textContent = cssText;
        document.head.appendChild(el);
        return el.id;
    }, css)) as string;
}

async function removeCSS(id: string): Promise<void> {
    await browser.executeObsidian((_ctx, elId: string) => {
        document.getElementById(elId)?.remove();
    }, id);
}

async function assertGkNoSkip(content: string, label: string): Promise<void> {
    const lines = content.split('\n');
    const lastLine = lines.length - 1;
    await setupEditor(content, { line: lastLine, ch: 10 });
    await vimKeys('l');

    let prevLine = lastLine;
    const visited = new Set<number>([lastLine]);

    for (let i = 0; i < 60; i++) {
        await vimKeys('g', 'k');
        const pos = await getCursorPos();
        visited.add(pos.line);

        if (pos.line < prevLine - 1) {
            throw new Error(
                `[${label}] gk skipped from line ${prevLine} to ${pos.line} (expected at most ${prevLine - 1})`,
            );
        }

        if (pos.line < prevLine && lines[pos.line].length > 0 && pos.ch === 0) {
            throw new Error(
                `[${label}] gk reset cursor to column 0 on line ${pos.line} ("${lines[pos.line].slice(0, 30)}...")`,
            );
        }

        prevLine = pos.line;
        if (pos.line === 0) break;
    }

    for (let line = 0; line <= lastLine; line++) {
        if (!visited.has(line)) {
            throw new Error(
                `[${label}] gk never visited line ${line} ("${lines[line].slice(0, 30)}...")`,
            );
        }
    }
}

describe('Spike: gk font/line-height variations (#26)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('baseline — default styling', async function () {
        await assertGkNoSkip(TEST_CONTENT, 'baseline');
    });

    it('large body font (20px)', async function () {
        const id = await injectCSS(
            '.markdown-source-view .cm-content { font-size: 20px !important; }',
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'large-body-font');
        } finally {
            await removeCSS(id);
        }
    });

    it('very large body font (24px)', async function () {
        const id = await injectCSS(
            '.markdown-source-view .cm-content { font-size: 24px !important; }',
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'very-large-body-font');
        } finally {
            await removeCSS(id);
        }
    });

    it('large heading font (3em h3)', async function () {
        const id = await injectCSS(
            '.markdown-source-view .cm-content .HyperMD-header-3 { font-size: 3em !important; }',
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'large-h3');
        } finally {
            await removeCSS(id);
        }
    });

    it('extra tall line height (2.5)', async function () {
        const id = await injectCSS(
            '.markdown-source-view .cm-content { line-height: 2.5 !important; }',
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'tall-line-height');
        } finally {
            await removeCSS(id);
        }
    });

    it('compact line height (1.2) with large heading', async function () {
        const id = await injectCSS(
            [
                '.markdown-source-view .cm-content { line-height: 1.2 !important; }',
                '.markdown-source-view .cm-content .HyperMD-header-3 { font-size: 2.5em !important; line-height: 1.8 !important; }',
            ].join('\n'),
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'compact-body-large-heading');
        } finally {
            await removeCSS(id);
        }
    });

    it('narrow editor (400px) forces more wrapping', async function () {
        const id = await injectCSS(
            '.workspace-leaf-content { max-width: 400px !important; }',
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'narrow-editor');
        } finally {
            await removeCSS(id);
        }
    });

    it('very narrow editor (250px) with large font', async function () {
        const id = await injectCSS(
            [
                '.workspace-leaf-content { max-width: 250px !important; }',
                '.markdown-source-view .cm-content { font-size: 22px !important; }',
            ].join('\n'),
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'very-narrow-large-font');
        } finally {
            await removeCSS(id);
        }
    });

    it('mixed heading levels with varied font sizes', async function () {
        const content = [
            LONG_LINE,
            '# Big Heading',
            'short line',
            '### Medium Heading',
            LONG_LINE,
            '###### Tiny Heading',
            'another short line',
        ].join('\n');
        const id = await injectCSS(
            [
                '.markdown-source-view .cm-content .HyperMD-header-1 { font-size: 3em !important; line-height: 1.6 !important; }',
                '.markdown-source-view .cm-content .HyperMD-header-3 { font-size: 2em !important; line-height: 1.8 !important; }',
                '.markdown-source-view .cm-content .HyperMD-header-6 { font-size: 0.9em !important; line-height: 1.2 !important; }',
            ].join('\n'),
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(content, 'mixed-heading-sizes');
        } finally {
            await removeCSS(id);
        }
    });

    it('extreme heading height disparity (h1=5em, body=12px)', async function () {
        const content = [
            'small body text here',
            '# Enormous Heading',
            'small body text below',
        ].join('\n');
        const id = await injectCSS(
            [
                '.markdown-source-view .cm-content { font-size: 12px !important; line-height: 1.3 !important; }',
                '.markdown-source-view .cm-content .HyperMD-header-1 { font-size: 5em !important; line-height: 1.5 !important; }',
            ].join('\n'),
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(content, 'extreme-h1-disparity');
        } finally {
            await removeCSS(id);
        }
    });

    it('heading padding/margin simulation', async function () {
        const id = await injectCSS(
            [
                '.markdown-source-view .cm-content .HyperMD-header-3 { padding-top: 24px !important; padding-bottom: 24px !important; margin-top: 16px !important; margin-bottom: 16px !important; }',
            ].join('\n'),
        );
        await browser.pause(PAUSE.EDITOR_SETTLE);
        try {
            await assertGkNoSkip(TEST_CONTENT, 'heading-padding-margin');
        } finally {
            await removeCSS(id);
        }
    });
});
