import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureLivePreview, PAUSE } from '../helpers';

/**
 * Hint mode reaches the fields Obsidian draws around a note: properties, the
 * **Add property** button and the backlinks search (#207).
 *
 * Measured before the fix: a property value is a `contenteditable` div and
 * the add button a plain `div`, so neither matched a hint selector and
 * neither got a label. A property name and the backlinks search are inputs
 * and did get one, but 150 ms after the click hint mode handed focus back to
 * the note, so the field could not be typed into. A task checkbox is the
 * control: nothing to type into, so focus still goes back to the note.
 */

const NOTE = 'HintProps207.md';
const LINKER = 'HintProps207Linker.md';

/** The hint label nearest `selector`'s top-left corner, within 30 px. */
async function labelFor(selector: string): Promise<string | null> {
    return (await browser.executeObsidian((_ctx, sel: string) => {
        const root = activeDocument.querySelector('.workspace-leaf.mod-active');
        const target = root?.querySelector(sel);
        if (!target) return null;
        const rect = target.getBoundingClientRect();
        const x = rect.left + activeWindow.scrollX;
        const y = rect.top + activeWindow.scrollY;
        let best: string | null = null;
        let bestDist = Infinity;
        for (const label of Array.from(
            activeDocument.querySelectorAll<HTMLElement>(
                '.vim-motions-hint-overlay .vim-motions-hint-label',
            ),
        )) {
            const left = Number.parseFloat(
                label.style.getPropertyValue('--vim-motions-hint-left'),
            );
            const top = Number.parseFloat(
                label.style.getPropertyValue('--vim-motions-hint-top'),
            );
            const dist = Math.hypot(left - x, top - y);
            if (dist < bestDist) {
                bestDist = dist;
                best = label.textContent;
            }
        }
        return bestDist <= 30 ? best : null;
    }, selector)) as string | null;
}

async function showHints(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: { handleKey: (cm: unknown, key: string) => boolean };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!Vim || !view) return;
        view.editor.focus();
        const adapter = (
            (view.editor as unknown as Record<string, unknown>).cm as Record<
                string,
                unknown
            >
        )?.cm;
        Vim.handleKey(adapter, '\\');
        Vim.handleKey(adapter, '\\');
        Vim.handleKey(adapter, 'h');
    });
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                () =>
                    !!activeDocument.querySelector('.vim-motions-hint-overlay'),
            )) as boolean,
        { timeout: 3000, interval: 100, timeoutMsg: 'no hint overlay' },
    );
}

/** Shows hints, types the label for `selector`, and waits out the refocus. */
async function hint(selector: string): Promise<void> {
    await showHints();
    const label = await labelFor(selector);
    expect(label).not.toBeNull();
    await browser.keys(label!.split(''));
    // Past hint mode's 150 ms refocus, so a focus it takes back is seen.
    await browser.pause(500);
}

async function focused(): Promise<{ classes: string[]; inEditor: boolean }> {
    return (await browser.executeObsidian(() => {
        const el = activeDocument.activeElement;
        return {
            classes: el ? Array.from(el.classList) : [],
            inEditor: !!el?.closest('.cm-content'),
        };
    })) as { classes: string[]; inEditor: boolean };
}

describe('hint mode and the fields around a note (#207)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(
            async ({ app }, files: { note: string; linker: string }) => {
                await app.vault.adapter.write(
                    files.note,
                    '---\nstatus: draft\n---\nfirst line\n- [ ] a task\n',
                );
                await app.vault.adapter.write(
                    files.linker,
                    `see [[${files.note.replace(/\.md$/, '')}]]\n`,
                );
                (
                    app.vault as unknown as {
                        setConfig(key: string, value: unknown): void;
                    }
                ).setConfig('propertiesInDocument', 'visible');
            },
            { note: NOTE, linker: LINKER },
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    beforeEach(async function () {
        await obsidianPage.openFile(NOTE);
        await ensureLivePreview();
        // Off the task line, which Live Preview would otherwise show raw.
        await browser.executeObsidian(({ app, obsidian }) => {
            app.workspace
                .getActiveViewOfType(obsidian.MarkdownView)
                ?.editor.setCursor(3, 0);
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    after(async function () {
        await browser.executeObsidian(
            async ({ app }, files: string[]) => {
                for (const f of files) {
                    if (await app.vault.adapter.exists(f)) {
                        await app.vault.adapter.remove(f);
                    }
                }
            },
            [NOTE, LINKER],
        );
    });

    it('a property value takes the cursor and keeps it', async function () {
        await hint('.metadata-input-longtext');
        expect((await focused()).classes).toContain('metadata-input-longtext');
    });

    it('a property name takes the cursor and keeps it', async function () {
        await hint('.metadata-property-key-input');
        expect((await focused()).classes).toContain(
            'metadata-property-key-input',
        );
    });

    it('Add property opens a new property with the cursor in its name', async function () {
        const rowsBefore = (await browser.executeObsidian(
            () =>
                activeDocument.querySelectorAll(
                    '.workspace-leaf.mod-active .metadata-property',
                ).length,
        )) as number;

        await hint('.metadata-add-button');

        const rowsAfter = (await browser.executeObsidian(
            () =>
                activeDocument.querySelectorAll(
                    '.workspace-leaf.mod-active .metadata-property',
                ).length,
        )) as number;
        expect(rowsAfter).toBe(rowsBefore + 1);
        expect((await focused()).classes).toContain(
            'metadata-property-key-input',
        );
    });

    it('the backlinks search takes the cursor and keeps it', async function () {
        await browser.executeObsidian(({ app }) => {
            (
                app.commands as unknown as {
                    executeCommandById(id: string): boolean;
                }
            ).executeCommandById('backlink:toggle-backlinks-in-document');
        });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        try {
            // The search field is hidden until its filter button is pressed.
            await browser.executeObsidian(() => {
                const buttons = activeDocument.querySelectorAll<HTMLElement>(
                    '.workspace-leaf.mod-active .embedded-backlinks .nav-action-button',
                );
                Array.from(buttons)
                    .find((b) =>
                        /search/i.test(b.getAttribute('aria-label') ?? ''),
                    )
                    ?.click();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await hint('.embedded-backlinks .search-input-container input');

            expect((await focused()).classes).not.toContain('cm-content');
            expect(
                (await browser.executeObsidian(
                    () =>
                        !!activeDocument.activeElement?.closest(
                            '.embedded-backlinks .search-input-container',
                        ),
                )) as boolean,
            ).toBe(true);
        } finally {
            await browser.executeObsidian(({ app }) => {
                (
                    app.commands as unknown as {
                        executeCommandById(id: string): boolean;
                    }
                ).executeCommandById('backlink:toggle-backlinks-in-document');
            });
        }
    });

    it('a task checkbox still hands focus back to the note (control)', async function () {
        await hint('.task-list-item-checkbox');
        expect((await focused()).inEditor).toBe(true);
        expect(
            (await browser.executeObsidian(({ app, obsidian }) =>
                app.workspace
                    .getActiveViewOfType(obsidian.MarkdownView)
                    ?.editor.getLine(4),
            )) as string,
        ).toBe('- [x] a task');
    });
});
