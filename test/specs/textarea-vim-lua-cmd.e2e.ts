import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { loadLuaConfig, setupEditor } from '../helpers';

/**
 * `vim.cmd()` from a Lua mapping fired in a vim-enabled text area runs in that
 * text area (#211).
 *
 * The runtime handler used to resolve the active note's editor, so a mapping
 * fired in a text-area overlay either acted on the note behind it or, with no
 * note active, was skipped with "vim.cmd() called with no active editor". Each
 * scenario is built so the old behaviour fails it: the first keeps a note
 * open behind the text area and checks which of the two changed, and the
 * second has no note active at all.
 *
 * Alt chords, because Obsidian binds none of them by default.
 */

const LUA = [
    "vim.keymap.set('n', '<A-y>', function() vim.cmd('normal! x') end)",
    "vim.keymap.set('n', '<A-u>', function() vim.cmd('obcommand editor:toggle-bold') end)",
].join('\n');

async function setTextareas(enabled: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, value: boolean) => {
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
        plugin.settings.enableVimTextareas = value;
        plugin.reloadFeatures();
    }, enabled);
    await browser.pause(300);
}

/** A text area in a modal container, focused so the vim overlay replaces it. */
async function openTextarea(value: string): Promise<void> {
    await browser.executeObsidian((_ctx, val: string) => {
        document.getElementById('lua-cmd-ta-modal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'modal-container';
        modal.id = 'lua-cmd-ta-modal';
        const textarea = document.createElement('textarea');
        textarea.id = 'lua-cmd-ta';
        textarea.value = val;
        textarea.style.width = '300px';
        textarea.style.height = '100px';
        modal.appendChild(textarea);
        document.body.appendChild(modal);
        textarea.focus();
    }, value);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                () =>
                    !!document.querySelector(
                        '.vim-motions-textarea-overlay .cm-editor',
                    ),
            )) as boolean,
        { timeout: 3000, interval: 100, timeoutMsg: 'no text-area overlay' },
    );
    // The overlay starts in insert mode; the mappings are normal-mode.
    await browser.keys(['Escape']);
    await browser.pause(300);
}

async function textareaValue(): Promise<string> {
    return (await browser.executeObsidian(
        () =>
            (
                document.getElementById(
                    'lua-cmd-ta',
                ) as HTMLTextAreaElement | null
            )?.value ?? '',
    )) as string;
}

async function closeTextarea(): Promise<void> {
    await browser.executeObsidian(() => {
        document.getElementById('lua-cmd-ta-modal')?.remove();
        document
            .querySelectorAll('.vim-motions-textarea-overlay')
            .forEach((el) => el.remove());
    });
}

describe('vim.cmd() from a mapping in a vim-enabled text area (#211)', function () {
    this.timeout(120000);

    before(async function () {
        await loadLuaConfig(LUA);
        await setTextareas(true);
    });

    after(async function () {
        await setTextareas(false);
    });

    afterEach(async function () {
        await closeTextarea();
    });

    it('runs the command in the text area, not in the note behind it', async function () {
        await setupEditor('note text', { line: 0, ch: 0 });
        await openTextarea('area text');

        await browser.keys([Key.Alt, 'y']);
        await browser.keys([Key.Alt]);
        await browser.pause(400);

        const note = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getValue() ?? null;
        })) as string | null;
        // `normal! x` on the text area's first character.
        expect(await textareaValue()).toBe('rea text');
        expect(note).toBe('note text');
    });

    it('runs the command with no note active at all', async function () {
        await browser.executeObsidian(async ({ app }) => {
            const leaf = app.workspace.getLeaf(true);
            await leaf.setViewState({ type: 'empty' });
            app.workspace.setActiveLeaf(leaf, { focus: true });
            const target = window as unknown as { __luaCmdIds?: string[] };
            target.__luaCmdIds = [];
            const commands = app.commands as unknown as {
                executeCommandById(id: string): boolean;
                __realExecute?: (id: string) => boolean;
            };
            commands.__realExecute ??=
                commands.executeCommandById.bind(commands);
            commands.executeCommandById = (id: string) => {
                target.__luaCmdIds?.push(id);
                return commands.__realExecute!(id);
            };
        });
        await openTextarea('area text');

        await browser.keys([Key.Alt, 'u']);
        await browser.keys([Key.Alt]);
        await browser.pause(400);

        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const commands = app.commands as unknown as {
                executeCommandById(id: string): boolean;
                __realExecute?: (id: string) => boolean;
            };
            if (commands.__realExecute) {
                commands.executeCommandById = commands.__realExecute;
                delete commands.__realExecute;
            }
            return {
                ids:
                    (window as unknown as { __luaCmdIds?: string[] })
                        .__luaCmdIds ?? [],
                noteActive:
                    app.workspace.getActiveViewOfType(obsidian.MarkdownView) !==
                    null,
            };
        })) as { ids: string[]; noteActive: boolean };

        expect(result.noteActive).toBe(false);
        // Skipped with "no active editor" before the fix.
        expect(result.ids).toContain('editor:toggle-bold');
    });
});
