import { browser, expect } from '@wdio/globals';
import { PAUSE } from '../../helpers';

interface SpikeDebugEntry {
    callIndex: number;
    optsUndefined: boolean;
    containerElSameAsParam: boolean | null;
    isBundledVimActiveValue: boolean;
    isBuiltinVimEnabledValue: boolean;
    superExtensionCount: number;
    stack: string;
}

async function openOilDirect(): Promise<void> {
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

async function cleanupOilViews(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view?.getViewType() === 'oil-explorer') {
                leaf.detach();
            }
        });
    });
}

describe('Spike: Oil cold start (no prior MarkdownView)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await browser.pause(2000);

        await browser.executeObsidian(({ app }) => {
            app.workspace.iterateAllLeaves((leaf) => {
                if (
                    leaf.view?.getViewType() === 'markdown' ||
                    leaf.view?.getViewType() === 'empty'
                ) {
                    leaf.detach();
                }
            });
        });
        await browser.pause(500);
    });

    after(async function () {
        await cleanupOilViews();
    });

    it('Cold start: Oil without prior MarkdownView', async function () {
        await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            const arr = g.__embeddableEditorSpikeDebug;
            if (Array.isArray(arr)) arr.length = 0;
        });

        const hasMarkdownView = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                return (
                    app.workspace.getActiveViewOfType(obsidian.MarkdownView) !==
                    null
                );
            },
        )) as boolean;

        console.log('=== COLD START: MarkdownView exists before Oil open ===');
        console.log(`  Has MarkdownView: ${hasMarkdownView}`);

        await openOilDirect();

        const debugEntries = (await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            return g.__embeddableEditorSpikeDebug ?? [];
        })) as SpikeDebugEntry[];

        console.log(
            `\n=== COLD START: buildLocalExtensions() calls: ${debugEntries.length} ===`,
        );
        for (const entry of debugEntries) {
            console.log(`  Call #${entry.callIndex}:`);
            console.log(`    this._opts undefined: ${entry.optsUndefined}`);
            console.log(
                `    isBundledVimActive: ${entry.isBundledVimActiveValue}`,
            );
            console.log(
                `    isBuiltinVimEnabled: ${entry.isBuiltinVimEnabledValue}`,
            );
            console.log(
                `    super extension count: ${entry.superExtensionCount}`,
            );
        }

        const vimState = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer') {
                return { error: 'not-oil-view' };
            }
            const editorView = (
                leaf.view as unknown as {
                    getEditorView?: () => Record<string, unknown> | null;
                }
            ).getEditorView?.();
            if (!editorView) return { error: 'no-editor-view' };

            const cm = (editorView as Record<string, unknown>).cm as
                | { state?: { vim?: Record<string, unknown> } }
                | undefined;

            return {
                hasVimAdapter: !!cm,
                vimMode: cm?.state?.vim
                    ? cm.state.vim.insertMode
                        ? 'insert'
                        : 'normal'
                    : null,
            };
        })) as Record<string, unknown>;

        console.log('\n=== COLD START: Vim state on Oil editor ===');
        console.log(`  Has vim adapter: ${vimState.hasVimAdapter}`);
        console.log(`  Vim mode: ${vimState.vimMode}`);

        const oilContent = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer') return '';
            return (
                (
                    leaf.view as unknown as { getBufferContent?: () => string }
                ).getBufferContent?.() ?? ''
            );
        })) as string;

        const hasConceal = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer') return null;
            const editorView = (
                leaf.view as unknown as {
                    getEditorView?: () => {
                        dom?: HTMLElement;
                    } | null;
                }
            ).getEditorView?.();
            if (!editorView?.dom) return null;

            const lines = editorView.dom.querySelectorAll('.cm-line');
            const firstLine = lines[0];
            if (!firstLine) return null;

            const hasOilIcon = firstLine.querySelector('.vim-motions-oil-icon');
            const rawText = firstLine.textContent ?? '';
            const hasRawPrefix = /^\/\d+\s+[df]\s/.test(rawText);

            return {
                hasOilIcon: !!hasOilIcon,
                hasRawPrefix,
                firstLineText: rawText.substring(0, 50),
            };
        })) as {
            hasOilIcon: boolean;
            hasRawPrefix: boolean;
            firstLineText: string;
        } | null;

        console.log('\n=== COLD START: Conceal decoration state ===');
        if (hasConceal) {
            console.log(`  Has oil icon widget: ${hasConceal.hasOilIcon}`);
            console.log(`  Has raw prefix: ${hasConceal.hasRawPrefix}`);
            console.log(
                `  First line text (first 50 chars): "${hasConceal.firstLineText}"`,
            );
        } else {
            console.log('  Could not inspect conceal state');
        }

        if (debugEntries.length > 0) {
            const warmSuperCount = debugEntries[0].superExtensionCount;
            console.log(
                `\n=== COMPARISON: super extension count (cold start): ${warmSuperCount} ===`,
            );
            console.log(
                '  (Compare with warm start spike to see if extensions differ)',
            );
        }

        console.log('\n=== COLD START CONCLUSION ===');
        if (vimState.hasVimAdapter) {
            console.log('  Vim IS present even without prior MarkdownView.');
            console.log(
                '  This means registerEditorExtension() injects into embedded editors regardless.',
            );
        } else {
            console.log('  Vim is ABSENT without prior MarkdownView.');
            console.log(
                '  Confirms: registerEditorExtension() does NOT inject into embedded editors on cold start.',
            );
            console.log(
                '  FIX NEEDED: Explicitly push vim extension in buildLocalExtensions().',
            );
        }
    });
});
