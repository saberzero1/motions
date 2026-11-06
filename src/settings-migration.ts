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
 * Every legacy shape retargets to `'native'`, or to `'auto'` in the one-time
 * move described at `toAuto`, including the two that used to
 * mean `'raw'` (`suppressTableWidget: true` and `tablewidget=always`). `raw` is
 * deprecated, and it does not do what those settings were chosen for: it hides
 * Obsidian's widget with CSS while Obsidian still replaces the table's range,
 * so the table renders as nothing at all.
 *
 * An **explicit** stored `'raw'` is deliberately returned unchanged. This
 * release deprecates that value rather than removing it, and silently moving a
 * user off a documented option they chose is the thing a deprecation exists to
 * avoid.
 *
 * `'owned'` retargets to `'reveal'`, its successor. The owned table surface
 * never shipped in a release and was removed before one; anyone who chose it
 * from a development build chose a plugin-owned table editor, which is what
 * `'reveal'` is.
 */
export function migrateTableWidgetMode(
    raw: Record<string, unknown> | null,
): 'auto' | 'native' | 'raw' | 'reveal' | null {
    if (!raw) return null;
    const native = toAuto(raw) ? 'auto' : 'native';
    if (
        'suppressTableWidget' in raw &&
        typeof raw.suppressTableWidget === 'boolean'
    ) {
        return native;
    }
    const mode = raw.tableWidgetMode;
    if (typeof mode !== 'string') return null;
    if (
        mode === 'native' ||
        mode === 'off' ||
        mode === 'cursor' ||
        mode === 'embedded' ||
        mode === 'always'
    ) {
        return native === mode ? null : native;
    }
    if (mode === 'owned') return 'reveal';
    return null;
}

/**
 * Whether stored settings still need the one-time move from `native` to
 * `auto`, which became the default.
 *
 * Settings are saved whole, defaults included, so a stored `native` cannot be
 * told apart from the old default. It moves once: nothing changes without the
 * Neovim backend, where `auto` is `native`, and a user who wants `native`
 * under the backend too picks it again, after which it stays. Settings saved
 * since then carry `tableWidgetAutoMigrated`, which the defaults supply to
 * every load and the next save writes.
 */
function toAuto(raw: Record<string, unknown>): boolean {
    return raw.tableWidgetAutoMigrated !== true;
}

/**
 * `tableAutoRealign` was a boolean before it gained `typing`. `true` meant
 * realign when insert mode ends, which is now `insertleave`. Returns the value
 * to store, or null when nothing needs to change.
 */
export function migrateTableAutoRealign(
    raw: Record<string, unknown> | null,
): 'off' | 'insertleave' | null {
    if (!raw || typeof raw.tableAutoRealign !== 'boolean') return null;
    return raw.tableAutoRealign ? 'insertleave' : 'off';
}
