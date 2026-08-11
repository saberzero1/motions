import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    focusEditor,
    setWhichKeyMode,
    hasWhichKeyOverlay,
    waitForWhichKey,
    getWhichKeyTitle,
    getWhichKeyEntryCount,
    PAUSE,
} from '../helpers';

async function enableTextareaVim(enable: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, val: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.enableVimTextareas = val;
        plugin.reloadFeatures();
    }, enable);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function injectTextarea(id: string, value: string): Promise<void> {
    await browser.executeObsidian(
        (_ctx, elId: string, val: string) => {
            const existing = document.getElementById(elId);
            if (existing) existing.remove();
            const existingModal = document.getElementById(`${elId}-modal`);
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.className = 'modal-container';
            modal.id = `${elId}-modal`;

            const textarea = document.createElement('textarea');
            textarea.id = elId;
            textarea.value = val;
            textarea.style.width = '300px';
            textarea.style.height = '100px';

            modal.appendChild(textarea);
            document.body.appendChild(modal);
        },
        id,
        value,
    );
}

async function focusElement(id: string): Promise<void> {
    await browser.executeObsidian((_ctx, elId: string) => {
        const el = document.getElementById(elId) as HTMLTextAreaElement | null;
        el?.focus();
    }, id);
}

async function cleanup(id: string): Promise<void> {
    await browser.executeObsidian((_ctx, elId: string) => {
        document.getElementById(`${elId}-modal`)?.remove();
        document.getElementById(elId)?.remove();
        document
            .querySelectorAll('.vim-motions-textarea-overlay')
            .forEach((el) => el.remove());
        document
            .querySelectorAll('.vim-motions-which-key')
            .forEach((el) => el.remove());
    }, id);
}

async function hasOverlay(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-textarea-overlay');
    })) as boolean;
}

async function enterNormalMode(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Which-key in textarea vim overlay', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await enableTextareaVim(true);
        await setWhichKeyMode('all');
    });

    after(async function () {
        await setWhichKeyMode('off');
        await enableTextareaVim(false);
    });

    afterEach(async function () {
        await cleanup('wk-ta');
        await focusEditor();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('shows which-key after partial chord in normal mode', async function () {
        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        expect(await hasOverlay()).toBe(true);

        await enterNormalMode();

        await browser.keys(['d']);
        await waitForWhichKey(2000);

        expect(await hasWhichKeyOverlay()).toBe(true);
        const title = await getWhichKeyTitle();
        expect(title).toContain('d');
    });

    it('shows which-key for g prefix in normal mode', async function () {
        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await enterNormalMode();

        await browser.keys(['g']);
        await waitForWhichKey(2000);

        expect(await hasWhichKeyOverlay()).toBe(true);
        const title = await getWhichKeyTitle();
        expect(title).toContain('g');
        expect(await getWhichKeyEntryCount()).toBeGreaterThan(0);
    });

    it('dismisses which-key on command completion', async function () {
        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await enterNormalMode();

        await browser.keys(['d']);
        await waitForWhichKey(2000);
        expect(await hasWhichKeyOverlay()).toBe(true);

        await browser.keys(['d']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await hasWhichKeyOverlay()).toBe(false);
    });

    it('dismisses which-key on Escape', async function () {
        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await enterNormalMode();

        await browser.keys(['d']);
        await waitForWhichKey(2000);
        expect(await hasWhichKeyOverlay()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await hasWhichKeyOverlay()).toBe(false);

        expect(await hasOverlay()).toBe(true);
    });

    it('does not show which-key in insert mode', async function () {
        await injectTextarea('wk-ta', 'hello');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        expect(await hasOverlay()).toBe(true);

        await browser.keys(['d', 'd', 'd']);
        await browser.pause(600);
        expect(await hasWhichKeyOverlay()).toBe(false);
    });

    it('does not show which-key when whichKeyMode is off', async function () {
        await setWhichKeyMode('off');

        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await enterNormalMode();

        await browser.keys(['d']);
        await browser.pause(600);
        expect(await hasWhichKeyOverlay()).toBe(false);

        await browser.keys(['Escape']);
        await setWhichKeyMode('all');
    });

    it('cleans up which-key on editor close without errors', async function () {
        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await enterNormalMode();

        await browser.keys(['d']);
        await waitForWhichKey(2000);
        expect(await hasWhichKeyOverlay()).toBe(true);

        await browser.executeObsidian(() => {
            const cm = document.querySelector(
                '.vim-motions-textarea-overlay .cm-content',
            ) as HTMLElement | null;
            cm?.blur();
        });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        expect(await hasOverlay()).toBe(false);
        expect(await hasWhichKeyOverlay()).toBe(false);
    });

    it('cleans up which-key on modal removal', async function () {
        await injectTextarea('wk-ta', 'hello world');
        await focusElement('wk-ta');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await enterNormalMode();

        await browser.keys(['d']);
        await waitForWhichKey(2000);
        expect(await hasWhichKeyOverlay()).toBe(true);

        await browser.executeObsidian(() => {
            document.getElementById('wk-ta-modal')?.remove();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await hasOverlay()).toBe(false);
        expect(await hasWhichKeyOverlay()).toBe(false);
    });
});
