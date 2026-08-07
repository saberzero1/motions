import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { focusEditor } from '../helpers';

async function enableFeature(enable: boolean): Promise<void> {
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
    await browser.pause(300);
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
    }, id);
}

async function hasOverlay(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-textarea-overlay');
    })) as boolean;
}

async function getTextareaValue(id: string): Promise<string> {
    return (await browser.executeObsidian((_ctx, elId: string) => {
        return (
            (document.getElementById(elId) as HTMLTextAreaElement)?.value ?? ''
        );
    }, id)) as string;
}

async function isModalPresent(id: string): Promise<boolean> {
    return (await browser.executeObsidian((_ctx, elId: string) => {
        return !!document.getElementById(`${elId}-modal`);
    }, id)) as boolean;
}

async function isElementHidden(id: string): Promise<boolean> {
    return (await browser.executeObsidian((_ctx, elId: string) => {
        const el = document.getElementById(elId);
        return el?.classList.contains('vim-motions-textarea-hidden') ?? false;
    }, id)) as boolean;
}

async function overlayHasCmEditor(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const overlay = document.querySelector('.vim-motions-textarea-overlay');
        return !!overlay?.querySelector('.cm-editor');
    })) as boolean;
}

describe('Textarea vim replacement', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await enableFeature(true);
    });

    after(async function () {
        await enableFeature(false);
    });

    afterEach(async function () {
        await cleanup('test-ta');
        await focusEditor();
    });

    it('replaces a focused textarea with a CM6 editor', async function () {
        await injectTextarea('test-ta', 'hello world');
        await focusElement('test-ta');
        await browser.pause(300);

        expect(await hasOverlay()).toBe(true);
        expect(await overlayHasCmEditor()).toBe(true);
        expect(await isElementHidden('test-ta')).toBe(true);
    });

    it('starts in insert mode — typing works immediately', async function () {
        await injectTextarea('test-ta', '');
        await focusElement('test-ta');
        await browser.pause(300);

        await browser.keys(['h', 'e', 'l', 'l', 'o']);
        await browser.pause(200);

        const synced = await getTextareaValue('test-ta');
        expect(synced).toBe('hello');
    });

    it('syncs content back to the hidden textarea', async function () {
        await injectTextarea('test-ta', 'initial');
        await focusElement('test-ta');
        await browser.pause(300);

        await browser.keys([' ', 'e', 'd', 'i', 't']);
        await browser.pause(200);

        const synced = await getTextareaValue('test-ta');
        expect(synced).toContain('edit');
    });

    it('restores textarea when overlay editor is blurred', async function () {
        await injectTextarea('test-ta', 'some text');
        await focusElement('test-ta');
        await browser.pause(400);

        expect(await hasOverlay()).toBe(true);

        await browser.executeObsidian(() => {
            const cm = document.querySelector(
                '.vim-motions-textarea-overlay .cm-content',
            ) as HTMLElement | null;
            cm?.blur();
        });
        await browser.pause(300);
        expect(await hasOverlay()).toBe(false);
        expect(await isElementHidden('test-ta')).toBe(false);
    });

    it('cleans up CM6 when modal container is removed', async function () {
        await injectTextarea('test-ta', 'modal content');
        await focusElement('test-ta');
        await browser.pause(300);

        expect(await hasOverlay()).toBe(true);

        await browser.executeObsidian(() => {
            document.getElementById('test-ta-modal')?.remove();
        });
        await browser.pause(200);

        expect(await hasOverlay()).toBe(false);
    });

    it('does not replace textarea when feature is disabled', async function () {
        await enableFeature(false);
        await injectTextarea('test-ta', 'no replace');
        await focusElement('test-ta');
        await browser.pause(300);

        expect(await hasOverlay()).toBe(false);
        expect(await isElementHidden('test-ta')).toBe(false);

        await enableFeature(true);
    });

    it('does not replace disabled textareas', async function () {
        await browser.executeObsidian(() => {
            const modal = document.createElement('div');
            modal.className = 'modal-container';
            modal.id = 'test-ta-modal';
            const ta = document.createElement('textarea');
            ta.id = 'test-ta';
            ta.disabled = true;
            ta.value = 'disabled';
            modal.appendChild(ta);
            document.body.appendChild(modal);
        });
        await focusElement('test-ta');
        await browser.pause(300);

        expect(await hasOverlay()).toBe(false);
    });

    it('does not replace inputs (only textareas)', async function () {
        await browser.executeObsidian(() => {
            const modal = document.createElement('div');
            modal.className = 'modal-container';
            modal.id = 'test-ta-modal';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'test-ta';
            input.value = 'input';
            modal.appendChild(input);
            document.body.appendChild(modal);
        });
        await focusElement('test-ta');
        await browser.pause(300);

        expect(await hasOverlay()).toBe(false);
    });

    it('Escape in operator-pending mode does not exit the overlay', async function () {
        await injectTextarea('test-ta', 'hello world');
        await focusElement('test-ta');
        await browser.pause(500);

        expect(await hasOverlay()).toBe(true);

        // Exit insert mode → normal mode
        await browser.keys(['Escape']);
        await browser.pause(300);
        expect(await hasOverlay()).toBe(true);

        // d + Escape: operator should be cleared, overlay stays
        await browser.keys(['d']);
        await browser.pause(50);
        await browser.keys(['Escape']);
        await browser.pause(300);

        expect(await hasOverlay()).toBe(true);
    });

    it('Escape in idle normal mode exits the overlay', async function () {
        await injectTextarea('test-ta', 'hello world');
        await focusElement('test-ta');
        await browser.pause(500);

        expect(await hasOverlay()).toBe(true);

        // Exit insert mode → normal mode
        await browser.keys(['Escape']);
        await browser.pause(300);
        expect(await hasOverlay()).toBe(true);

        // Escape in idle normal mode → exits
        await browser.keys(['Escape']);
        await browser.pause(300);
        expect(await hasOverlay()).toBe(false);
    });

    it('typing in insert mode does not leak keydown to parent modal', async function () {
        await browser.executeObsidian(() => {
            const existing = document.getElementById('test-ta-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'modal-container';
            modal.id = 'test-ta-modal';

            const textarea = document.createElement('textarea');
            textarea.id = 'test-ta';
            textarea.value = '';
            textarea.style.width = '300px';
            textarea.style.height = '100px';

            modal.appendChild(textarea);

            (window as unknown as Record<string, unknown>).__leakedKeys = [];
            modal.addEventListener('keydown', (e: KeyboardEvent) => {
                (
                    (window as unknown as Record<string, unknown>)
                        .__leakedKeys as string[]
                ).push(e.key);
            });

            document.body.appendChild(modal);
        });

        await focusElement('test-ta');
        await browser.pause(500);
        expect(await hasOverlay()).toBe(true);

        await browser.keys(['a', 'b', ' ', 'c']);
        await browser.pause(200);

        const leaked = (await browser.executeObsidian(() => {
            return (window as unknown as Record<string, unknown>)
                .__leakedKeys as string[];
        })) as string[];
        expect(leaked).toEqual([]);

        await browser.executeObsidian(() => {
            delete (window as unknown as Record<string, unknown>).__leakedKeys;
        });
    });

    it('overlay teardown does not close host Obsidian Modal', async function () {
        // Open a real Obsidian Modal containing a textarea
        await browser.executeObsidian(({ app, obsidian }) => {
            const modal = new obsidian.Modal(app);
            modal.contentEl.createEl('textarea', {
                attr: { id: 'test-ta' },
            });
            const ta = modal.contentEl.querySelector(
                '#test-ta',
            ) as HTMLTextAreaElement;
            ta.value = 'keep this';
            ta.style.width = '300px';
            ta.style.height = '100px';
            modal.open();
        });
        await browser.pause(400);

        await focusElement('test-ta');
        await browser.pause(500);

        expect(await hasOverlay()).toBe(true);

        await browser.keys(['!', '!']);
        await browser.pause(200);

        // Tear down overlay via blur (proven reliable in headless)
        await browser.executeObsidian(() => {
            const cm = document.querySelector(
                '.vim-motions-textarea-overlay .cm-content',
            ) as HTMLElement | null;
            cm?.blur();
        });
        await browser.pause(400);

        expect(await hasOverlay()).toBe(false);

        // Modal must still be open — Escape was not re-dispatched
        const modalStillOpen = await browser.executeObsidian(() => {
            return !!document.querySelector('.modal-container');
        });
        expect(modalStillOpen).toBe(true);

        const value = await getTextareaValue('test-ta');
        expect(value).toContain('!!');

        // Clean up the modal
        await browser.executeObsidian(() => {
            document
                .querySelectorAll('.modal-container')
                .forEach((el) => el.remove());
        });
        await browser.pause(200);
    });

    it('Escape exit does not leak to parent scope or change active leaf (#112)', async function () {
        const leafIdBefore = (await browser.executeObsidian(({ app }) => {
            return (app.workspace.activeLeaf as { id?: string })?.id ?? '';
        })) as string;
        expect(leafIdBefore).not.toBe('');

        await browser.executeObsidian(({ app, obsidian }) => {
            const modal = new obsidian.Modal(app);
            modal.contentEl.createEl('textarea', {
                attr: { id: 'test-ta' },
            });
            const ta = modal.contentEl.querySelector(
                '#test-ta',
            ) as HTMLTextAreaElement;
            ta.value = 'test content';
            ta.style.width = '300px';
            ta.style.height = '100px';
            modal.open();

            const container = modal.containerEl;
            (window as unknown as Record<string, unknown>).__escapeLeakCount =
                0;
            container.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    ((window as unknown as Record<string, unknown>)
                        .__escapeLeakCount as number)++;
                }
            });
        });
        await browser.pause(400);

        await focusElement('test-ta');
        await browser.pause(500);
        expect(await hasOverlay()).toBe(true);

        // insert → normal
        await browser.keys(['Escape']);
        await browser.pause(300);
        expect(await hasOverlay()).toBe(true);

        // normal → exit overlay (this Escape must not leak)
        await browser.keys(['Escape']);
        await browser.pause(500);
        expect(await hasOverlay()).toBe(false);

        const leakCount = (await browser.executeObsidian(() => {
            return (window as unknown as Record<string, unknown>)
                .__escapeLeakCount as number;
        })) as number;
        expect(leakCount).toBe(0);

        const modalStillOpen = (await browser.executeObsidian(() => {
            return !!document.querySelector('.modal-container');
        })) as boolean;
        expect(modalStillOpen).toBe(true);

        const leafIdAfter = (await browser.executeObsidian(({ app }) => {
            return (app.workspace.activeLeaf as { id?: string })?.id ?? '';
        })) as string;
        expect(leafIdAfter).toBe(leafIdBefore);

        await browser.executeObsidian(() => {
            delete (window as unknown as Record<string, unknown>)
                .__escapeLeakCount;
            document
                .querySelectorAll('.modal-container')
                .forEach((el) => el.remove());
        });
        await browser.pause(200);
    });
});
