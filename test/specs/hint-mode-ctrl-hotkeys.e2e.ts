import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE, setupEditor } from '../helpers';

/**
 * Holding Ctrl over a hint label opens it in a new pane, even where Obsidian
 * binds Ctrl+<letter> itself.
 *
 * Labels start with a home-row letter, and Obsidian's default hotkeys include
 * Ctrl+D (Delete paragraph), Ctrl+F (Search current file), Ctrl+G, Ctrl+H,
 * Ctrl+K and Ctrl+L. Obsidian's Keymap runs on `window` in the capture phase,
 * ahead of hint mode's `document` listener, so it took the first letter.
 * Measured before the fix: Ctrl on a `d` label deleted a line of the note
 * (819 characters to 800), and Ctrl on an `f` label opened search.
 *
 * The test vault unbinds those hotkeys, which is why the existing Ctrl+label
 * test never saw it; each scenario restores Obsidian's defaults for the
 * session. The last scenario is the control: once hint mode ends, Ctrl+D is
 * Obsidian's again, so the hint session releases what it took.
 */

const DOC = Array.from(
    { length: 40 },
    (_, i) => `- [[HintCtrlTarget]] item ${i}`,
).join('\n');

/** Puts back the Obsidian defaults the test vault removes. */
async function restoreObsidianDefaults(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const hm = (
            app as unknown as {
                hotkeyManager: {
                    removeHotkeys(id: string): void;
                    bake(): void;
                };
            }
        ).hotkeyManager;
        for (const id of [
            'editor:delete-paragraph',
            'editor:open-search',
            'graph:open',
        ]) {
            hm.removeHotkeys(id);
        }
        hm.bake();
    });
}

/** The length of Welcome.md, wherever it is: Ctrl on a label opens a pane. */
async function noteLength(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        let length = -1;
        app.workspace.iterateRootLeaves((leaf) => {
            const view = leaf.view;
            if (
                view instanceof obsidian.MarkdownView &&
                view.file?.path === 'Welcome.md'
            ) {
                length = view.editor.getValue().length;
            }
        });
        return length;
    })) as number;
}

async function searchOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector<HTMLElement>(
            '.workspace-leaf.mod-active .document-search-container',
        );
        return !!el && el.offsetParent !== null;
    })) as boolean;
}

async function overlayOpen(): Promise<boolean> {
    return (await browser.executeObsidian(
        () => !!document.querySelector('.vim-motions-hint-overlay'),
    )) as boolean;
}

/** Shows hints and returns the first label starting with `letter`. */
async function showHintsAndFind(letter: string): Promise<string> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: { handleKey(cm: unknown, k: string): void };
                };
            }
        ).CodeMirrorAdapter.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        view.editor.focus();
        const adapter = (view.editor as unknown as { cm: { cm: unknown } }).cm
            .cm;
        Vim.handleKey(adapter, '\\');
        Vim.handleKey(adapter, '\\');
        Vim.handleKey(adapter, 'h');
    });
    await browser.waitUntil(overlayOpen, {
        timeout: 3000,
        interval: 100,
        timeoutMsg: 'no hint overlay',
    });
    const label = (await browser.executeObsidian(
        (_ctx, l: string) =>
            Array.from(document.querySelectorAll('.vim-motions-hint-label'))
                .map((el) => el.textContent ?? '')
                .find((t) => t.startsWith(l)) ?? null,
        letter,
    )) as string | null;
    expect(label).not.toBeNull();
    return label!;
}

async function pressWithCtrl(label: string): Promise<void> {
    for (const ch of label) {
        await browser.keys([Key.Ctrl, ch]);
        await browser.keys([Key.Ctrl]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('hint mode and Obsidian Ctrl hotkeys', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(async ({ app }) => {
            await app.vault.adapter.write('HintCtrlTarget.md', 'target\n');
        });
        await restoreObsidianDefaults();
    });

    beforeEach(async function () {
        await obsidianPage.openFile('Welcome.md');
        await setupEditor(DOC, { line: 0, ch: 0 });
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.executeObsidian(({ app }) => {
            document
                .querySelectorAll('.vim-motions-hint-overlay')
                .forEach((el) => el.remove());
            const keep = app.workspace.getMostRecentLeaf();
            const doomed: { detach(): void }[] = [];
            app.workspace.iterateRootLeaves((leaf) => {
                if (leaf !== keep) doomed.push(leaf);
            });
            doomed.forEach((leaf) => leaf.detach());
        });
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }) => {
            if (await app.vault.adapter.exists('HintCtrlTarget.md')) {
                await app.vault.adapter.remove('HintCtrlTarget.md');
            }
        });
    });

    it('Ctrl on a d label leaves the note alone and finishes the label', async function () {
        const before = await noteLength();
        const label = await showHintsAndFind('d');

        await pressWithCtrl(label);

        expect(await noteLength()).toBe(before);
        expect(await overlayOpen()).toBe(false);
    });

    it('Ctrl on an f label does not open search', async function () {
        const label = await showHintsAndFind('f');

        await pressWithCtrl(label);

        expect(await searchOpen()).toBe(false);
        expect(await overlayOpen()).toBe(false);
    });

    it('Ctrl+D is Obsidian’s again once hint mode ends (control)', async function () {
        // Escape is one of the exits; captureKeys releases on all of them.
        await showHintsAndFind('a');
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await overlayOpen()).toBe(false);
        const before = await noteLength();

        await browser.keys([Key.Ctrl, 'd']);
        await browser.keys([Key.Ctrl]);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // Delete paragraph removes the first line.
        expect(await noteLength()).toBeLessThan(before);
    });
});
