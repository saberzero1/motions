import type { VimMotionsSettings } from './settings';
import { invariant } from './util/invariant';

export function migrateConfigModeSettings(
    data:
        | (Partial<VimMotionsSettings> & {
              enableVimrc?: boolean;
              enableLuaConfig?: boolean;
          })
        | null,
):
    | (Partial<VimMotionsSettings> & {
          enableVimrc?: boolean;
          enableLuaConfig?: boolean;
      })
    | null {
    if (!data) return data;
    if (
        !('configMode' in data) &&
        ('enableVimrc' in data || 'enableLuaConfig' in data)
    ) {
        const vimrc = data.enableVimrc !== false;
        const lua = data.enableLuaConfig === true;
        if (vimrc && lua) data.configMode = 'lua-vimrc';
        else if (vimrc) data.configMode = 'vimrc';
        else if (lua) data.configMode = 'lua';
        else data.configMode = 'settings';
        invariant(
            ['lua-vimrc', 'lua', 'vimrc', 'settings'].includes(data.configMode),
            `Migration produced invalid configMode: "${data.configMode}"`,
        );
        delete data.enableVimrc;
        delete data.enableLuaConfig;
    }
    return data;
}

/**
 * `cursorlineopt` defaulted to `number` before it gained Neovim's full grammar;
 * the default is now Neovim's `both`. An install that already has settings on
 * disk but no stored `cursorlineopt` predates the change, so it keeps the old
 * value and sees no visual change. A fresh install (`data === null`) falls
 * through to the new default.
 */
export function migrateCursorlineoptSettings(
    data: Partial<VimMotionsSettings> | null,
): Partial<VimMotionsSettings> | null {
    if (!data) return data;
    const raw = data as Record<string, unknown>;
    if (!('cursorlineopt' in raw)) {
        raw.cursorlineopt = 'number';
    }
    return data;
}

export function migrateSigncolumnSettings(
    data: Partial<VimMotionsSettings> | null,
): Partial<VimMotionsSettings> | null {
    if (!data) return data;
    const raw = data as Record<string, unknown>;
    if (!('signcolumn' in raw) && 'enableMarkGutter' in raw) {
        raw.signcolumn = raw.enableMarkGutter === false ? 'no' : 'auto';
        delete raw.enableMarkGutter;
    }
    return data;
}

/**
 * Legacy table-widget values, resolved to a current one.
 *
 * Every legacy shape retargets to `'native'`, including the two that used to
 * mean `'raw'` (`suppressTableWidget: true` and `tablewidget=always`). `raw` is
 * deprecated, and it does not do what those settings were chosen for: it hides
 * Obsidian's widget with CSS while Obsidian still replaces the table's range,
 * so the table renders as nothing at all.
 *
 * An **explicit** stored `'raw'` is deliberately returned unchanged. This
 * release deprecates that value rather than removing it, and silently moving a
 * user off a documented option they chose is the thing a deprecation exists to
 * avoid.
 */
export function migrateTableWidgetMode(
    raw: Record<string, unknown> | null,
): 'native' | 'raw' | 'owned' | null {
    if (!raw) return null;
    if (
        'suppressTableWidget' in raw &&
        typeof raw.suppressTableWidget === 'boolean'
    ) {
        return 'native';
    }
    const mode = raw.tableWidgetMode;
    if (typeof mode !== 'string') return null;
    if (
        mode === 'off' ||
        mode === 'cursor' ||
        mode === 'embedded' ||
        mode === 'always'
    ) {
        return 'native';
    }
    return null;
}
