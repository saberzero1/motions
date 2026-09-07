import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    vimRawKeys,
    getEditorValue,
    loadLuaConfig,
    sendVimEscape,
    PAUSE,
} from '../helpers';

/**
 * Phase 0 of `.sisyphus/plans/nvim-set-decoration-provider.md`.
 *
 * Measures which API gap actually blocks flash.nvim from rendering, instead of
 * assuming it is `nvim_set_decoration_provider`. Deleted once Phase 4 lands.
 */

interface Probe {
    tabwins?: number | string;
    bufs?: number | string;
    listwins?: number | string;
    redraw?: boolean;
    multiwin?: boolean | string;
    state?: { wins: number; results: number; labels: number } | string;
    extmarks?: number | string;
}

// `require()` uses the coroutine<->Promise bridge to read vault files, so it is
// an async API. Config load is async-capable; a `vim.keymap.set` callback is
// not (plain `lua_pcall`). So every module must be required at load time and
// captured, or the callback errors with "async APIs can only be called from
// async-capable callbacks". This split is itself a Phase 0 finding.
const PROBE_LUA = [
    `local L = {}`,
    `L.ok_flash, L.Flash = pcall(require, 'flash')`,
    `L.ok_cfg, L.Config = pcall(require, 'flash.config')`,
    `L.ok_state, L.State = pcall(require, 'flash.state')`,
    `if not L.ok_flash then L.flash_err = tostring(L.Flash) end`,
    `if not L.ok_cfg then L.cfg_err = tostring(L.Config) end`,
    `if not L.ok_state then L.state_err = tostring(L.State) end`,
    ``,
    `vim.keymap.set('n', 'Q', function()`,
    `  local P = {}`,
    `  local function try(name, fn)`,
    `    local ok, res = pcall(fn)`,
    `    if ok then P[name] = res else P[name] = 'ERR: ' .. tostring(res) end`,
    `  end`,
    `  P.loaded = {`,
    `    flash = L.ok_flash, config = L.ok_cfg, state = L.ok_state,`,
    `    flash_err = L.flash_err, cfg_err = L.cfg_err, state_err = L.state_err,`,
    `  }`,
    `  try('require_in_callback', function()`,
    `    local ok, err = pcall(require, 'flash.util')`,
    `    return ok and 'works' or ('blocked: ' .. tostring(err))`,
    `  end)`,
    `  try('tabwins', function() return #vim.api.nvim_tabpage_list_wins(0) end)`,
    `  try('bufs', function() return #vim.api.nvim_list_bufs() end)`,
    `  try('listwins', function() return #vim.api.nvim_list_wins() end)`,
    `  P.redraw = vim.api.nvim__redraw ~= nil`,
    `  try('multiwin', function()`,
    `    return L.Config.get().search.multi_window`,
    `  end)`,
    `  try('state', function()`,
    `    local st = L.State.new({`,
    `      prompt = { enabled = false },`,
    `      pattern = 'al',`,
    `      search = { multi_window = true, incremental = false },`,
    `    })`,
    `    local labels = 0`,
    `    for _, m in ipairs(st.results) do`,
    `      if m.label then labels = labels + 1 end`,
    `    end`,
    `    return { wins = #st.wins, results = #st.results, labels = labels }`,
    `  end)`,
    `  try('extmarks', function()`,
    `    local ns = vim.api.nvim_create_namespace('flash')`,
    `    return #vim.api.nvim_buf_get_extmarks(0, ns, 0, -1, {})`,
    `  end)`,
    `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { vim.json.encode(P) })`,
    `end)`,
].join('\n');

async function runProbe(): Promise<Probe> {
    await loadLuaConfig(PROBE_LUA);
    await setupEditor('alpha bravo alpha charlie\nalpha delta alpha echo', {
        line: 0,
        ch: 0,
    });
    await vimRawKeys('Q');
    await browser.pause(PAUSE.EDITOR_SETTLE);
    const raw = (await getEditorValue()).trim();
    try {
        return JSON.parse(raw) as Probe;
    } catch {
        throw new Error(`probe did not produce JSON. Buffer was:\n${raw}`);
    }
}

// Every module in the vendored flash tree. Requiring all of them at config
// load populates `package.loaded`, so flash's lazy proxy and its internal
// runtime `require`s hit the synchronous cache path (`src/lua/package.ts:76`)
// instead of attempting async file I/O.
const FLASH_MODULES = [
    'flash',
    'flash.cache',
    'flash.commands',
    'flash.config',
    'flash.hacks',
    'flash.highlight',
    'flash.jump',
    'flash.labeler',
    'flash.plugins.char',
    'flash.plugins.search',
    'flash.plugins.treesitter',
    'flash.prompt',
    'flash.rainbow',
    'flash.repeat',
    'flash.require',
    'flash.search',
    'flash.search.matcher',
    'flash.search.pattern',
    'flash.search.pos',
    'flash.state',
    'flash.util',
];

const EAGER_PRELOAD_LUA = [
    `local preload = { ${FLASH_MODULES.map((m) => `'${m}'`).join(', ')} }`,
    `local failed = {}`,
    `for _, m in ipairs(preload) do`,
    `  local ok, err = pcall(require, m)`,
    `  if not ok then failed[#failed + 1] = m .. ': ' .. tostring(err) end`,
    `end`,
    `local L = { preload_failed = failed }`,
    `L.ok_state, L.State = pcall(require, 'flash.state')`,
    ``,
    `vim.keymap.set('n', 'Q', function()`,
    `  local P = { preload_failed = L.preload_failed }`,
    `  local function try(name, fn)`,
    `    local ok, res = pcall(fn)`,
    `    if ok then P[name] = res else P[name] = 'ERR: ' .. tostring(res) end`,
    `  end`,
    `  try('multiwin', function()`,
    `    return require('flash.config').get().search.multi_window`,
    `  end)`,
    `  try('state', function()`,
    `    local st = L.State.new({`,
    `      prompt = { enabled = false },`,
    `      pattern = 'al',`,
    `      search = { multi_window = true, incremental = false },`,
    `    })`,
    `    local labels = 0`,
    `    for _, m in ipairs(st.results) do`,
    `      if m.label then labels = labels + 1 end`,
    `    end`,
    `    return { wins = #st.wins, results = #st.results, labels = labels }`,
    `  end)`,
    `  try('extmarks', function()`,
    `    local ns = vim.api.nvim_create_namespace('flash')`,
    `    return #vim.api.nvim_buf_get_extmarks(0, ns, 0, -1, {})`,
    `  end)`,
    `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { vim.json.encode(P) })`,
    `end)`,
].join('\n');

describe('flash.nvim render diagnostic (Phase 0)', function () {
    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('reports which API gap blocks rendering', async function () {
        const probe = await runProbe();

        // Always print the evidence table — this is the phase's deliverable.
        console.log('PHASE 0 EVIDENCE: ' + JSON.stringify(probe, null, 2));

        const domCounts = await browser.executeObsidian(() => ({
            virtText: document.querySelectorAll(
                '.vim-motions-extmark-virt-text',
            ).length,
            backdrop: document.querySelectorAll('.vim-hl-FlashBackdrop').length,
            match: document.querySelectorAll('.vim-hl-FlashMatch').length,
            current: document.querySelectorAll('.vim-hl-FlashCurrent').length,
        }));
        console.log('PHASE 0 DOM: ' + JSON.stringify(domCounts, null, 2));

        // flash must at least load and construct state; anything else is a
        // blocker we have not accounted for.
        // Characterization, not aspiration. flash's top-level modules load at
        // config time, but its lazy-require proxy pulls submodules from
        // runtime callbacks, where `require` is not async-capable. When that
        // is fixed this assertion fails on purpose — update it then.
        expect(probe.loaded).toMatchObject({
            flash: true,
            config: true,
            state: true,
        });
        expect(String(probe.require_in_callback)).toContain(
            'async APIs can only be called from async-capable callbacks',
        );
        expect(String(probe.state)).toContain(
            'async APIs can only be called from async-capable callbacks',
        );
    });

    it('eager pre-loading every submodule unblocks flash', async function () {
        await loadLuaConfig(EAGER_PRELOAD_LUA);
        await setupEditor('alpha bravo alpha charlie\nalpha delta alpha echo', {
            line: 0,
            ch: 0,
        });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const raw = (await getEditorValue()).trim();
        console.log('PHASE 0 EAGER-PRELOAD: ' + raw);

        const domCounts = await browser.executeObsidian(() => ({
            virtText: document.querySelectorAll(
                '.vim-motions-extmark-virt-text',
            ).length,
            backdrop: document.querySelectorAll('.vim-hl-FlashBackdrop').length,
            match: document.querySelectorAll('.vim-hl-FlashMatch').length,
            current: document.querySelectorAll('.vim-hl-FlashCurrent').length,
        }));
        console.log('PHASE 0 EAGER DOM: ' + JSON.stringify(domCounts));

        const probe = JSON.parse(raw) as Probe & { preload_failed?: string[] };

        // Characterization. Pre-loading clears the `require` blocker: every
        // module loads and config reads succeed. Phase 1 then cleared
        // `wins == 0`. What remains is a further gap inside `State.new`, which
        // belongs to the callback-runtime prerequisite, not to this plan.
        // Tighten these expectations as each blocker falls.
        expect(probe.preload_failed).toEqual([]);
        expect(probe.multiwin).toBe(true);
    });

    it('reports LuaJIT-only natives as unavailable, not as a read failure', async function () {
        await loadLuaConfig(
            [
                `local ok_ffi, err_ffi = pcall(require, 'ffi')`,
                `local ok_jit, err_jit = pcall(require, 'jit')`,
                `local ok_real, err_real = pcall(require, 'no_such_module_xyz')`,
                `result = table.concat({`,
                `  tostring(ok_ffi),`,
                `  tostring(err_ffi):find('requires LuaJIT') and 'named' or 'unnamed',`,
                `  tostring(ok_jit),`,
                `  tostring(ok_real),`,
                `  tostring(err_real):find('requires LuaJIT') and 'wrong' or 'ok',`,
                `}, '|')`,
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { result })`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        // ffi and jit fail with a message naming LuaJIT; an ordinary missing
        // module still reports as a plain not-found.
        expect((await getEditorValue()).trim()).toBe(
            'false|named|false|false|ok',
        );
    });
});
