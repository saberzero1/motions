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
        const lines = dom.querySelectorAll('.cm-line[data-vim-marks]');
        const results: { line: number; marks: string }[] = [];
        lines.forEach((el) => {
            const marks = (el as HTMLElement).dataset.vimMarks ?? '';
            const allLines = dom.querySelectorAll('.cm-line');
            let lineIndex = -1;
            allLines.forEach((l, i) => {
                if (l === el) lineIndex = i;
            });
            results.push({ line: lineIndex, marks });
        });
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

    it('should not add horizontal space to the editor', async function () {
        const widthBefore = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return 0;
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                const gutters = dom?.querySelector(
                    '.cm-gutters',
                ) as HTMLElement | null;
                return gutters?.offsetWidth ?? 0;
            },
        )) as number;

        await vimHandleKey('m');
        await vimHandleKey('a');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const widthAfter = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return 0;
                const container = (
                    view.editor as unknown as Record<string, unknown>
                ).cm as Record<string, unknown>;
                const dom = (container as unknown as { dom: HTMLElement }).dom;
                const gutters = dom?.querySelector(
                    '.cm-gutters',
                ) as HTMLElement | null;
                return gutters?.offsetWidth ?? 0;
            },
        )) as number;

        expect(widthAfter).toBe(widthBefore);
    });
});
