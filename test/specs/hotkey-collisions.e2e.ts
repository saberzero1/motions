import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { HOTKEY_COLLISIONS } from '../fixtures/hotkey-collisions';
import { setupEditor } from '../helpers';

/**
 * Every Obsidian default hotkey the plugin also binds is accounted for.
 *
 * Obsidian handles its hotkeys before the editor sees the key, so where both
 * bind one, the plugin's key silently does nothing until the user unbinds
 * Obsidian's. Real-key tests cannot see this: the test vault unbinds the
 * colliding hotkeys, which is how Ctrl+I's collision with Toggle italics went
 * unnoticed (#206). This spec reads Obsidian's *default* hotkeys instead, so
 * the vault's overrides do not hide anything, and asks the engine whether it
 * would take each one, in normal, visual and insert mode, plus the global
 * mappings used outside the editor.
 *
 * A collision must appear in `test/fixtures/hotkey-collisions.ts`, either in
 * the conflict check or as a deliberate "Obsidian wins". The spec fails on a
 * new collision — a new Obsidian default, or a new plugin key — and on a row
 * that no longer collides, so the table stays exact.
 */

interface Measured {
    /** Obsidian notation, e.g. `Mod+W`, letters upper-cased. */
    hotkey: string;
    commandId: string;
    /** Where the plugin takes it: an engine mode, or `global`. */
    where: string[];
}

/** Collisions with Mod read as `mod` (`ctrl` or `meta`). */
async function measure(mod: 'ctrl' | 'meta'): Promise<Measured[]> {
    return (await browser.executeObsidian(({ app, obsidian }, modKey) => {
        type Hotkey = { modifiers: string[]; key: string };
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: {
                        vimKeyFromEvent(e: KeyboardEvent, vim: unknown): string;
                        findKey(cm: unknown, key: string): unknown;
                        handleKey(cm: unknown, key: string): void;
                        clearInputState(cm: unknown): void;
                    };
                };
            }
        ).CodeMirrorAdapter.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('no MarkdownView');
        const cm = (
            view.editor as unknown as {
                cm: { cm: { state: { vim: unknown } } };
            }
        ).cm.cm;
        const defaults = (
            app as unknown as {
                hotkeyManager: { defaultKeys: Record<string, Hotkey[]> };
            }
        ).hotkeyManager.defaultKeys;
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            globalRegistry?: {
                                getAllEntries(): { keys: string }[];
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        const globalKeys = (plugin?.globalRegistry?.getAllEntries() ?? []).map(
            (e) => e.keys,
        );

        const notation = (hk: Hotkey): string => {
            const m = new Set(hk.modifiers);
            let key = hk.key;
            if (/^[A-Za-z]$/.test(key)) {
                key = m.has('Shift') ? key.toUpperCase() : key.toLowerCase();
            }
            const isMod = m.has('Mod');
            return Vim.vimKeyFromEvent(
                new KeyboardEvent('keydown', {
                    key,
                    ctrlKey: (isMod && modKey === 'ctrl') || m.has('Ctrl'),
                    metaKey: (isMod && modKey === 'meta') || m.has('Meta'),
                    altKey: m.has('Alt'),
                    shiftKey: m.has('Shift'),
                }),
                cm.state.vim,
            );
        };
        const label = (hk: Hotkey): string =>
            [
                ...hk.modifiers,
                /^[A-Za-z]$/.test(hk.key) ? hk.key.toUpperCase() : hk.key,
            ].join('+');
        const setMode = (mode: string): void => {
            Vim.handleKey(cm, '<Esc>');
            Vim.handleKey(cm, '<Esc>');
            if (mode === 'visual') Vim.handleKey(cm, 'v');
            if (mode === 'insert') Vim.handleKey(cm, 'i');
            Vim.clearInputState(cm);
        };

        const rows = Object.entries(defaults).flatMap(([commandId, list]) =>
            list.map((hk) => ({
                hotkey: label(hk),
                commandId,
                key: notation(hk),
                where: [] as string[],
            })),
        );
        for (const mode of ['normal', 'visual', 'insert']) {
            setMode(mode);
            for (const row of rows) {
                // findKey matches as handleKey would, without running the
                // command; a partial match leaves the key buffered.
                const claimed = typeof Vim.findKey(cm, row.key) === 'function';
                Vim.clearInputState(cm);
                if (claimed) row.where.push(mode);
            }
        }
        setMode('normal');
        for (const row of rows) {
            if (
                globalKeys.some((k) => k === row.key || k.startsWith(row.key))
            ) {
                row.where.push('global');
            }
        }
        return rows
            .filter((r) => r.where.length > 0)
            .map(({ hotkey, commandId, where }) => ({
                hotkey,
                commandId,
                where,
            }));
    }, mod)) as Measured[];
}

const key = (c: { hotkey: string; commandId: string }): string =>
    `${c.hotkey} ${c.commandId}`;

describe('Obsidian default hotkeys the plugin also binds', function () {
    this.timeout(120000);

    beforeEach(async function () {
        await obsidianPage.openFile('Welcome.md');
        await setupEditor('alpha beta\nsecond line', { line: 0, ch: 0 });
    });

    it('are all in the collision table, and the table has no stale rows', async function () {
        const measured = await measure('ctrl');
        const listed = new Set(HOTKEY_COLLISIONS.map(key));
        const found = new Set(measured.map(key));

        const unlisted = measured
            .filter((c) => !listed.has(key(c)))
            .map((c) => `${key(c)} (${c.where.join(', ')})`);
        const stale = HOTKEY_COLLISIONS.filter((c) => !found.has(key(c))).map(
            key,
        );

        expect(unlisted).toEqual([]);
        expect(stale).toEqual([]);
    });

    it('include none with Mod as Cmd, as on macOS', async function () {
        expect(await measure('meta')).toEqual([]);
    });

    /** Maps `lhs` in normal mode while `run` measures, then removes it. */
    async function withMapping<T>(
        lhs: string,
        run: () => Promise<T>,
    ): Promise<T> {
        await browser.executeObsidian((_ctx, l: string) => {
            (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: { map(l: string, r: string, c: string): void };
                    };
                }
            ).CodeMirrorAdapter.Vim.map(l, 'j', 'normal');
        }, lhs);
        try {
            return await run();
        } finally {
            await browser.executeObsidian((_ctx, l: string) => {
                (
                    window as unknown as {
                        CodeMirrorAdapter: {
                            Vim: { unmap(l: string, c: string): void };
                        };
                    }
                ).CodeMirrorAdapter.Vim.unmap(l, 'normal');
            }, lhs);
        }
    }

    // Mod+K is Insert link, which nothing in the plugin binds. Mapping it must
    // surface as a collision, or the two checks above prove nothing.
    it('include a Ctrl key the plugin newly binds (control)', async function () {
        const measured = await withMapping('<C-k>', () => measure('ctrl'));
        expect(measured.map(key)).toContain('Mod+K editor:insert-link');
    });

    it('include a Cmd key the plugin newly binds (control)', async function () {
        const measured = await withMapping('<M-k>', () => measure('meta'));
        expect(measured.map(key)).toContain('Mod+K editor:insert-link');
    });
});
