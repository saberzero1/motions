/**
 * ESM barrel for the absorbed fengari Lua 5.3 VM fork.
 *
 * Re-exports the public API surface. The TS source files in this directory
 * are the fengari VM — see DIFFERENCES.md for how this fork diverges from
 * upstream fengari and standard Lua 5.3.
 */

import {
    lua,
    lauxlib,
    lualib,
    to_luastring,
    to_jsstring,
    setPlatformProvider,
} from './fengari.js';

export type { lua_State } from './lstate.js';

export { lua, lauxlib, lualib, to_luastring, to_jsstring, setPlatformProvider };

export interface PlatformProvider {
    isDesktop: boolean;
    requireModule?: (name: string) => unknown;
}
