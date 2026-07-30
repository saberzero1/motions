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

describe('Spike: Oil keybinding and vim adapter timing', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await browser.pause(2000);
    });

    afterEach(async function () {
        await cleanupOilViews();
        await browser.pause(300);
    });

    it('Check vim adapter state immediately vs after focus', async function () {
        await detachAllEditorLeaves();
        await browser.pause(300);

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
                plugin.oilManager as {
                    openOil?: (path: string) => Promise<void>;
                }
            ).openOil?.('');
        });

        const immediateState = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer')
                return { error: 'not oil' };
            const view = leaf.view as unknown as {
                getEditorView?: () => Record<string, unknown> | null;
            };
            const editorView = view.getEditorView?.();
            if (!editorView) return { error: 'no editor view' };

            const cm = (editorView as Record<string, unknown>).cm as
                | { state?: { vim?: Record<string, unknown> } }
                | undefined;
            const hasFocus = !!(editorView as { hasFocus?: boolean }).hasFocus;

            const contentDOM = (editorView as { contentDOM?: HTMLElement })
                .contentDOM;
            const contentDOMFocused = contentDOM === document.activeElement;

            return {
                hasVimAdapter: !!cm,
                vimMode: cm?.state?.vim
                    ? cm.state.vim.insertMode
                        ? 'insert'
                        : 'normal'
                    : null,
                editorHasFocus: hasFocus,
                contentDOMFocused,
                activeElement: document.activeElement?.tagName ?? 'none',
                activeElementClass:
                    document.activeElement?.className?.substring(0, 50) ?? '',
            };
        })) as Record<string, unknown>;

        console.log('=== IMMEDIATE (before requestAnimationFrame focus) ===');
        console.log(`  vim adapter: ${immediateState.hasVimAdapter}`);
        console.log(`  vim mode: ${immediateState.vimMode}`);
        console.log(`  editor.hasFocus: ${immediateState.editorHasFocus}`);
        console.log(
            `  contentDOM focused: ${immediateState.contentDOMFocused}`,
        );
        console.log(`  active element: ${immediateState.activeElement}`);
        console.log(
            `  active element class: ${immediateState.activeElementClass}`,
        );

        await browser.pause(500);

        const afterFocusState = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer')
                return { error: 'not oil' };
            const view = leaf.view as unknown as {
                getEditorView?: () => Record<string, unknown> | null;
            };
            const editorView = view.getEditorView?.();
            if (!editorView) return { error: 'no editor view' };

            const cm = (editorView as Record<string, unknown>).cm as
                | { state?: { vim?: Record<string, unknown> } }
                | undefined;
            const hasFocus = !!(editorView as { hasFocus?: boolean }).hasFocus;

            const contentDOM = (editorView as { contentDOM?: HTMLElement })
                .contentDOM;
            const contentDOMFocused = contentDOM === document.activeElement;

            return {
                hasVimAdapter: !!cm,
                vimMode: cm?.state?.vim
                    ? cm.state.vim.insertMode
                        ? 'insert'
                        : 'normal'
                    : null,
                editorHasFocus: hasFocus,
                contentDOMFocused,
                activeElement: document.activeElement?.tagName ?? 'none',
                activeElementClass:
                    document.activeElement?.className?.substring(0, 50) ?? '',
            };
        })) as Record<string, unknown>;

        console.log('\n=== AFTER 500ms (focus should have settled) ===');
        console.log(`  vim adapter: ${afterFocusState.hasVimAdapter}`);
        console.log(`  vim mode: ${afterFocusState.vimMode}`);
        console.log(`  editor.hasFocus: ${afterFocusState.editorHasFocus}`);
        console.log(
            `  contentDOM focused: ${afterFocusState.contentDOMFocused}`,
        );
        console.log(`  active element: ${afterFocusState.activeElement}`);
        console.log(
            `  active element class: ${afterFocusState.activeElementClass}`,
        );
    });

    it('Check OilKeybindingManager state after Oil open from empty', async function () {
        await detachAllEditorLeaves();
        await browser.pause(300);

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
                plugin.oilManager as {
                    openOil?: (path: string) => Promise<void>;
                }
            ).openOil?.('');
        });
        await browser.pause(1000);

        const kbState = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins?: {
                        plugins?: Record<
                            string,
                            {
                                oilKeybindingManager?: {
                                    applied?: boolean;
                                    actionsRegistered?: boolean;
                                    appliedKeys?: string[];
                                };
                            }
                        >;
                    };
                }
            ).plugins?.plugins?.['vim-motions'];

            const kb = plugin?.oilKeybindingManager;
            if (!kb) return { error: 'no keybinding manager' };

            return {
                applied: (kb as Record<string, unknown>).applied,
                actionsRegistered: (kb as Record<string, unknown>)
                    .actionsRegistered,
                appliedKeysCount: (
                    (kb as Record<string, unknown>).appliedKeys as
                        | string[]
                        | undefined
                )?.length,
            };
        })) as Record<string, unknown>;

        console.log('\n=== OilKeybindingManager state ===');
        console.log(`  applied: ${kbState.applied}`);
        console.log(`  actionsRegistered: ${kbState.actionsRegistered}`);
        console.log(`  appliedKeys count: ${kbState.appliedKeysCount}`);

        const vimApiState = (await browser.executeObsidian(() => {
            const win = window as unknown as {
                CodeMirrorAdapter?: { Vim?: unknown };
            };
            const hasVimApi = !!win.CodeMirrorAdapter?.Vim;
            return { hasVimApi };
        })) as Record<string, unknown>;

        console.log(
            `  window.CodeMirrorAdapter.Vim present: ${vimApiState.hasVimApi}`,
        );
    });

    it('Send actual keystrokes to Oil and check response', async function () {
        await detachAllEditorLeaves();
        await browser.pause(300);

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
                plugin.oilManager as {
                    openOil?: (path: string) => Promise<void>;
                }
            ).openOil?.('');
        });
        await browser.pause(1500);

        const beforeKeys = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer') return null;
            const editorView = (
                leaf.view as unknown as {
                    getEditorView?: () => {
                        state: {
                            selection: {
                                main: { head: number };
                            };
                        };
                    } | null;
                }
            ).getEditorView?.();
            if (!editorView) return null;
            return {
                cursorPos: editorView.state.selection.main.head,
            };
        })) as { cursorPos: number } | null;

        console.log(`\n=== Before keystrokes ===`);
        console.log(`  Cursor pos: ${beforeKeys?.cursorPos}`);

        await browser.keys(['j']);
        await browser.pause(200);

        const afterJ = (await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer') return null;
            const editorView = (
                leaf.view as unknown as {
                    getEditorView?: () => {
                        state: {
                            selection: {
                                main: { head: number };
                            };
                            doc: {
                                lineAt: (pos: number) => {
                                    number: number;
                                    text: string;
                                };
                            };
                        };
                    } | null;
                }
            ).getEditorView?.();
            if (!editorView) return null;
            const pos = editorView.state.selection.main.head;
            const line = editorView.state.doc.lineAt(pos);
            return {
                cursorPos: pos,
                cursorLine: line.number,
                lineText: line.text,
            };
        })) as {
            cursorPos: number;
            cursorLine: number;
            lineText: string;
        } | null;

        console.log(`\n=== After 'j' ===`);
        console.log(`  Cursor pos: ${afterJ?.cursorPos}`);
        console.log(`  Cursor line: ${afterJ?.cursorLine}`);
        console.log(`  Line text: "${afterJ?.lineText}"`);

        const jMovedDown = afterJ && beforeKeys && afterJ.cursorLine > 1;
        console.log(`  j moved cursor down: ${jMovedDown}`);
    });
});
