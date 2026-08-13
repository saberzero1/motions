import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000 } as const;

async function ensureLivePreview(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = false;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.SETTLE * 2);
}

async function setupDoc(content: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, c: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        if (
            editMode?.tableCell &&
            typeof editMode.destroyTableCell === 'function'
        ) {
            (editMode.destroyTableCell as () => void)();
        }
        view.editor.setValue(c);
        view.editor.setCursor(0, 0);
        view.editor.focus();
    }, content);
    await browser.pause(PAUSE.RENDER);
}

describe('Spike: line numbers with tables', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();

        await browser.executeObsidian(({ app }) => {
            const plugins = (app as unknown as Record<string, unknown>)
                .plugins as Record<string, unknown>;
            const plugin = (plugins.plugins as Record<string, unknown>)?.[
                'vim-motions'
            ] as Record<string, unknown> | undefined;
            if (plugin?.settings) {
                (plugin.settings as Record<string, unknown>).number = true;
                (plugin.settings as Record<string, unknown>).relativenumber =
                    false;
            }
        });
        await browser.pause(PAUSE.SETTLE);
    });

    it('should show line numbers without table', async function () {
        this.timeout(20000);
        await setupDoc('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
        await browser.pause(PAUSE.RENDER);
        await browser
            .saveScreenshot('/tmp/opencode/linenums-no-table.png')
            .catch(() => {});

        const info = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const cm = editMode?.cm as { dom?: HTMLElement } | null;
            if (!cm?.dom) return { error: 'no dom' };
            const gutters = cm.dom.querySelector('.cm-gutters');
            const lineNumGutter = cm.dom.querySelector(
                '.vim-motions-line-numbers',
            );
            return {
                hasGutters: !!gutters,
                gutterChildren: gutters ? gutters.children.length : 0,
                hasLineNumGutter: !!lineNumGutter,
                gutterClasses: gutters
                    ? Array.from(gutters.children)
                          .map((c) => (c as HTMLElement).className)
                          .join(', ')
                    : 'none',
            };
        });
        console.log('[LINENUMS no-table]', JSON.stringify(info, null, 2));
    });

    it('should show line numbers with table present', async function () {
        this.timeout(20000);
        await setupDoc(
            'Line 1\nLine 2\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine 5\nLine 6',
        );
        await browser.pause(PAUSE.RENDER);
        await browser
            .saveScreenshot('/tmp/opencode/linenums-with-table.png')
            .catch(() => {});

        const info = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const cm = editMode?.cm as { dom?: HTMLElement } | null;
            if (!cm?.dom) return { error: 'no dom' };
            const gutters = cm.dom.querySelector('.cm-gutters');
            const lineNumGutter = cm.dom.querySelector(
                '.vim-motions-line-numbers',
            );
            return {
                hasGutters: !!gutters,
                gutterChildren: gutters ? gutters.children.length : 0,
                hasLineNumGutter: !!lineNumGutter,
                gutterClasses: gutters
                    ? Array.from(gutters.children)
                          .map((c) => (c as HTMLElement).className)
                          .join(', ')
                    : 'none',
            };
        });
        console.log('[LINENUMS with-table]', JSON.stringify(info, null, 2));
    });

    it('should show line numbers after entering and exiting table cell', async function () {
        this.timeout(30000);
        await setupDoc(
            'Line 1\nLine 2\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine 5\nLine 6',
        );
        await browser.pause(PAUSE.RENDER);

        await browser.keys(['j', 'j', 'j']);
        await browser.pause(PAUSE.SETTLE);
        await browser
            .saveScreenshot('/tmp/opencode/linenums-in-cell.png')
            .catch(() => {});

        const inCellInfo = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const cm = editMode?.cm as { dom?: HTMLElement } | null;
                if (!cm?.dom) return { error: 'no dom' };
                const gutters = cm.dom.querySelector(
                    ':scope > .cm-scroller > .cm-gutters',
                );
                const lineNumGutter = cm.dom.querySelector(
                    ':scope > .cm-scroller > .cm-gutters > .vim-motions-line-numbers',
                );
                const mainEditorClasses = cm.dom.className;
                const mainInTableCell = view.editor.inTableCell;
                return {
                    label: 'in-cell',
                    hasGutters: !!gutters,
                    hasLineNumGutter: !!lineNumGutter,
                    gutterClasses: gutters
                        ? Array.from(gutters.children)
                              .map((c) => (c as HTMLElement).className)
                              .join(', ')
                        : 'none',
                    mainEditorClasses,
                    mainInTableCell,
                    gutterDisplay: gutters
                        ? getComputedStyle(gutters as HTMLElement).display
                        : 'N/A',
                };
            },
        );
        console.log('[LINENUMS in-cell]', JSON.stringify(inCellInfo, null, 2));

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE * 2);
        await browser
            .saveScreenshot('/tmp/opencode/linenums-after-exit.png')
            .catch(() => {});

        const afterExitInfo = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const cm = editMode?.cm as { dom?: HTMLElement } | null;
                if (!cm?.dom) return { error: 'no dom' };
                const gutters = cm.dom.querySelector('.cm-gutters');
                const lineNumGutter = cm.dom.querySelector(
                    '.vim-motions-line-numbers',
                );
                return {
                    label: 'after-exit',
                    hasGutters: !!gutters,
                    hasLineNumGutter: !!lineNumGutter,
                    gutterClasses: gutters
                        ? Array.from(gutters.children)
                              .map((c) => (c as HTMLElement).className)
                              .join(', ')
                        : 'none',
                };
            },
        );
        console.log(
            '[LINENUMS after-exit]',
            JSON.stringify(afterExitInfo, null, 2),
        );
    });
});
