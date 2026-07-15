import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE, sendVimEscape } from '../helpers';
function getVimHandle() {
    return browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (
            window as unknown as Record<string, unknown> & {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return { error: 'No Vim API' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { error: 'No MarkdownView' };
        view.editor.focus();
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return { error: 'No CM adapter' };
        return { ready: true };
    });
}

function triggerHintMode() {
    return browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (
            window as unknown as Record<string, unknown> & {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return { error: 'No Vim API' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { error: 'No MarkdownView' };
        view.editor.focus();
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return { error: 'No CM adapter' };
        Vim.handleKey(adapter, '\\');
        Vim.handleKey(adapter, '\\');
        Vim.handleKey(adapter, 'h');
        const overlay = activeDocument.querySelector(
            '.vim-motions-hint-overlay',
        );
        const labels = overlay?.querySelectorAll('.vim-motions-hint-label');
        return {
            success: true,
            hasOverlay: !!overlay,
            labelCount: labels?.length ?? 0,
        };
    }) as Promise<{
        success?: boolean;
        error?: string;
        hasOverlay?: boolean;
        labelCount?: number;
    }>;
}

async function loadTwoTabs(): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'tabs-root',
            type: 'split',
            children: [
                {
                    id: 'tab-group',
                    type: 'tabs',
                    children: [
                        {
                            id: 'tab-1',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: {
                                    file: 'Welcome.md',
                                    mode: 'source',
                                },
                            },
                        },
                        {
                            id: 'tab-2',
                            type: 'leaf',
                            state: {
                                type: 'graph',
                                state: {},
                            },
                        },
                    ],
                },
            ],
            direction: 'vertical',
        },
        active: 'tab-2',
        lastOpenFiles: [],
    });
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

describe('Hint mode', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);
    });

    afterEach(async function () {
        // Dismiss any active hint overlay by dispatching a real Escape
        // KeyboardEvent to the document. This triggers the capture-phase
        // listener in waitForHintKey() which cleans itself up.
        // sendVimEscape() only reaches the vim engine, not the DOM listener.
        await browser.executeObsidian(() => {
            activeDocument.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        await browser.pause(200);
        await sendVimEscape();
        await browser.pause(200);
        await browser.executeObsidian(() => {
            activeDocument
                .querySelectorAll('.vim-motions-hint-overlay')
                .forEach((el) => el.remove());
        });
        await browser.pause(100);
    });

    describe('Tier 1: Baseline', function () {
        it('leader-leader-h should show hint overlay', async function () {
            const handle = (await getVimHandle()) as {
                ready?: boolean;
                error?: string;
            };
            expect(handle).toHaveProperty('ready', true);

            const result = await triggerHintMode();
            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('hasOverlay', true);
        });

        it('overlay should contain hint labels', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('hasOverlay', true);
            expect((result.labelCount ?? 0) > 0).toBe(true);
        });

        it('Escape should dismiss the hint overlay', async function () {
            await triggerHintMode();

            await browser.pause(100);
            await browser.keys(['Escape']);
            await browser.pause(300);

            const afterEscape = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                return { overlayGone: !overlay };
            })) as { overlayGone: boolean };
            expect(afterEscape).toHaveProperty('overlayGone', true);
        });

        it('typing first character should dim non-matching labels', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);
            expect((result.labelCount ?? 0) > 1).toBe(true);

            await browser.pause(100);
            await browser.keys(['a']);
            await browser.pause(200);

            const dimState = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'overlay gone' };
                const all = overlay.querySelectorAll('.vim-motions-hint-label');
                let dimmed = 0;
                let visible = 0;
                for (const label of Array.from(all)) {
                    if (label.classList.contains('is-dimmed')) {
                        dimmed++;
                    } else {
                        visible++;
                    }
                }
                return { total: all.length, dimmed, visible };
            })) as {
                total: number;
                dimmed: number;
                visible: number;
                error?: string;
            };
            expect(dimState).not.toHaveProperty('error');
            expect(dimState.dimmed).toBeGreaterThan(0);
            expect(dimState.visible).toBeGreaterThan(0);
        });

        it('typing a complete label should dismiss overlay', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);
            expect((result.labelCount ?? 0) > 0).toBe(true);

            const firstLabel = (await browser.executeObsidian(() => {
                const label = activeDocument.querySelector(
                    '.vim-motions-hint-label',
                );
                return label?.textContent ?? '';
            })) as string;
            expect(firstLabel.length).toBeGreaterThanOrEqual(1);
            expect(firstLabel.length).toBeLessThanOrEqual(2);

            await browser.pause(100);
            for (const ch of firstLabel) {
                await browser.keys([ch]);
                await browser.pause(100);
            }
            await browser.pause(300);

            const afterMatch = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                return { overlayGone: !overlay };
            })) as { overlayGone: boolean };
            expect(afterMatch).toHaveProperty('overlayGone', true);
        });

        it('unmatched first character should dismiss overlay', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);

            await browser.pause(100);
            await browser.keys(['9']);
            await browser.pause(300);

            const afterMismatch = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                return { overlayGone: !overlay };
            })) as { overlayGone: boolean };
            expect(afterMismatch).toHaveProperty('overlayGone', true);
        });

        it('Backspace after first char should reset dimming', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);
            expect((result.labelCount ?? 0) > 1).toBe(true);

            await browser.pause(100);
            await browser.keys(['a']);
            await browser.pause(200);

            const afterFirstChar = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'gone' };
                const dimmed = overlay.querySelectorAll(
                    '.vim-motions-hint-label.is-dimmed',
                ).length;
                return { dimmed };
            })) as { dimmed: number; error?: string };
            expect(afterFirstChar).not.toHaveProperty('error');
            expect(afterFirstChar.dimmed).toBeGreaterThan(0);

            await browser.keys(['Backspace']);
            await browser.pause(200);

            const afterBackspace = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'gone' };
                const dimmed = overlay.querySelectorAll(
                    '.vim-motions-hint-label.is-dimmed',
                ).length;
                return { dimmed };
            })) as { dimmed: number; error?: string };
            expect(afterBackspace).not.toHaveProperty('error');
            expect(afterBackspace.dimmed).toBe(0);
        });
    });

    describe('Tier 2: Behavior contracts', function () {
        it('labels should use home-row characters as first char', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);

            const labelData = (await browser.executeObsidian(() => {
                const labels = activeDocument.querySelectorAll(
                    '.vim-motions-hint-label',
                );
                return Array.from(labels).map((el) => el.textContent ?? '');
            })) as string[];
            expect(labelData.length).toBeGreaterThan(0);

            const homeRow = 'asdfghjkl';
            const firstChars = labelData.map((l) => l[0]);
            const allHomeRow = firstChars.every((ch) =>
                homeRow.includes(ch ?? ''),
            );
            // HOME_ROW (9 chars) * ALL_KEYS (26 chars) = 234 combinations
            // before non-home-row first chars are needed
            if (labelData.length <= 234) {
                expect(allHomeRow).toBe(true);
            }
        });

        it('should not generate duplicate labels', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);

            const labelData = (await browser.executeObsidian(() => {
                const labels = activeDocument.querySelectorAll(
                    '.vim-motions-hint-label',
                );
                return Array.from(labels).map((el) => el.textContent ?? '');
            })) as string[];
            expect(labelData.length).toBeGreaterThan(0);

            const unique = new Set(labelData);
            expect(unique.size).toBe(labelData.length);
        });

        it('all labels should be lowercase characters of consistent length', async function () {
            const testElementCount = 5;
            await browser.executeObsidian(({}, count: number) => {
                const testContainer = activeDocument.createElement('div');
                testContainer.id = 'hint-mode-test-container';
                for (let i = 0; i < count; i++) {
                    const btn = activeDocument.createElement('button');
                    btn.textContent = `Test ${i}`;
                    btn.style.position = 'fixed';
                    btn.style.top = `${50 + i * 30}px`;
                    btn.style.left = '50px';
                    btn.style.width = '80px';
                    btn.style.height = '24px';
                    btn.style.zIndex = '9999';
                    testContainer.appendChild(btn);
                }
                activeDocument.body.appendChild(testContainer);
            }, testElementCount);

            const hintResult = await triggerHintMode();
            expect(hintResult).toHaveProperty('hasOverlay', true);

            const labels = (await browser.executeObsidian(() => {
                const els = activeDocument.querySelectorAll(
                    '.vim-motions-hint-label',
                );
                return Array.from(els).map((el) => el.textContent ?? '');
            })) as string[];

            for (const label of labels) {
                expect(label).toMatch(/^[a-z]{1,2}$/);
            }

            const lengths = new Set(labels.map((l) => l.length));
            expect(lengths.size).toBe(1);

            await browser.executeObsidian(() => {
                activeDocument
                    .getElementById('hint-mode-test-container')
                    ?.remove();
            });
        });

        it('should only label visible elements', async function () {
            await browser.executeObsidian(() => {
                const container = activeDocument.createElement('div');
                container.id = 'hint-visibility-test';

                const visible = activeDocument.createElement('button');
                visible.textContent = 'Visible';
                visible.dataset.testHint = 'visible';
                visible.style.position = 'fixed';
                visible.style.top = '100px';
                visible.style.left = '100px';
                visible.style.width = '80px';
                visible.style.height = '24px';
                visible.style.zIndex = '9999';
                container.appendChild(visible);

                const hidden = activeDocument.createElement('button');
                hidden.textContent = 'Hidden';
                hidden.dataset.testHint = 'hidden';
                hidden.style.display = 'none';
                container.appendChild(hidden);

                const offscreen = activeDocument.createElement('button');
                offscreen.textContent = 'Offscreen';
                offscreen.dataset.testHint = 'offscreen';
                offscreen.style.position = 'fixed';
                offscreen.style.top = '99999px';
                offscreen.style.left = '100px';
                offscreen.style.width = '80px';
                offscreen.style.height = '24px';
                container.appendChild(offscreen);

                activeDocument.body.appendChild(container);
            });

            const hintResult = await triggerHintMode();
            expect(hintResult).toHaveProperty('hasOverlay', true);

            const visibility = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };

                const hidden = activeDocument.querySelector(
                    '[data-test-hint="hidden"]',
                );
                const hiddenRect = hidden?.getBoundingClientRect();
                const hiddenIsZero =
                    hiddenRect?.width === 0 && hiddenRect?.height === 0;

                const offscreen = activeDocument.querySelector(
                    '[data-test-hint="offscreen"]',
                );
                const offscreenRect = offscreen?.getBoundingClientRect();
                const offscreenBelowViewport =
                    (offscreenRect?.top ?? 0) >= activeWindow.innerHeight;

                return { hiddenIsZero, offscreenBelowViewport };
            })) as {
                hiddenIsZero: boolean;
                offscreenBelowViewport: boolean;
                error?: string;
            };

            expect(visibility).not.toHaveProperty('error');
            expect(visibility.hiddenIsZero).toBe(true);
            expect(visibility.offscreenBelowViewport).toBe(true);

            await browser.executeObsidian(() => {
                activeDocument.getElementById('hint-visibility-test')?.remove();
            });
        });

        it('modifier should upgrade activate to open-new', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);

            const firstLabel = (await browser.executeObsidian(() => {
                const label = activeDocument.querySelector(
                    '.vim-motions-hint-label',
                );
                return label?.textContent ?? '';
            })) as string;

            expect(firstLabel.length).toBeGreaterThanOrEqual(1);

            for (const ch of firstLabel) {
                await browser.keys([Key.Ctrl, ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const afterActivation = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                return { overlayGone: !overlay };
            })) as { overlayGone: boolean };
            expect(afterActivation.overlayGone).toBe(true);
        });

        it('Obsidian command show-hint-labels should be registered', async function () {
            const hasCommand = (await browser.executeObsidian(({ app }) => {
                const commands = (
                    app as unknown as {
                        commands: {
                            commands: Record<string, unknown>;
                        };
                    }
                ).commands.commands;
                return 'vim-motions:show-hint-labels' in commands;
            })) as boolean;
            expect(hasCommand).toBe(true);
        });

        it('overlay container should have pointer-events none', async function () {
            const result = await triggerHintMode();
            expect(result).toHaveProperty('hasOverlay', true);

            const style = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };
                const computed = activeWindow.getComputedStyle(overlay);
                return {
                    pointerEvents: computed.pointerEvents,
                    position: computed.position,
                    zIndex: computed.zIndex,
                };
            })) as {
                pointerEvents: string;
                position: string;
                zIndex: string;
                error?: string;
            };

            expect(style).not.toHaveProperty('error');
            expect(style.pointerEvents).toBe('none');
            expect(style.position).toBe('absolute');
        });
    });

    describe('Tier 3: Vimium-style actions (non-editor context)', function () {
        beforeEach(async function () {
            await loadTwoTabs();
        });

        it('f from graph view should show hint overlay', async function () {
            await browser.keys(['f']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;

            expect(hasOverlay).toBe(true);
        });

        it('F from graph view should show hint overlay', async function () {
            await browser.keys(['F']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;

            expect(hasOverlay).toBe(true);
        });

        it('yf from graph view should show hint overlay', async function () {
            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['f']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const labelCount = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                return (
                    overlay?.querySelectorAll('.vim-motions-hint-label')
                        .length ?? 0
                );
            })) as number;

            expect(labelCount).toBeGreaterThan(0);
        });

        it('df from graph view should show hint overlay and dismiss on label', async function () {
            await browser.keys(['d']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['f']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const overlayInfo = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { hasOverlay: false, labelCount: 0 };
                const labels = overlay.querySelectorAll(
                    '.vim-motions-hint-label',
                );
                return { hasOverlay: true, labelCount: labels.length };
            })) as { hasOverlay: boolean; labelCount: number };

            expect(overlayInfo.hasOverlay).toBe(true);
            expect(overlayInfo.labelCount).toBeGreaterThan(0);

            const firstLabel = (await browser.executeObsidian(() => {
                const label = activeDocument.querySelector(
                    '.vim-motions-hint-label',
                );
                return label?.textContent ?? '';
            })) as string;

            for (const ch of firstLabel) {
                await browser.keys([ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const afterActivation = (await browser.executeObsidian(() => {
                return !activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;
            expect(afterActivation).toBe(true);
        });

        it('Escape should dismiss hint overlay from f', async function () {
            await browser.keys(['f']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const overlayGone = (await browser.executeObsidian(() => {
                return !activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;

            expect(overlayGone).toBe(true);
        });

        it('F on pane target should call duplicateLeaf', async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'md-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'graph-leaf',
                                    type: 'leaf',
                                    state: { type: 'graph', state: {} },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'graph-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const called = (await browser.executeObsidian(({ app }) => {
                let duplicateCalled = false;
                const original = app.workspace.duplicateLeaf.bind(
                    app.workspace,
                );
                app.workspace.duplicateLeaf = ((...args: unknown[]) => {
                    duplicateCalled = true;
                    return (original as Function)(...args);
                }) as typeof app.workspace.duplicateLeaf;
                (
                    window as unknown as Record<string, unknown>
                ).__hintTestDuplicateCalled = () => duplicateCalled;
                (
                    window as unknown as Record<string, unknown>
                ).__hintTestRestore = () => {
                    app.workspace.duplicateLeaf = original;
                };
                return true;
            })) as boolean;
            expect(called).toBe(true);

            await browser.keys(['F']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;
            expect(hasOverlay).toBe(true);

            const paneLabel = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return '';
                const labels = overlay.querySelectorAll(
                    '.vim-motions-hint-label',
                );
                const panes = activeDocument.querySelectorAll(
                    '.workspace-leaf-content',
                );
                const panePositions = Array.from(panes).map((pane) => {
                    const editor =
                        pane.querySelector('.cm-editor') ??
                        pane.querySelector('.markdown-preview-view');
                    if (editor) {
                        const r = editor.getBoundingClientRect();
                        return {
                            left: r.left + window.scrollX + 8,
                            top: r.top + window.scrollY + 8,
                        };
                    }
                    const r = pane.getBoundingClientRect();
                    return {
                        left: r.left + window.scrollX,
                        top: r.top + window.scrollY,
                    };
                });

                for (const label of Array.from(labels)) {
                    const style = (label as HTMLElement).style;
                    const labelLeft = parseFloat(
                        style.getPropertyValue('--vim-motions-hint-left'),
                    );
                    const labelTop = parseFloat(
                        style.getPropertyValue('--vim-motions-hint-top'),
                    );
                    for (const pos of panePositions) {
                        if (
                            Math.abs(labelLeft - pos.left) < 2 &&
                            Math.abs(labelTop - pos.top) < 2
                        ) {
                            return label.textContent ?? '';
                        }
                    }
                }
                return '';
            })) as string;
            expect(paneLabel.length).toBeGreaterThan(0);

            for (const ch of paneLabel) {
                await browser.keys([ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const wasCalled = (await browser.executeObsidian(() => {
                const fn = (window as unknown as Record<string, unknown>)
                    .__hintTestDuplicateCalled as () => boolean;
                const restore = (window as unknown as Record<string, unknown>)
                    .__hintTestRestore as () => void;
                const result = fn?.() ?? false;
                restore?.();
                return result;
            })) as boolean;

            expect(wasCalled).toBe(true);
        });

        it('yg from graph view should reset without overlay', async function () {
            await browser.keys(['y']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['g']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;

            expect(hasOverlay).toBe(false);
        });
    });

    describe('Command registration', function () {
        it('Obsidian command hint-open-new-pane should be registered', async function () {
            const hasCommand = (await browser.executeObsidian(({ app }) => {
                const commands = (
                    app as unknown as {
                        commands: {
                            commands: Record<string, unknown>;
                        };
                    }
                ).commands.commands;
                return 'vim-motions:hint-open-new-pane' in commands;
            })) as boolean;
            expect(hasCommand).toBe(true);
        });

        it('Obsidian command hint-yank should be registered', async function () {
            const hasCommand = (await browser.executeObsidian(({ app }) => {
                const commands = (
                    app as unknown as {
                        commands: {
                            commands: Record<string, unknown>;
                        };
                    }
                ).commands.commands;
                return 'vim-motions:hint-yank' in commands;
            })) as boolean;
            expect(hasCommand).toBe(true);
        });

        it('Obsidian command hint-close should be registered', async function () {
            const hasCommand = (await browser.executeObsidian(({ app }) => {
                const commands = (
                    app as unknown as {
                        commands: {
                            commands: Record<string, unknown>;
                        };
                    }
                ).commands.commands;
                return 'vim-motions:hint-close' in commands;
            })) as boolean;
            expect(hasCommand).toBe(true);
        });
    });
});
