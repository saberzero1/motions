/**
 * Spike: Phase 0 of `.sisyphus/plans/vim-ui-namespace.md`.
 *
 * The whole plan rests on one asymmetry: a `vim.keymap.set` callback runs on
 * the main state via plain `lua_pcall`, so it cannot yield — but a callback it
 * *stores* can be invoked later on a fresh coroutine thread and yield freely.
 * If that were wrong, the non-blocking `vim.ui.select` design would fail in
 * its most common call site while still passing a top-level test.
 *
 * Proves both directions before any of it is built.
 */
import { browser, expect } from '@wdio/globals';
import {
    loadLuaConfig,
    setupEditor,
    vimRawKeys,
    getEditorValue,
    sendVimEscape,
    PAUSE,
} from '../../helpers';

const PROBE = [
    `results = {}`,
    `vim.keymap.set('n', 'Q', function()`,
    `  local yielded_ok, yielded_err = pcall(function()`,
    `    return vim.ob.fs.read('Welcome.md')`,
    `  end)`,
    `  results.direct_yield_ok = yielded_ok`,
    `  results.direct_yield_err = tostring(yielded_err)`,
    ``,
    `  vim.schedule(function()`,
    `    local ok, err = pcall(function()`,
    `      return vim.ob.fs.read('Welcome.md')`,
    `    end)`,
    `    results.scheduled_ran = true`,
    `    results.scheduled_yield_ok = ok`,
    `    results.scheduled_yield_err = tostring(err)`,
    `    vim.api.nvim_buf_set_lines(0, 0, -1, false, {`,
    `      vim.json.encode(results),`,
    `    })`,
    `  end)`,
    `end)`,
].join('\n');

interface Probe {
    direct_yield_ok?: boolean;
    direct_yield_err?: string;
    scheduled_ran?: boolean;
    scheduled_yield_ok?: boolean;
    scheduled_yield_err?: string;
}

describe('Spike: vim.ui callback execution context', function () {
    this.timeout(60000);

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('a keymap callback cannot yield, but a callback it schedules can', async function () {
        await loadLuaConfig(PROBE);
        await setupEditor('probe target\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.pause(500);

        const raw = (await getEditorValue()).trim();
        console.log('PLAN-B PHASE 0: ' + raw);
        const probe = JSON.parse(raw) as Probe;

        // Direction 1: yielding directly from the keymap callback must fail.
        // This is the constraint the non-blocking design exists to route around.
        expect(probe.direct_yield_ok).toBe(false);
        expect(String(probe.direct_yield_err)).toContain(
            'async APIs can only be called from async-capable callbacks',
        );

        // Direction 2: a callback stored from that same synchronous context and
        // invoked later must run AND reach the async path. The load-bearing
        // assertion is the ABSENCE of the async-context error — asserting
        // success instead would couple this spike to vault fixture contents.
        expect(probe.scheduled_ran).toBe(true);
        expect(String(probe.scheduled_yield_err)).not.toContain(
            'async APIs can only be called from async-capable callbacks',
        );
        expect(probe.scheduled_yield_ok).toBe(true);
    });
});
