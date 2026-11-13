/**
 * Compatibility name for the public IM switcher surface.
 *
 * The implementation now lives in InputMethodManager so focus transitions,
 * Vim mode changes, and Lua/ex-command calls share one serialized owner.
 */
export {
    InputMethodManager as ImSwitcher,
    type ImSwitcherConfig,
} from './input-method-manager';
