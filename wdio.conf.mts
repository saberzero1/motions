import * as path from 'path';
import * as fs from 'fs';
import { browser } from '@wdio/globals';
// Type-only, erased at runtime. This file uses WebdriverIO.Config and
// browser.executeObsidian, both of which are `declare global` augmentations
// that only load if their package is imported. Without these the file reports
// 22 errors; it reported none only because nothing type-checked it.
import type {} from 'webdriverio';
import type {} from 'wdio-obsidian-service';

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: ['./test/specs/**/*.e2e.ts'],
    maxInstances: 1,

    capabilities: [
        {
            browserName: 'obsidian',
            browserVersion: '1.13.7',
            'wdio:obsidianOptions': {
                // `earliest` is the minimum-supported-installer policy, and
                // Linux and macOS keep it. On Windows, from runner image
                // windows-2025 20261021, the 1.5.8 installer's GPU process
                // (Electron 28, Chrome 120) exits with STATUS_ACCESS_VIOLATION
                // about every 2.3 s from launch; on the ninth crash Chromium
                // ends the browser ("GPU process isn't usable. Goodbye."), so
                // every spec dies about 20 s in as "not connected to
                // DevTools". The latest installer (Electron 43) recorded no
                // GPU crashes at all, against 13 for 1.5.8 in the same spec.
                installerVersion:
                    process.platform === 'win32' ? 'latest' : 'earliest',
                plugins: [
                    '.',
                    { id: 'omnisearch', enabled: false },
                    { id: 'obsidian-tasks-plugin', enabled: false },
                    { id: 'dataview', enabled: false },
                    { id: 'obsidian-meta-bind-plugin', enabled: false },
                ],
                vault: 'test-vault',
            },
        },
    ],

    services: ['obsidian'],
    reporters: ['obsidian'],
    cacheDir: path.resolve('.obsidian-cache'),

    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
    },
    waitforInterval: 250,
    waitforTimeout: 5000,
    // A renderer busy longer than the HTTP client's patience kills the
    // WebDriver session, and the death surfaces in whichever hook runs next
    // rather than at the call that stalled: rpc-structural-nav reported
    // UND_ERR_HEADERS_TIMEOUT on execute/sync, then invalid session id in
    // afterEach, burying the real failure under an unrelated one. A slow
    // renderer should produce a slow pass; the per-test mocha timeout above
    // still bounds a genuine hang.
    connectionRetryTimeout: 180000,
    connectionRetryCount: 3,
    logLevel: 'warn',
    injectGlobals: false,

    onPrepare() {
        const workspace = path.resolve('test-vault/.obsidian/workspace.json');
        try {
            fs.unlinkSync(workspace);
        } catch {
            /* may not exist */
        }
    },

    async beforeSuite() {
        // Eight cold macOS starts correlated perfectly: the two that failed had
        // document.hasFocus() false, all six that passed had it true. An
        // unfocused window means CodeMirror never registers focus, Live Preview
        // keeps callouts rendered as widgets, and anything asserting on
        // decorated content fails while the document itself is correct.
        // Re-calling editor.focus() cannot fix it; the window has to be raised.
        // A real user's window is focused, so this restores the real condition
        // rather than skipping the tests.
        try {
            const puppeteer = (await (
                browser as unknown as {
                    getPuppeteer(): Promise<{ pages(): Promise<unknown[]> }>;
                }
            ).getPuppeteer()) as { pages(): Promise<unknown[]> };
            const pages = await puppeteer.pages();
            const page = pages[0] as {
                target(): {
                    createCDPSession(): Promise<{
                        send(method: string): Promise<unknown>;
                    }>;
                };
            };
            const session = await page.target().createCDPSession();
            await session.send('Page.bringToFront');
        } catch {
            /* best effort: without focus the suite still runs, just flakily */
        }

        // bringToFront addresses the renderer, not the OS window, so it is not
        // enough on its own. Focus does arrive on a cold start, just not
        // immediately, so wait for it: measured over eight cold macOS starts
        // per cluster, document.hasFocus() matched the outcome every time, for
        // the fold specs and the animated-cursor specs alike. Waiting cleared
        // the fold failures outright.
        // window.focus() alone was not enough for the canvas specs; asking
        // Electron to raise the window is what worked there. Specs that reload
        // Obsidian discard this and call ensureWindowFocused after their own
        // load, but specs that do not reload only get this one.
        try {
            await browser.waitUntil(
                async () =>
                    browser.execute(() => {
                        if (!document.hasFocus()) {
                            try {
                                const electron = (
                                    window as unknown as {
                                        require?: (m: string) => unknown;
                                    }
                                ).require?.('electron') as
                                    | {
                                          remote?: {
                                              getCurrentWindow?: () => {
                                                  focus?: () => void;
                                              };
                                          };
                                      }
                                    | undefined;
                                electron?.remote
                                    ?.getCurrentWindow?.()
                                    ?.focus?.();
                            } catch {
                                /* not available in every host */
                            }
                            window.focus();
                        }
                        return document.hasFocus();
                    }),
                { timeout: 5000, interval: 250 },
            );
        } catch {
            /* a window that never gains focus is reported by the specs */
        }

        try {
            const hasToggle = await browser.executeObsidian(({ app }) => {
                return !!(
                    app as unknown as {
                        commands: { commands: Record<string, unknown> };
                    }
                ).commands.commands['vim-motions:disable-vim-mode'];
            });
            if (!hasToggle) return;

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: { executeCommandById(id: string): void };
                    }
                ).commands.executeCommandById('vim-motions:disable-vim-mode');
            });
            await browser.pause(800);

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: { executeCommandById(id: string): void };
                    }
                ).commands.executeCommandById('vim-motions:enable-vim-mode');
            });
            await browser.pause(800);
        } catch {
            /* toggle commands may not be available in all test configurations */
        }
    },

    async beforeTest() {
        try {
            await browser.executeObsidian(({ obsidian }) => {
                type ModalInstance = InstanceType<typeof obsidian.Modal>;
                type ModalTracker = {
                    instances: Set<ModalInstance>;
                };
                const trackedWindow = window as unknown as {
                    __wdioModalTracker?: ModalTracker;
                };
                if (trackedWindow.__wdioModalTracker) return;

                const tracker: ModalTracker = { instances: new Set() };
                const prototype = obsidian.Modal.prototype;
                const realOpen = prototype.open;
                const realClose = prototype.close;
                prototype.open = function (this: ModalInstance): void {
                    tracker.instances.add(this);
                    realOpen.call(this);
                };
                prototype.close = function (this: ModalInstance): void {
                    try {
                        realClose.call(this);
                    } finally {
                        tracker.instances.delete(this);
                    }
                };
                trackedWindow.__wdioModalTracker = tracker;
            });
        } catch {
            /* best-effort modal tracking */
        }
    },

    // Every failing test now reports the discriminators that identified the
    // clusters we did solve, so a future failure classifies itself instead of
    // costing a round trip per hypothesis. Focus separated the fold and canvas
    // clusters; a dead Neovim child separated the RPC ones; document size and
    // reduced motion each looked decisive until the passing rows excluded
    // them. Guarded throughout: a failing probe must not replace the failure
    // it describes.
    async afterTest(
        test: { title?: string },
        _context: unknown,
        result: { passed?: boolean },
    ) {
        if (result && result.passed === false) {
            try {
                const diag = await browser.execute(() => {
                    const canvases = document.querySelectorAll(
                        '.vim-motions-animated-cursor-canvas',
                    );
                    const w = window as unknown as {
                        app?: {
                            workspace?: {
                                activeEditor?: {
                                    editor?: { getValue(): string };
                                };
                            };
                        };
                    };
                    let docLength: number | string = 'n/a';
                    try {
                        docLength =
                            w.app?.workspace?.activeEditor?.editor?.getValue()
                                .length ?? -1;
                    } catch (e) {
                        docLength = `threw: ${String(e)}`;
                    }
                    return {
                        docHasFocus: document.hasFocus(),
                        cmFocused: !!document.querySelector(
                            '.cm-editor.cm-focused',
                        ),
                        activeEl: document.activeElement?.tagName ?? '?',
                        calloutWidget: !!document.querySelector(
                            '.cm-embed-block.cm-callout',
                        ),
                        cursorCanvases: canvases.length,
                        foldPlaceholders: document.querySelectorAll(
                            '.cm-foldPlaceholder',
                        ).length,
                        reducedMotion: window.matchMedia(
                            '(prefers-reduced-motion: reduce)',
                        ).matches,
                        docLength,
                        window: `${window.innerWidth}x${window.innerHeight}`,
                        // handleClose already formats the child's exit code or
                        // signal into a Notice, and NVIM_LOG_FILE stayed empty
                        // in a local reproduction because Neovim writes that
                        // log only for some levels. The Notice is the reason
                        // the plugin itself derived, so read that.
                        notices: Array.from(
                            document.querySelectorAll('.notice'),
                        )
                            .map((n) => (n.textContent ?? '').slice(0, 120))
                            .slice(0, 4),
                    };
                });
                console.log(
                    'FAILDIAG ' +
                        JSON.stringify({
                            test: (test?.title ?? '?').slice(0, 60),
                            ...diag,
                        }),
                );
            } catch (error) {
                console.log(
                    'FAILDIAG ' +
                        JSON.stringify({
                            test: (test?.title ?? '?').slice(0, 60),
                            unavailable: String(error).slice(0, 120),
                        }),
                );
            }
        }

        try {
            await browser.executeObsidian(({ app, obsidian }) => {
                const overlaySelectors = [
                    '.vim-motions-hint-overlay',
                    '.vim-motions-easymotion',
                    '.vim-motions-easymotion-shade',
                    '.vim-motions-which-key',
                    '.vim-motions-ex-suggest',
                ];
                for (const sel of overlaySelectors) {
                    document.querySelectorAll(sel).forEach((el) => el.remove());
                }

                document
                    .querySelectorAll('.notice')
                    .forEach((el) => el.remove());

                const pickerInput = document.querySelector(
                    '.vim-motions-picker-input',
                ) as HTMLInputElement | null;
                if (pickerInput) {
                    pickerInput.dispatchEvent(
                        new KeyboardEvent('keydown', {
                            key: 'Escape',
                            bubbles: true,
                        }),
                    );
                }

                document.querySelectorAll('.modal-container').forEach((el) => {
                    const closeBtn = el.querySelector('.modal-close-button');
                    if (closeBtn instanceof HTMLElement) closeBtn.click();
                });

                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (Vim) {
                    const vimState = (
                        adapter.state as Record<string, unknown> | undefined
                    )?.vim as Record<string, unknown> | undefined;
                    if (vimState?.insertMode || vimState?.visualMode) {
                        Vim.handleKey(adapter, '<Esc>');
                    }
                }
            });

            await browser.pause(100);

            const remnants = (await browser.executeObsidian(() => {
                return {
                    picker: !!document.querySelector('.vim-motions-picker'),
                    modal: !!document.querySelector('.modal-container'),
                    overlay:
                        !!document.querySelector('.vim-motions-hint-overlay') ||
                        !!document.querySelector('.vim-motions-easymotion') ||
                        !!document.querySelector('.vim-motions-which-key'),
                };
            })) as { picker: boolean; modal: boolean; overlay: boolean };

            if (remnants.picker || remnants.modal || remnants.overlay) {
                await browser.executeObsidian(() => {
                    const tracker = (
                        window as unknown as {
                            __wdioModalTracker?: {
                                instances: Set<{
                                    containerEl: HTMLElement;
                                    close(): void;
                                }>;
                            };
                        }
                    ).__wdioModalTracker;
                    for (const modal of Array.from(tracker?.instances ?? [])) {
                        if (!modal.containerEl.isConnected) {
                            tracker?.instances.delete(modal);
                            continue;
                        }
                        try {
                            modal.close();
                        } catch {
                            tracker?.instances.delete(modal);
                        }
                    }

                    document
                        .querySelectorAll(
                            '.vim-motions-picker, .vim-motions-hint-overlay, ' +
                                '.vim-motions-easymotion, .vim-motions-which-key',
                        )
                        .forEach((el) => el.remove());
                });
                await browser.pause(50);

                await browser.executeObsidian(() => {
                    document
                        .querySelectorAll('.modal-container')
                        .forEach((el) => el.remove());
                });
            }
        } catch {
            /* best-effort cleanup */
        }
    },
};
