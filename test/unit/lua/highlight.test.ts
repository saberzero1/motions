import { describe, it, expect } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { HighlightManager } from '../../../src/lua/highlight';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';

class MockCSSStyleSheet {
    private css = '';
    replaceSync(text: string): void {
        this.css = text;
    }
    getCss(): string {
        return this.css;
    }
}

(globalThis as Record<string, unknown>).CSSStyleSheet = MockCSSStyleSheet;

function createMockDoc(): { doc: Document; getSheetCss: () => string } {
    const doc = {
        adoptedStyleSheets: [] as MockCSSStyleSheet[],
    } as unknown as Document;
    const getSheetCss = () =>
        (doc.adoptedStyleSheets as unknown as MockCSSStyleSheet[])
            .map((s) => s.getCss())
            .join('\n');
    return { doc, getSheetCss };
}

describe('HighlightManager', () => {
    it('returns attrs after setHighlight', () => {
        const manager = new HighlightManager();
        manager.setHighlight('MyGroup', { fg: '#ff0000', bold: true });
        expect(manager.getHighlight('MyGroup')).toEqual({
            fg: '#ff0000',
            bold: true,
        });
    });

    it('writes EasyMotionTarget fg to root vars', () => {
        const { doc, getSheetCss } = createMockDoc();
        const manager = new HighlightManager(doc);
        manager.setHighlight('EasyMotionTarget', { fg: '#00ff00' });
        expect(getSheetCss()).toContain('--vim-motions-em-fg: #00ff00');
    });

    it('writes StatusLineNormal bg to root vars', () => {
        const { doc, getSheetCss } = createMockDoc();
        const manager = new HighlightManager(doc);
        manager.setHighlight('StatusLineNormal', { bg: '#282a36' });
        expect(getSheetCss()).toContain('--vim-pl-normal-bg: #282a36');
    });

    it('creates CSS class for user highlight groups', () => {
        const { doc, getSheetCss } = createMockDoc();
        const manager = new HighlightManager(doc);
        manager.setHighlight('UserGroup', { fg: '#fff', italic: true });
        expect(getSheetCss()).toContain('.vim-hl-UserGroup');
    });

    it('resolves linked groups', () => {
        const manager = new HighlightManager();
        manager.setHighlight('MyGroup', { fg: '#123', bold: true });
        manager.setHighlight('X', { link: 'MyGroup' });
        expect(manager.getHighlight('X')).toEqual({ fg: '#123', bold: true });
    });

    it('respects default when group exists', () => {
        const manager = new HighlightManager();
        manager.setHighlight('X', { fg: '#fff' });
        manager.setHighlight('X', { fg: '#aaa', default: true });
        expect(manager.getHighlight('X')?.fg).toBe('#fff');
    });

    it('merges updates while keeping existing values', () => {
        const manager = new HighlightManager();
        manager.setHighlight('X', { fg: '#fff' });
        manager.setHighlight('X', { bold: true, update: true });
        expect(manager.getHighlight('X')).toEqual({ fg: '#fff', bold: true });
    });

    it('clears highlights', () => {
        const manager = new HighlightManager();
        manager.setHighlight('MyGroup', { fg: '#ff0000' });
        manager.clearHighlight('MyGroup');
        expect(manager.getHighlight('MyGroup')).toBeNull();
    });

    it('destroys styles and clears groups', () => {
        const { doc } = createMockDoc();
        const manager = new HighlightManager(doc);
        manager.setHighlight('MyGroup', { fg: '#ff0000' });
        manager.destroy();
        expect(
            (doc.adoptedStyleSheets as unknown as MockCSSStyleSheet[]).length,
        ).toBe(0);
        expect(manager.getHighlight('MyGroup')).toBeNull();
    });

    it('renders root vars and user classes together', () => {
        const { doc, getSheetCss } = createMockDoc();
        const manager = new HighlightManager(doc);
        manager.setHighlight('EasyMotionTarget', { fg: '#00ff00' });
        manager.setHighlight('UserGroup', { fg: '#fff' });
        expect(getSheetCss()).toContain(':root');
        expect(getSheetCss()).toContain('.vim-hl-UserGroup');
    });
});

describe('vim.api highlight integration', () => {
    it('sets highlight attributes via nvim_set_hl', () => {
        const L = createSandboxedState();
        const highlightManager = new HighlightManager();
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            autocmdManager: new AutocmdManager(L),
            highlightManager,
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.api.nvim_set_hl(0, "Test", { fg = "#ff0000" })'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(highlightManager.getHighlight('Test')?.fg).toBe('#ff0000');
        destroyState(L);
    });

    it('returns 0 from nvim_create_namespace', () => {
        const L = createSandboxedState();
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            autocmdManager: new AutocmdManager(L),
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('return vim.api.nvim_create_namespace("test")'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(lua.lua_tonumber(L, -1)).toBe(0);
        destroyState(L);
    });

    it('errors when using a non-zero namespace', () => {
        const L = createSandboxedState();
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            autocmdManager: new AutocmdManager(L),
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.api.nvim_set_hl(1, "Test", { fg = "#ff0000" })'),
        );
        expect(status).not.toBe(lua.LUA_OK);
        const message = lua.lua_tolstring(L, -1);
        const error = message ? to_jsstring(message) : '';
        expect(error).toContain(
            'namespaced highlights are not supported; use ns_id = 0',
        );
        lua.lua_pop(L, 1);
        destroyState(L);
    });
});
