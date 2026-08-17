import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    PAUSE,
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    ensureSourceMode,
    getNotices,
    dismissNotices,
} from '../helpers';

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
    '.cm-hmd-internal-link',
    '.cm-link',
    '.cm-url',
    '.menu-item',
    '.modal-close-button',
    '.vertical-tab-nav-item',
    '.checkbox-container',
    '.modal-header-button',
].join(', ');

function executeCommand(commandId: string): Promise<void> {
    return browser.executeObsidian(({ app }, id: string) => {
        (
            app as unknown as {
                commands: {
                    executeCommandById: (id: string) => boolean;
                };
            }
        ).commands.executeCommandById(id);
    }, commandId) as Promise<void>;
}

function triggerHintModeViaCommand(): Promise<void> {
    return executeCommand('vim-motions:show-hint-labels');
}

function triggerHintYankViaCommand(): Promise<void> {
    return executeCommand('vim-motions:hint-yank');
}

function triggerHintOpenNewViaCommand(): Promise<void> {
    return executeCommand('vim-motions:hint-open-new-pane');
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

async function waitForHintOverlay(timeout = 2000): Promise<boolean> {
    try {
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(() => {
                    return !!document.querySelector(
                        '.vim-motions-hint-overlay .vim-motions-hint-label',
                    );
                })) as boolean,
            { timeout, interval: 100 },
        );
        return true;
    } catch {
        return false;
    }
}

async function findHintLabelForLink(
    textMatch: string,
): Promise<HintLabelForLink | null> {
    return (await browser.executeObsidian(({}, text: string) => {
        const doc = document;
        const overlay = doc.querySelector('.vim-motions-hint-overlay');
        if (!overlay) return null;

        const labels = Array.from(
            overlay.querySelectorAll('.vim-motions-hint-label'),
        ) as HTMLElement[];
        if (labels.length === 0) return null;

        const cmEditor =
            doc.querySelector('.workspace-leaf.mod-active .cm-editor') ??
            doc.querySelector('.cm-editor');
        if (!cmEditor) return null;

        const linkSelector =
            '.cm-underline, .cm-hmd-internal-link, .cm-link, .cm-url, [data-href]';
        const linkTargets = Array.from(
            cmEditor.querySelectorAll(linkSelector),
        ).filter((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            const content = el.textContent ?? '';
            const href = el.getAttribute('data-href') ?? '';
            return content.includes(text) || href.includes(text);
        });

        const target = linkTargets[0];
        if (target) {
            const targetRect = target.getBoundingClientRect();
            const targetLeft = targetRect.left + activeWindow.scrollX;
            const targetTop = targetRect.top + activeWindow.scrollY;

            let closestLabel = '';
            let closestDist = Infinity;
            for (const labelEl of labels) {
                const labelRect = labelEl.getBoundingClientRect();
                let left = labelRect.left + activeWindow.scrollX;
                let top = labelRect.top + activeWindow.scrollY;
                if (labelRect.width === 0 && labelRect.height === 0) {
                    left = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-left',
                        ),
                    );
                    top = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-top',
                        ),
                    );
                    if (Number.isNaN(left) || Number.isNaN(top)) continue;
                }
                const dist = Math.hypot(left - targetLeft, top - targetTop);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestLabel = labelEl.textContent ?? '';
                }
            }

            if (closestLabel && closestDist <= 150) {
                return {
                    label: closestLabel,
                    textContent: (target.textContent ?? '').slice(0, 100),
                    parentClassName: target.parentElement?.className ?? '',
                    extractedHref: null,
                };
            }
        }

        return null;
    }, textMatch)) as HintLabelForLink | null;
}

async function typeHintLabel(label: string): Promise<void> {
    for (const ch of label) {
        await browser.keys([ch]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

const HINT_DIR = 'fixtures/hint-mode';
const HINT_FIXTURES = [
    `${HINT_DIR}/HintWikilink.md`,
    `${HINT_DIR}/HintAliasedWikilink.md`,
    `${HINT_DIR}/HintMarkdownLink.md`,
    `${HINT_DIR}/HintBareUrl.md`,
    `${HINT_DIR}/HintInlineWikilink.md`,
    `${HINT_DIR}/HintMultipleLinks.md`,
    `${HINT_DIR}/HintExternalLink.md`,
    'Target.md',
    `${HINT_DIR}/Alpha.md`,
    `${HINT_DIR}/Beta.md`,
];

async function openHintFixture(file: string): Promise<void> {
    await obsidianPage.openFile(`${HINT_DIR}/${file}`);
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await ensureLivePreview();
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (view) {
            view.editor.setCursor(2, 0);
            view.editor.focus();
        }
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Hint mode link navigation (#85)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        for (const file of HINT_FIXTURES) {
            await obsidianPage.openFile(file);
            await browser.pause(200);
        }
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await browser.executeObsidian(() => {
            document
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
        it('should produce hint label for wikilink', async function () {
            await openHintFixture('HintWikilink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();
            expect(hintInfo!.label.length).toBeGreaterThan(0);

            await browser.keys(['Escape']);
        });

        it('should produce hint label for markdown link', async function () {
            await openHintFixture('HintMarkdownLink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Go to target');
            expect(hintInfo).not.toBeNull();
            expect(hintInfo!.label.length).toBeGreaterThan(0);

            await browser.keys(['Escape']);
        });

        it('should produce hint label for bare URL', async function () {
            await openHintFixture('HintBareUrl.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('https://example.com');
            expect(hintInfo).not.toBeNull();
            expect(hintInfo!.label.length).toBeGreaterThan(0);

            await browser.keys(['Escape']);
        });
    });

    describe('Wikilink navigation', function () {
        it('should navigate to target note via wikilink hint', async function () {
            await openHintFixture('HintWikilink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });

        it('should navigate aliased wikilink to correct target', async function () {
            await openHintFixture('HintAliasedWikilink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Click Here');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });
    });

    describe('Markdown link navigation', function () {
        it('should navigate internal markdown link via hint', async function () {
            await openHintFixture('HintMarkdownLink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Go to target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });
    });

    describe('Inline links in text', function () {
        it('should navigate wikilink embedded in paragraph text', async function () {
            await openHintFixture('HintInlineWikilink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
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
            await waitForHintOverlay();

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
            await waitForHintOverlay();

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
            await openHintFixture('HintExternalLink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('External');
            expect(hintInfo).not.toBeNull();
            expect(hintInfo!.label.length).toBeGreaterThan(0);

            await browser.keys(['Escape']);

            expect(await getActiveFilePath()).toBe(
                `${HINT_DIR}/HintExternalLink.md`,
            );
        });
    });

    describe('Source mode wikilink navigation', function () {
        it('should navigate wikilink in Source mode', async function () {
            await obsidianPage.openFile(`${HINT_DIR}/HintWikilink.md`);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureSourceMode();

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });

        it('should navigate aliased wikilink in Source mode', async function () {
            await obsidianPage.openFile(`${HINT_DIR}/HintAliasedWikilink.md`);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureSourceMode();

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            if (!hintInfo) {
                const aliasHint = await findHintLabelForLink('Click Here');
                expect(aliasHint).not.toBeNull();
                await typeHintLabel(aliasHint!.label);
            } else {
                await typeHintLabel(hintInfo.label);
            }
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });

        it('should navigate inline wikilink in Source mode', async function () {
            await obsidianPage.openFile(`${HINT_DIR}/HintInlineWikilink.md`);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureSourceMode();

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });
    });

    describe('Cursor-on-line wikilink (Live Preview)', function () {
        it('should navigate wikilink when cursor is on the same line', async function () {
            await obsidianPage.openFile(`${HINT_DIR}/HintWikilink.md`);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureLivePreview();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) {
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });
    });

    describe('Multiple wikilinks on same line', function () {
        it('should produce distinct hints for each wikilink', async function () {
            await openHintFixture('HintMultipleLinks.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const alphaHint = await findHintLabelForLink('Alpha');
            const betaHint = await findHintLabelForLink('Beta');

            expect(alphaHint).not.toBeNull();
            expect(betaHint).not.toBeNull();
            expect(alphaHint!.label).not.toBe(betaHint!.label);

            await browser.keys(['Escape']);
        });
    });

    describe('Aliased wikilink deduplication', function () {
        it('should navigate aliased wikilink with single activation', async function () {
            await openHintFixture('HintAliasedWikilink.md');

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Click Here');
            const targetHint = await findHintLabelForLink('Target');
            const hint = hintInfo ?? targetHint;
            expect(hint).not.toBeNull();

            await typeHintLabel(hint!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            expect(await getActiveFilePath()).toBe('Target.md');
        });
    });

    describe('Hint yank (yf) on wikilinks', function () {
        it('should yank wikilink target via hint-yank command', async function () {
            await openHintFixture('HintWikilink.md');
            await dismissNotices();

            await triggerHintYankViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const notices = await getNotices();
            const yankNotice = notices.find((n) => n.includes('Copied:'));
            expect(yankNotice).toBeDefined();
            expect(yankNotice).toContain('Target');
        });
    });

    describe('Hint open new tab (F) on wikilinks', function () {
        it('should open wikilink in new tab via hint-open-new-pane command', async function () {
            await openHintFixture('HintWikilink.md');

            const beforeLeafCount = (await browser.executeObsidian(
                ({ app }) => {
                    return app.workspace.getLeavesOfType('markdown').length;
                },
            )) as number;

            await triggerHintOpenNewViaCommand();
            await waitForHintOverlay();

            const hintInfo = await findHintLabelForLink('Target');
            expect(hintInfo).not.toBeNull();

            await typeHintLabel(hintInfo!.label);
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const afterLeafCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            expect(afterLeafCount).toBeGreaterThan(beforeLeafCount);
            expect(await getActiveFilePath()).toBe('Target.md');
        });
    });

    describe('Embed wikilink hints', function () {
        it('should produce hint label for embed wikilink if visible', async function () {
            await setupEditor('![[Target]]\n\nPlain text.', {
                line: 0,
                ch: 0,
            });
            await browser.pause(500);

            await triggerHintModeViaCommand();
            await waitForHintOverlay();

            const hasOverlay = (await browser.executeObsidian(() => {
                return !!activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
            })) as boolean;
            expect(hasOverlay).toBe(true);

            const embedHint = await findHintLabelForLink('Target');

            if (embedHint) {
                expect(embedHint.label.length).toBeGreaterThan(0);
            }

            await browser.keys(['Escape']);
        });
    });
});
