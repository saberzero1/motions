import { App } from 'obsidian';
import { VimInfoModal } from '../ui/vim-info-modal';

export interface HotkeyConflict {
    key: string;
    commandId: string;
    feature: string;
    description: string;
}

export const WORKSPACE_NAV_CONFLICTS: HotkeyConflict[] = [
    {
        key: 'Ctrl+W',
        commandId: 'workspace:close',
        feature: '<C-w> prefix',
        description: 'Close current tab',
    },
    {
        key: 'Ctrl+D',
        commandId: 'editor:delete-paragraph',
        feature: 'Ctrl-d half-page scroll',
        description: 'Delete paragraph',
    },
    {
        key: 'Ctrl+F',
        commandId: 'editor:open-search',
        feature: 'Ctrl-f full-page scroll',
        description: 'Search in file',
    },
    {
        key: 'Ctrl+B',
        commandId: 'editor:toggle-bold',
        feature: 'Ctrl-b full-page scroll',
        description: 'Toggle bold',
    },
];

/**
 * Detect which workspace-navigation hotkeys still have active default
 * (or custom) bindings that would shadow the plugin's keys.
 *
 * A conflict is "resolved" only when the user has explicitly set an
 * empty array `[]` for that command in `hotkeys.json`.
 */
export async function detectHotkeyConflicts(
    app: App,
): Promise<HotkeyConflict[]> {
    try {
        const raw = await app.vault.adapter.read(
            `${app.vault.configDir}/hotkeys.json`,
        );
        const hotkeys = JSON.parse(raw) as Record<string, unknown[]>;

        return WORKSPACE_NAV_CONFLICTS.filter((conflict) => {
            const entry = hotkeys[conflict.commandId];
            // Absent → default binding is active → conflict
            if (entry === undefined) return true;
            // Explicitly unbound (empty array) → no conflict
            if (Array.isArray(entry) && entry.length === 0) return false;
            // Non-empty array → custom or default binding → conflict
            return true;
        });
    } catch {
        // hotkeys.json doesn't exist (fresh vault) → all defaults active
        return [...WORKSPACE_NAV_CONFLICTS];
    }
}

/**
 * Show a modal listing active hotkey conflicts with resolution instructions.
 */
export function showConflictsModal(
    app: App,
    conflicts: HotkeyConflict[],
): void {
    if (conflicts.length === 0) {
        new VimInfoModal(
            app,
            'Hotkey conflicts',
            [{ header: 'Status' }],
            [
                [
                    'No conflicts detected \u2014 all workspace navigation keys are available.',
                ],
            ],
        ).open();
        return;
    }

    const rows = conflicts.map((c) => [
        c.key,
        `\u201C${c.description}\u201D`,
        `blocks ${c.feature}`,
    ]);

    rows.push([
        '',
        '',
        'To fix: Open Settings \u2192 Hotkeys \u2192 Search for the command name \u2192 Click \u00D7 to remove the binding',
    ]);

    new VimInfoModal(
        app,
        `Hotkey conflicts (${conflicts.length})`,
        [
            { header: 'Key' },
            { header: 'Obsidian command' },
            { header: 'Impact' },
        ],
        rows,
    ).open();
}
