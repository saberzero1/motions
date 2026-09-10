import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getCursorPos, PAUSE, setupEditor, vimKeys } from '../helpers';

const LONG_LINE =
    'This is a deliberately long line of text that should wrap multiple times in the editor to create several visual display lines from a single document line in the buffer.';
const TEST_CONTENT = [LONG_LINE, '### Heading', LONG_LINE].join('\n');

async function withThemeOverride(css: string, test: () => Promise<void>) {
    const id = (await browser.executeObsidian((_ctx, cssText: string) => {
        const style = document.createElement('style');
        style.id = `gk-theme-override-${Date.now()}`;
        style.textContent = cssText;
        document.head.appendChild(style);
        return style.id;
    }, css)) as string;
    await browser.pause(PAUSE.EDITOR_SETTLE);
    try {
        await test();
    } finally {
        await browser.executeObsidian((_ctx, styleId: string) => {
            document.getElementById(styleId)?.remove();
        }, id);
    }
}

async function expectGkToVisitEveryLine(content: string): Promise<void> {
    const lines = content.split('\n');
    const lastLine = lines.length - 1;
    await setupEditor(content, { line: lastLine, ch: 10 });
    await vimKeys('l');

    let previousLine = lastLine;
    const visited = new Set<number>([lastLine]);
    for (let i = 0; i < 60; i++) {
        await vimKeys('g', 'k');
        const position = await getCursorPos();
        visited.add(position.line);
        if (position.line < previousLine - 1) {
            throw new Error(
                `gk skipped from line ${previousLine} to ${position.line}`,
            );
        }
        if (
            position.line < previousLine &&
            lines[position.line]!.length > 0 &&
            position.ch === 0
        ) {
            throw new Error(`gk reset to column 0 on line ${position.line}`);
        }
        previousLine = position.line;
        if (position.line === 0) break;
    }

    for (let line = 0; line <= lastLine; line++) {
        if (!visited.has(line))
            throw new Error(`gk never visited line ${line}`);
    }
}

describe('gk across theme geometry variations', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('preserves document-line traversal with an oversized heading', async function () {
        await withThemeOverride(
            '.markdown-source-view .cm-content .HyperMD-header-3 { font-size: 3em; line-height: 1.8; }',
            () => expectGkToVisitEveryLine(TEST_CONTENT),
        );
    });

    it('preserves document-line traversal in a narrow large-font editor', async function () {
        await withThemeOverride(
            '.workspace-leaf-content { max-width: 250px; } .markdown-source-view .cm-content { font-size: 22px; }',
            () => expectGkToVisitEveryLine(TEST_CONTENT),
        );
    });
});
