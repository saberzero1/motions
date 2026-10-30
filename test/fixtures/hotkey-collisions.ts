/**
 * Every Obsidian default hotkey that the plugin also binds, and how each one
 * is resolved.
 *
 * Obsidian handles its hotkeys on `window` in the capture phase and stops the
 * event, so where both bind a key, Obsidian wins unless the user unbinds its
 * hotkey. `hotkey-collisions.e2e.ts` measures the collisions on a real
 * Obsidian and fails on any that is not listed here, or on a row that no
 * longer collides. `hotkey-collision-table.test.ts` pins the
 * `conflict-check` rows to `WORKSPACE_NAV_CONFLICTS`, which drives the
 * startup notice and **Check hotkey conflicts**.
 *
 * `hotkey` is Obsidian's notation: `Mod` is Ctrl on Windows and Linux and
 * Cmd on macOS, where the plugin binds no Cmd keys and nothing collides.
 */

export interface HotkeyCollision {
    hotkey: string;
    commandId: string;
    resolution: 'conflict-check' | 'obsidian-wins';
    reason: string;
}

export const HOTKEY_COLLISIONS: readonly HotkeyCollision[] = [
    {
        hotkey: 'Mod+W',
        commandId: 'workspace:close',
        resolution: 'conflict-check',
        reason: 'The <C-w> window prefix, and insert-mode delete word.',
    },
    {
        hotkey: 'Mod+D',
        commandId: 'editor:delete-paragraph',
        resolution: 'conflict-check',
        reason: 'Half-page scroll; Obsidian deletes text instead.',
    },
    {
        hotkey: 'Mod+F',
        commandId: 'editor:open-search',
        resolution: 'conflict-check',
        reason: 'Full-page scroll.',
    },
    {
        hotkey: 'Mod+B',
        commandId: 'editor:toggle-bold',
        resolution: 'conflict-check',
        reason: 'Full-page scroll back.',
    },
    {
        hotkey: 'Mod+O',
        commandId: 'switcher:open',
        resolution: 'conflict-check',
        reason: 'Jump list back (#206).',
    },
    {
        hotkey: 'Mod+I',
        commandId: 'editor:toggle-italics',
        resolution: 'conflict-check',
        reason: 'Jump list forward (#206).',
    },
    {
        hotkey: 'Mod+E',
        commandId: 'markdown:toggle-preview',
        resolution: 'conflict-check',
        reason: 'Scroll down a line; Obsidian leaves the editor for reading view.',
    },
    {
        hotkey: 'Mod+T',
        commandId: 'workspace:new-tab',
        resolution: 'conflict-check',
        reason: 'Insert-mode indent and the tag stack.',
    },
    {
        hotkey: 'Mod+G',
        commandId: 'graph:open',
        resolution: 'conflict-check',
        reason: 'File info, and the insert-mode <C-g> prefix.',
    },
    {
        hotkey: 'Mod+N',
        commandId: 'file-explorer:new-file',
        resolution: 'obsidian-wins',
        reason: '<C-n> only repeats j; a new note is worth more.',
    },
    {
        hotkey: 'Mod+P',
        commandId: 'command-palette:open',
        resolution: 'obsidian-wins',
        reason: '<C-p> only repeats k; the command palette is worth more.',
    },
    {
        hotkey: 'Mod+6',
        commandId: 'workspace:goto-tab-6',
        resolution: 'obsidian-wins',
        reason: 'Obsidian takes it only with six tabs open, and :e # reaches the alternate file.',
    },
];
