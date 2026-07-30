import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../../helpers';

/**
 * Spike: Oil embeddable editor degradation investigation
 *
 * Probes runtime state to answer:
 * 1. When is buildLocalExtensions() called? (during super vs load)
 * 2. Is this._opts defined at call time?
 * 3. Is this.containerEl === container (constructor param)?
 * 4. Does the vim ViewPlugin exist on the Oil editor?
 * 5. What are isBundledVimActive and isBuiltinVimEnabled values?
 * 6. How many extensions does super.buildLocalExtensions() return?
 */

interface SpikeDebugEntry {
    callIndex: number;
    optsUndefined: boolean;
    containerElSameAsParam: boolean | null;
    isBundledVimActiveValue: boolean;
    isBuiltinVimEnabledValue: boolean;
    superExtensionCount: number;
    stack: string;
}

interface ClassBuildInfo {
    isBundledVimActive: boolean;
    isBuiltinVimEnabled: boolean;
    isVimEnabled: boolean;
}

async function openOilAndWait(dirPath?: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, dir?: string) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<string, { oilManager?: unknown }>;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        const activeDir =
            dir ??
            (() => {
                const file = app.workspace.getActiveFile();
                if (!file) return '';
                const path = file.path;
                const idx = path.lastIndexOf('/');
                return idx === -1 ? '' : path.slice(0, idx);
            })();
        if (!plugin?.oilManager) return;
        await (
            plugin.oilManager as { openOil?: (path: string) => Promise<void> }
        ).openOil?.(activeDir);
    }, dirPath);
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

describe('Spike: Oil embeddable editor degradation', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    after(async function () {
        await cleanupOilViews();
    });

    it('Spike 1+3: buildLocalExtensions call timing and vim state', async function () {
        await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            const arr = g.__embeddableEditorSpikeDebug;
            if (Array.isArray(arr)) arr.length = 0;
        });

        await openOilAndWait('');

        const debugEntries = (await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            return g.__embeddableEditorSpikeDebug ?? [];
        })) as SpikeDebugEntry[];

        const classBuildInfo = (await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            return g.__spikeClassBuildInfo ?? null;
        })) as ClassBuildInfo | null;

        console.log('=== SPIKE 1: buildLocalExtensions() calls ===');
        console.log(`Total calls: ${debugEntries.length}`);
        for (const entry of debugEntries) {
            console.log(`  Call #${entry.callIndex}:`);
            console.log(`    this._opts undefined: ${entry.optsUndefined}`);
            console.log(
                `    containerEl === container: ${entry.containerElSameAsParam}`,
            );
            console.log(
                `    isBundledVimActive: ${entry.isBundledVimActiveValue}`,
            );
            console.log(
                `    isBuiltinVimEnabled: ${entry.isBuiltinVimEnabledValue}`,
            );
            console.log(
                `    super extension count: ${entry.superExtensionCount}`,
            );
            console.log(`    stack (top 4):\n${entry.stack}`);
        }

        console.log('=== SPIKE 3: buildEditorClass() state ===');
        if (classBuildInfo) {
            console.log(
                `  isBundledVimActive: ${classBuildInfo.isBundledVimActive}`,
            );
            console.log(
                `  isBuiltinVimEnabled: ${classBuildInfo.isBuiltinVimEnabled}`,
            );
            console.log(`  isVimEnabled: ${classBuildInfo.isVimEnabled}`);
        } else {
            console.log('  (class already cached from prior construction)');
        }

        expect(debugEntries.length).toBeGreaterThan(0);

        const firstCall = debugEntries[0];
        if (firstCall) {
            console.log('\n=== SPIKE 1 CONCLUSIONS ===');
            console.log(
                `  Problem A confirmed: ${firstCall.optsUndefined ? 'YES - this._opts is undefined on first buildLocalExtensions call' : 'NO - this._opts is defined'}`,
            );
            console.log(
                `  containerEl identity: ${firstCall.containerElSameAsParam === true ? 'SAME - WeakMap approach will work' : firstCall.containerElSameAsParam === false ? 'DIFFERENT - WeakMap needs alternative key' : 'N/A (not during super)'}`,
            );

            if (debugEntries.length >= 2) {
                const secondCall = debugEntries[1];
                console.log(
                    `  Second call: this._opts defined = ${!secondCall.optsUndefined}`,
                );
                console.log(
                    '  Conclusion: buildLocalExtensions called TWICE (super + load). Stash needed for first call only.',
                );
            } else {
                console.log(
                    '  Conclusion: buildLocalExtensions called ONCE (super only). Stash is MANDATORY.',
                );
            }
        }
    });

    it('Spike 2: vim ViewPlugin presence on Oil editor', async function () {
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

            const hasVimAdapter = !!cm;
            const vimMode = cm?.state?.vim
                ? cm.state.vim.insertMode
                    ? 'insert'
                    : cm.state.vim.visualMode
                      ? 'visual'
                      : 'normal'
                : null;

            const extensionCount = (
                (editorView as Record<string, unknown>).state as
                    | {
                          values?: unknown[];
                          facet?: (f: unknown) => unknown[];
                      }
                    | undefined
            )?.values?.length;

            return {
                hasVimAdapter,
                vimMode,
                extensionCount: extensionCount ?? 'unknown',
            };
        })) as Record<string, unknown>;

        console.log('=== SPIKE 2: Vim ViewPlugin on Oil editor ===');
        console.log(`  Has vim adapter (view.cm): ${vimState.hasVimAdapter}`);
        console.log(`  Vim mode: ${vimState.vimMode}`);
        console.log(`  State values count: ${vimState.extensionCount}`);

        if (vimState.hasVimAdapter) {
            console.log(
                '  Conclusion: Vim extension IS present in Oil editor (warm start — MarkdownView existed).',
            );
        } else {
            console.log(
                '  Conclusion: Vim extension NOT present in Oil editor.',
            );
        }
    });

    it('Spike 2b: verify vim presence WITHOUT prior MarkdownView (simulated)', async function () {
        const info = (await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            const debug = g.__embeddableEditorSpikeDebug as
                | SpikeDebugEntry[]
                | undefined;
            if (!debug || debug.length === 0)
                return { error: 'no debug entries' };

            const firstCall = debug[0];
            const builtinVimGuardResult =
                !firstCall.isBuiltinVimEnabledValue &&
                firstCall.isBundledVimActiveValue;

            const classBuild = g.__spikeClassBuildInfo as
                | ClassBuildInfo
                | undefined;
            const closureGuardResult = classBuild
                ? !classBuild.isVimEnabled && classBuild.isBundledVimActive
                : null;

            return {
                buildLocalExtensionsWouldAddVim: builtinVimGuardResult,
                closureGuardWouldAddVim: closureGuardResult,
                builtinVimOn_isVimEnabled: classBuild?.isVimEnabled ?? null,
                builtinVimOn_isBuiltinVimEnabled:
                    classBuild?.isBuiltinVimEnabled ?? null,
                problemB_confirmed:
                    classBuild?.isVimEnabled === true &&
                    classBuild?.isBuiltinVimEnabled === false,
            };
        })) as Record<string, unknown>;

        console.log(
            '=== SPIKE 2b: Guard logic analysis (Problem B verification) ===',
        );
        console.log(
            `  Would buildLocalExtensions add vim (if guard used isBuiltinVimEnabled): ${info.buildLocalExtensionsWouldAddVim}`,
        );
        console.log(
            `  Does current closure guard add vim (using isVimEnabled): ${info.closureGuardWouldAddVim}`,
        );
        console.log(
            `  builtinVimOn via isVimEnabled(): ${info.builtinVimOn_isVimEnabled}`,
        );
        console.log(
            `  builtinVimOn via isBuiltinVimEnabled(): ${info.builtinVimOn_isBuiltinVimEnabled}`,
        );
        console.log(
            `  Problem B confirmed (isVimEnabled=true, isBuiltinVimEnabled=false): ${info.problemB_confirmed}`,
        );
    });

    it('Spike 4: oilConcealExtension singleton check', async function () {
        const isSingleton = (await browser.executeObsidian(() => {
            try {
                const plugin = (
                    window as unknown as {
                        app?: {
                            plugins?: {
                                plugins?: Record<
                                    string,
                                    Record<string, unknown>
                                >;
                            };
                        };
                    }
                ).app?.plugins?.plugins?.['vim-motions'];
                if (!plugin) return { error: 'plugin not found' };

                return {
                    note: 'oilConcealExtension returns module-level StateField.define() - singleton by definition. Verified by code inspection.',
                    verified: true,
                };
            } catch (e) {
                return { error: String(e) };
            }
        })) as Record<string, unknown>;

        console.log('=== SPIKE 4: oilConcealExtension singleton ===');
        console.log(`  ${isSingleton.note ?? isSingleton.error}`);
        console.log(`  Verified: ${isSingleton.verified ?? false}`);
    });
});
