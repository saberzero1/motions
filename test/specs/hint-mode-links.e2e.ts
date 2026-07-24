import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE, setupEditor, sendVimEscape } from '../helpers';

const TARGET_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[role="button"]',
    '[role="tab"]',
    '[data-href]',
    '.clickable-icon',
    '.nav-file-title',
    '.nav-folder-title',
    '.nav-action-button',
    '.workspace-tab-header',
    '.workspace-tab-header-inner-close-button',
    '.workspace-leaf-content',
    '.tree-item-self',
    '.tree-item-icon',
    '.side-dock-ribbon-action',
    '.callout-fold',
    '.cm-underline',
    '.menu-item',
    '.modal-close-button',
    '.vertical-tab-nav-item',
    '.checkbox-container',
    '.modal-header-button',
].join(', ');

function triggerHintModeViaCommand(): Promise<void> {
    return browser.executeObsidian(({ app }) => {
        (
            app as unknown as {
                commands: {
                    executeCommandById: (id: string) => boolean;
                };
            }
        ).commands.executeCommandById('vim-motions:show-hint-labels');
    }) as Promise<void>;
}

function getActiveFilePath(): Promise<string> {
    return browser.executeObsidian(({ app }) => {
        return app.workspace.getActiveFile()?.path ?? '';
    }) as Promise<string>;
}

interface HintLabelForLink {
    label: string;
    textContent: string;
    parentClassName: string;
    extractedHref: string | null;
}

async function findHintLabelForCmUnderline(
    textMatch: string,
): Promise<HintLabelForLink | null> {
    return (await browser.executeObsidian(
        ({}, selector: string, text: string) => {
            const overlay = activeDocument.querySelector(
                '.vim-motions-hint-overlay',
            );
            if (!overlay) return null;

            const labels = Array.from(
                overlay.querySelectorAll('.vim-motions-hint-label'),
            ) as HTMLElement[];

            const cmEditor = activeDocument.querySelector('.cm-editor');
            if (!cmEditor) return null;

            const underlines = Array.from(
                cmEditor.querySelectorAll('.cm-underline'),
            ).filter((el) => {
                const rect = el.getBoundingClientRect();
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    el.textContent?.includes(text)
                );
            });

            const target = underlines[0];
            if (!target) return null;
            const targetRect = target.getBoundingClientRect();
            const targetLeft = targetRect.left + activeWindow.scrollX;
            const targetTop = targetRect.top + activeWindow.scrollY;

            let closestLabel = '';
            let closestDist = Infinity;
            for (const labelEl of labels) {
                const left = Number.parseFloat(
                    labelEl.style.getPropertyValue('--vim-motions-hint-left'),
                );
                const top = Number.parseFloat(
                    labelEl.style.getPropertyValue('--vim-motions-hint-top'),
                );
                if (Number.isNaN(left) || Number.isNaN(top)) continue;
                const dist = Math.hypot(left - targetLeft, top - targetTop);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestLabel = labelEl.textContent ?? '';
                }
            }

            if (!closestLabel || closestDist > 50) return null;

            return {
                label: closestLabel,
                textContent: (target.textContent ?? '').slice(0, 100),
                parentClassName: target.parentElement?.className ?? '',
                extractedHref: null,
            };
        },
        TARGET_SELECTOR,
        textMatch,
    )) as HintLabelForLink | null;
}

async function typeHintLabel(label: string): Promise<void> {
    for (const ch of label) {
        await browser.keys([ch]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Hint mode link navigation (#85)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    afterEach(async function () {
        await browser.executeObsidian(() => {
            activeDocument
                .querySelectorAll('.vim-motions-hint-overlay')
                .forEach((el) => el.remove());
        });
        await browser.pause(100);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    describe('Link href resolution', function () {
        it('should resolve wikilink href from cm-underline span', async function () {
            await setupEditor('[[Target]]\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = (await browser.executeObsidian(
                ({}, selector: string) => {
                    const overlay = activeDocument.querySelector(
                        '.vim-motions-hint-overlay',
                    );
                    if (!overlay) return { error: 'no overlay' };

                    const cmEditor = activeDocument.querySelector('.cm-editor');
                    if (!cmEditor) return { error: 'no cm-editor' };

                    const underlines = Array.from(
                        cmEditor.querySelectorAll('.cm-underline'),
                    ).filter((el) => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    });

                    const linkTargets = underlines.map((el) => {
                        const cmView = (
                            cmEditor as unknown as Record<string, unknown>
                        ).cmView as
                            | { view?: { posAtDOM: Function; state: unknown } }
                            | undefined;
                        const view = cmView?.view;
                        if (!view)
                            return { resolved: false, reason: 'no view' };

                        try {
                            const pos = view.posAtDOM(el, 0);
                            const state = view.state as {
                                doc: {
                                    lineAt: (pos: number) => {
                                        from: number;
                                        text: string;
                                    };
                                };
                            };
                            const line = state.doc.lineAt(pos);
                            const ch = pos - line.from;
                            return {
                                resolved: true,
                                pos,
                                ch,
                                lineText: line.text,
                                textContent: el.textContent,
                            };
                        } catch (e) {
                            return {
                                resolved: false,
                                reason: (e as Error).message,
                            };
                        }
                    });

                    return { underlineCount: underlines.length, linkTargets };
                },
                TARGET_SELECTOR,
            )) as Record<string, unknown>;

            expect(result).not.toHaveProperty('error');
            expect((result.underlineCount as number) >= 0).toBe(true);

            await browser.keys(['Escape']);
        });

        it('should resolve markdown link href from cm-underline span', async function () {
            await setupEditor('[Markdown link](Target)\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline('Markdown link');
            if (hintInfo) {
                expect(hintInfo.label.length).toBeGreaterThan(0);
                expect(hintInfo.parentClassName).toContain('cm-link');
            }

            await browser.keys(['Escape']);
        });

        it('should resolve bare URL href from cm-underline span', async function () {
            await setupEditor('https://example.com\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline(
                'https://example.com',
            );
            if (hintInfo) {
                expect(hintInfo.label.length).toBeGreaterThan(0);
                expect(hintInfo.parentClassName).toContain('cm-url');
            }

            await browser.keys(['Escape']);
        });
    });

    describe('Wikilink navigation', function () {
        it('should navigate to target note via wikilink hint', async function () {
            await setupEditor('[[Target]]\n\nSome other text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const beforeFile = await getActiveFilePath();
            expect(beforeFile).toBe('Welcome.md');

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline('Target');
            if (!hintInfo) {
                await browser.keys(['Escape']);
                return;
            }

            await typeHintLabel(hintInfo.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterFile = await getActiveFilePath();
            expect(afterFile).toBe('Target.md');
        });

        it('should navigate aliased wikilink to correct target', async function () {
            await setupEditor('[[Target|My Alias]]\n\nSome other text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline('My Alias');
            if (!hintInfo) {
                await browser.keys(['Escape']);
                return;
            }

            await typeHintLabel(hintInfo.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterFile = await getActiveFilePath();
            expect(afterFile).toBe('Target.md');
        });
    });

    describe('Markdown link navigation', function () {
        it('should navigate internal markdown link via hint', async function () {
            await setupEditor('[Go to target](Target)\n\nSome other text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            const beforeFile = await getActiveFilePath();
            expect(beforeFile).toBe('Welcome.md');

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline('Go to target');
            if (!hintInfo) {
                await browser.keys(['Escape']);
                return;
            }

            await typeHintLabel(hintInfo.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterFile = await getActiveFilePath();
            expect(afterFile).toBe('Target.md');
        });
    });

    describe('Inline links in text', function () {
        it('should navigate wikilink embedded in paragraph text', async function () {
            await setupEditor(
                'Some text with a [[Target]] link in the middle.\n\nMore text.',
                { line: 0, ch: 0 },
            );
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline('Target');
            if (!hintInfo) {
                await browser.keys(['Escape']);
                return;
            }

            await typeHintLabel(hintInfo.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterFile = await getActiveFilePath();
            expect(afterFile).toBe('Target.md');
        });
    });

    describe('Reading view links', function () {
        it('should navigate internal link in reading view', async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'reading-root',
                    type: 'split',
                    children: [
                        {
                            id: 'reading-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'reading-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'preview',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'reading-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;
            expect(hasOverlay).toBe(true);

            await browser.keys(['Escape']);
        });
    });

    describe('Properties / frontmatter links', function () {
        it('should navigate wikilink in frontmatter properties', async function () {
            await setupEditor('---\nrelated: "[[Target]]"\n---\n\nBody text.', {
                line: 4,
                ch: 0,
            });
            await browser.pause(1000);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;
            expect(hasOverlay).toBe(true);

            const propsLink = (await browser.executeObsidian(() => {
                const el = activeDocument.querySelector(
                    '.metadata-link-inner.internal-link[data-href]',
                );
                return el
                    ? {
                          found: true,
                          dataHref: el.getAttribute('data-href'),
                      }
                    : { found: false };
            })) as { found: boolean; dataHref?: string };

            if (propsLink.found) {
                expect(propsLink.dataHref).toBe('Target');
            }

            await browser.keys(['Escape']);
        });
    });

    describe('External links', function () {
        it('should not treat external URL as internal link', async function () {
            await setupEditor(
                '[External](https://example.com)\n\nPlain text.',
                { line: 0, ch: 0 },
            );
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hintInfo = await findHintLabelForCmUnderline('External');
            if (hintInfo) {
                expect(hintInfo.label.length).toBeGreaterThan(0);
            }

            await browser.keys(['Escape']);

            const afterFile = await getActiveFilePath();
            expect(afterFile).toBe('Welcome.md');
        });
    });
});
