import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, PAUSE } from '../helpers';

async function getMarkGutterLabels(): Promise<
    { line: number; marks: string }[]
> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return [];
        const editorView = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown> | undefined;
        if (!editorView) return [];
        const cm6 = (editorView as unknown as { dom: HTMLElement }).dom
            ? editorView
            : (editorView as Record<string, unknown>).cm6;
        if (!cm6) return [];
        const dom = (cm6 as { dom: HTMLElement }).dom;
        if (!dom) return [];
        const gutterCol = dom.querySelector('.vim-motions-sign-column');
        if (!gutterCol) return [];
        const gutterElements = Array.from(
            gutterCol.querySelectorAll('.cm-gutterElement'),
        );
        const results: { line: number; marks: string }[] = [];
        for (let i = 0; i < gutterElements.length; i++) {
            const el = gutterElements[i];
            const marker = el.querySelector('.vim-motions-sign-marker');
            if (!marker) continue;
            const marks = marker.textContent ?? '';
            if (!marks) continue;
            const contentLines = dom.querySelectorAll('.cm-line');
            const elTop = (el as HTMLElement).getBoundingClientRect().top;
            let closestLine = 0;
            let closestDist = Infinity;
            contentLines.forEach((line, idx) => {
                const dist = Math.abs(
                    (line as HTMLElement).getBoundingClientRect().top - elTop,
                );
                if (dist < closestDist) {
                    closestDist = dist;
                    closestLine = idx;
                }
            });
            results.push({ line: closestLine, marks });
        }
        return results;
    })) as { line: number; marks: string }[];
}

async function vimHandleKey(key: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, k: string) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleKey(adapter, k);
    }, key);
    await browser.pause(PAUSE.KEY_GAP);
}

async function handleEx(command: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleEx: (cm: unknown, input: string) => void;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleEx(adapter, cmd);
    }, command);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Mark gutter indicators', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    beforeEach(async function () {
        await setupEditor(
            'first line\nsecond line\nthird line\nfourth line\nfifth line',
            {
                line: 0,
                ch: 0,
            },
        );
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            if (!adapter) return;
            const state = adapter.state as Record<string, unknown> | undefined;
            const vim = state?.vim as Record<string, unknown> | undefined;
            const marks = vim?.marks as
                | Record<string, { clear: () => void }>
                | undefined;
            if (!marks) return;
            for (const key of Object.keys(marks)) {
                marks[key]?.clear();
                delete marks[key];
            }
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await vimHandleKey('l');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    it('should show mark in gutter when set with ma', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getMarkGutterLabels();
        expect(labels.length).toBeGreaterThanOrEqual(1);
        const markA = labels.find((l) => l.marks.includes('a'));
        expect(markA).toBeDefined();
        expect(markA!.line).toBe(0);
    });

    it('should move mark indicator when mark is moved', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        let labels = await getMarkGutterLabels();
        let markA = labels.find((l) => l.marks.includes('a'));
        expect(markA).toBeDefined();
        expect(markA!.line).toBe(0);

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.KEY_GAP);
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        labels = await getMarkGutterLabels();
        markA = labels.find((l) => l.marks.includes('a'));
        expect(markA).toBeDefined();
        expect(markA!.line).toBe(2);

        const oldLine = labels.find(
            (l) => l.line === 0 && l.marks.includes('a'),
        );
        expect(oldLine).toBeUndefined();
    });

    it('should show multiple marks on the same line', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.KEY_GAP);
        await vimHandleKey('m');
        await vimHandleKey('b');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getMarkGutterLabels();
        const line0 = labels.find((l) => l.line === 0);
        expect(line0).toBeDefined();
        expect(line0!.marks).toContain('a');
        expect(line0!.marks).toContain('b');
    });

    it('should remove mark indicator on :delmarks', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        let labels = await getMarkGutterLabels();
        expect(labels.find((l) => l.marks.includes('a'))).toBeDefined();

        await handleEx('delmarks a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        labels = await getMarkGutterLabels();
        expect(labels.find((l) => l.marks.includes('a'))).toBeUndefined();
    });

    it('should have no gutter marks when no marks are set', async function () {
        const labels = await getMarkGutterLabels();
        expect(labels.length).toBe(0);
    });

    it('should render marks in a dedicated gutter column', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const hasGutterColumn = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                const col = dom?.querySelector(
                    '.vim-motions-sign-column',
                ) as HTMLElement | null;
                return col !== null && col.offsetWidth > 0;
            },
        )) as boolean;

        expect(hasGutterColumn).toBe(true);
    });

    it('should not render marks as line overlays', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const hasOverlay = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                return dom?.querySelector('.cm-line[data-vim-marks]') !== null;
            },
        )) as boolean;

        expect(hasOverlay).toBe(false);
    });

    it('should truncate with ellipsis when more than 3 marks on same line', async function () {
        for (const key of ['a', 'b', 'c', 'd']) {
            await vimHandleKey('m');
            await vimHandleKey(key);
            await browser.pause(PAUSE.KEY_GAP);
        }
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getMarkGutterLabels();
        const line0 = labels.find((l) => l.line === 0);
        expect(line0).toBeDefined();
        expect(line0!.marks).toBe('abc\u2026');
    });

    it('should use consistent font size on heading lines', async function () {
        await setupEditor('# Heading line\nregular line\nthird line', {
            line: 0,
            ch: 0,
        });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.KEY_GAP);

        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);
        await vimHandleKey('m');
        await vimHandleKey('b');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const fontSizes = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return [];
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                const markers = dom?.querySelectorAll(
                    '.vim-motions-sign-marker',
                );
                if (!markers) return [];
                const sizes: string[] = [];
                markers.forEach((el) => {
                    sizes.push(getComputedStyle(el as HTMLElement).fontSize);
                });
                return sizes;
            },
        )) as string[];

        expect(fontSizes.length).toBeGreaterThanOrEqual(2);
        expect(fontSizes[0]).toBe(fontSizes[1]);
    });

    it('should not have data-vim-marks overlay on any line', async function () {
        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['j']);
        await browser.pause(PAUSE.KEY_GAP);
        await vimHandleKey('m');
        await vimHandleKey('b');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const overlayCount = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return -1;
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                return (
                    dom?.querySelectorAll('.cm-line[data-vim-marks]').length ??
                    -1
                );
            },
        )) as number;

        expect(overlayCount).toBe(0);
    });
});
