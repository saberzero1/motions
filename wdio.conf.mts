import * as path from 'path';
import * as fs from 'fs';
import { browser } from '@wdio/globals';

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: ['./test/specs/**/*.e2e.ts'],
    maxInstances: 1,

    capabilities: [
        {
            browserName: 'obsidian',
            browserVersion: 'latest',
            'wdio:obsidianOptions': {
                installerVersion: 'earliest',
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

    async afterTest() {
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
                    document
                        .querySelectorAll(
                            '.vim-motions-picker, .vim-motions-hint-overlay, ' +
                                '.vim-motions-easymotion, .vim-motions-which-key',
                        )
                        .forEach((el) => el.remove());

                    document
                        .querySelectorAll('.modal-container')
                        .forEach((el) => el.remove());
                });
                await browser.pause(50);
            }
        } catch {
            /* best-effort cleanup */
        }
    },
};
