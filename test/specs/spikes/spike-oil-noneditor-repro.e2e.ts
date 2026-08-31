import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../../helpers';

async function cleanupOilViews(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view?.getViewType() === 'oil-explorer') {
                leaf.detach();
            }
        });
    });
}

async function detachAllEditorLeaves(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const toDetach: unknown[] = [];
        app.workspace.iterateAllLeaves((leaf) => {
            const vt = leaf.view?.getViewType();
            if (vt === 'markdown' || vt === 'empty') {
                toDetach.push(leaf);
            }
        });
        for (const leaf of toDetach) {
            (leaf as { detach: () => void }).detach();
        }
    });
    await browser.pause(500);
}

async function getActiveViewType(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        return leaf?.view?.getViewType() ?? 'none';
    })) as string;
}

async function openOilViaExCommand(): Promise<void> {
    await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<string, { oilManager?: unknown }>;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        if (!plugin?.oilManager) return;
        await (
            plugin.oilManager as { openOil?: (path: string) => Promise<void> }
        ).openOil?.('');
    });
    await browser.pause(1500);
}

interface OilDiagnostics {
    isOilView: boolean;
    hasEditorView: boolean;
    hasVimAdapter: boolean;
    vimMode: string | null;
    hasConcealIcons: boolean;
    hasRawPrefix: boolean;
    firstLineText: string;
    editorHasFocus: boolean;
    bufferContent: string;
    activeViewType: string;
    leafCount: number;
}

async function getOilDiagnostics(): Promise<OilDiagnostics> {
    return (await browser.executeObsidian(({ app }) => {
        let leafCount = 0;
        app.workspace.iterateAllLeaves(() => leafCount++);

        const leaf = app.workspace.getMostRecentLeaf();
        const activeViewType = leaf?.view?.getViewType() ?? 'none';
        const isOilView = activeViewType === 'oil-explorer';

        if (!isOilView) {
            return {
                isOilView: false,
                hasEditorView: false,
                hasVimAdapter: false,
                vimMode: null,
                hasConcealIcons: false,
                hasRawPrefix: false,
                firstLineText: '',
                editorHasFocus: false,
                bufferContent: '',
                activeViewType,
                leafCount,
            };
        }

        const view = leaf!.view as unknown as {
            getEditorView?: () => Record<string, unknown> | null;
            getBufferContent?: () => string;
        };

        const editorView = view.getEditorView?.();
        const hasEditorView = !!editorView;

        let hasVimAdapter = false;
        let vimMode: string | null = null;
        if (editorView) {
            const cm = (editorView as Record<string, unknown>).cm as
                { state?: { vim?: Record<string, unknown> } } | undefined;
            hasVimAdapter = !!cm;
            if (cm?.state?.vim) {
                vimMode = cm.state.vim.insertMode ? 'insert' : 'normal';
            }
        }

        let hasConcealIcons = false;
        let hasRawPrefix = false;
        let firstLineText = '';
        if (editorView) {
            const dom = (editorView as { dom?: HTMLElement }).dom;
            if (dom) {
                const lines = dom.querySelectorAll('.cm-line');
                const firstLine = lines[0];
                if (firstLine) {
                    hasConcealIcons = !!firstLine.querySelector(
                        '.vim-motions-oil-icon',
                    );
                    firstLineText = (firstLine.textContent ?? '').substring(
                        0,
                        80,
                    );
                    hasRawPrefix = /^\/\d+\s+[df]\s/.test(
                        firstLine.textContent ?? '',
                    );
                }
            }
        }

        const editorHasFocus = !!(editorView as { hasFocus?: boolean })
            ?.hasFocus;
        const bufferContent = (view.getBufferContent?.() ?? '').substring(
            0,
            200,
        );

        return {
            isOilView,
            hasEditorView,
            hasVimAdapter,
            vimMode,
            hasConcealIcons,
            hasRawPrefix,
            firstLineText,
            editorHasFocus,
            bufferContent,
            activeViewType,
            leafCount,
        };
    })) as OilDiagnostics;
}

function logDiagnostics(label: string, d: OilDiagnostics): void {
    console.log(`\n=== ${label} ===`);
    console.log(`  Active view type: ${d.activeViewType}`);
    console.log(`  Is Oil view: ${d.isOilView}`);
    console.log(`  Has EditorView: ${d.hasEditorView}`);
    console.log(`  Has vim adapter: ${d.hasVimAdapter}`);
    console.log(`  Vim mode: ${d.vimMode}`);
    console.log(`  Has conceal icons: ${d.hasConcealIcons}`);
    console.log(`  Has raw prefix: ${d.hasRawPrefix}`);
    console.log(`  First line text: "${d.firstLineText}"`);
    console.log(`  Editor has focus: ${d.editorHasFocus}`);
    console.log(`  Leaf count: ${d.leafCount}`);
    console.log(`  Buffer (first 200): "${d.bufferContent}"`);
}

describe('Spike: Oil from non-editor context reproduction', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await browser.pause(2000);
    });

    afterEach(async function () {
        await cleanupOilViews();
        await browser.pause(300);
    });

    it('Scenario 1: Oil after detaching all editor leaves (empty workspace)', async function () {
        await detachAllEditorLeaves();
        const viewTypeBefore = await getActiveViewType();
        console.log(`\nBefore Oil open — active view: ${viewTypeBefore}`);

        await openOilViaExCommand();
        const d = await getOilDiagnostics();
        logDiagnostics('Scenario 1: Empty workspace → Oil', d);
    });

    it('Scenario 2: Oil from a markdown file (control — should work)', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        await openOilViaExCommand();
        const d = await getOilDiagnostics();
        logDiagnostics('Scenario 2: MarkdownView → Oil (control)', d);

        expect(d.isOilView).toBe(true);
        expect(d.hasVimAdapter).toBe(true);
        expect(d.hasConcealIcons).toBe(true);
    });

    it('Scenario 3: Oil opened, closed, reopened from empty pane', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);
        await openOilViaExCommand();
        await browser.pause(300);
        await cleanupOilViews();
        await browser.pause(300);

        await detachAllEditorLeaves();
        await browser.pause(300);

        await openOilViaExCommand();
        const d = await getOilDiagnostics();
        logDiagnostics('Scenario 3: Md → Oil → close → detach → Oil', d);
    });

    it('Scenario 4: Two Oil opens without any MarkdownView in between', async function () {
        await detachAllEditorLeaves();
        await browser.pause(300);

        await openOilViaExCommand();
        const d1 = await getOilDiagnostics();
        logDiagnostics('Scenario 4a: First Oil open (cold)', d1);

        await cleanupOilViews();
        await browser.pause(500);

        await openOilViaExCommand();
        const d2 = await getOilDiagnostics();
        logDiagnostics('Scenario 4b: Second Oil open (still cold)', d2);
    });

    it('Scenario 5: Open Oil via obsidian command (not plugin method)', async function () {
        await detachAllEditorLeaves();
        await browser.pause(300);

        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands?: {
                        executeCommandById?: (id: string) => void;
                    };
                }
            ).commands?.executeCommandById?.('vim-motions:oil-open');
        });
        await browser.pause(1500);

        const d = await getOilDiagnostics();
        logDiagnostics('Scenario 5: Oil via command palette (cold)', d);
    });
});
