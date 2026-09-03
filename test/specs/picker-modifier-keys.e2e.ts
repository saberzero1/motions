import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { loadLuaConfig, sendVimEscape } from '../helpers';

async function handleEx(
    command: string,
): Promise<{ success: true } | { error: string }> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as { success: true } | { error: string };
}

async function isPickerOpen(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-picker');
    })) as boolean;
}

async function getSelectedItemIndex(): Promise<number> {
    return (await browser.executeObsidian(() => {
        const items = document.querySelectorAll('.vim-motions-picker-item');
        for (let i = 0; i < items.length; i++) {
            if (items[i]!.classList.contains('is-selected')) return i;
        }
        return -1;
    })) as number;
}

async function dispatchPickerKey(
    key: string,
    modifiers: {
        altKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        metaKey?: boolean;
    } = {},
): Promise<void> {
    await browser.executeObsidian(
        (_, k: string, mods: Record<string, boolean>) => {
            const input = document.querySelector(
                '.vim-motions-picker-input',
            ) as HTMLInputElement | null;
            if (input) {
                input.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: k,
                        altKey: !!mods.altKey,
                        ctrlKey: !!mods.ctrlKey,
                        shiftKey: !!mods.shiftKey,
                        metaKey: !!mods.metaKey,
                        bubbles: true,
                    }),
                );
            }
        },
        key,
        modifiers,
    );
}

async function closePicker(): Promise<void> {
    await dispatchPickerKey('Escape');
    await browser.pause(200);
}

describe('Picker modifier key navigation (PR #159)', function () {
    before(async function () {
        await loadLuaConfig(
            [
                `vim.obsidian.pick_keymap({`,
                `    move_down = { "A-j", "C-j" },`,
                `    move_up = { "A-k", "C-k" },`,
                `})`,
            ].join('\n'),
        );
        await browser.pause(300);
    });

    afterEach(async function () {
        if (await isPickerOpen()) {
            await closePicker();
        }
        await sendVimEscape();
    });

    it('Alt-j moves selection down in picker', async function () {
        const result = await handleEx('files');
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        expect(await isPickerOpen()).toBe(true);

        const initialIndex = await getSelectedItemIndex();
        expect(initialIndex).toBe(0);

        await dispatchPickerKey('j', { altKey: true });
        await browser.pause(100);

        const newIndex = await getSelectedItemIndex();
        expect(newIndex).toBe(1);
    });

    it('Alt-k moves selection up in picker', async function () {
        const result = await handleEx('files');
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        expect(await isPickerOpen()).toBe(true);

        await dispatchPickerKey('j', { altKey: true });
        await browser.pause(100);
        expect(await getSelectedItemIndex()).toBe(1);

        await dispatchPickerKey('k', { altKey: true });
        await browser.pause(100);
        expect(await getSelectedItemIndex()).toBe(0);
    });

    it('Ctrl-j still works alongside Alt-j', async function () {
        const result = await handleEx('files');
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        expect(await isPickerOpen()).toBe(true);

        await dispatchPickerKey('j', { ctrlKey: true });
        await browser.pause(100);
        expect(await getSelectedItemIndex()).toBe(1);
    });

    it('plain j types into input instead of navigating', async function () {
        const result = await handleEx('files');
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        expect(await isPickerOpen()).toBe(true);

        const indexBefore = await getSelectedItemIndex();
        await dispatchPickerKey('j');
        await browser.pause(100);
        const indexAfter = await getSelectedItemIndex();
        expect(indexAfter).toBe(indexBefore);
    });
});
