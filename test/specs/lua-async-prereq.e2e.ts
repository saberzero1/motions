import { browser, expect } from '@wdio/globals';
import {
    loadLuaConfig,
    setupEditor,
    vimRawKeys,
    sendVimEscape,
    getEditorValue,
    PAUSE,
} from '../helpers';

/**
 * Prerequisites 1-3 of `.sisyphus/plans/async-keymap-callbacks.md`, exercised
 * through `vim.schedule` because it is already async-capable — none of this
 * needs the experimental keymap routing that plan would add later.
 */

describe('Lua async prerequisites', function () {
    describe('key waiter lifetime (D1)', function () {
        // The coroutine runner abandons an await after 10s. The waiter's
        // cleanup used to live in the promise it abandoned, so the capture
        // listener stayed installed and swallowed whatever the user typed
        // next. This is slow by nature: the bound has to actually elapse.
        it('P2a-iii: a timed-out getcharstr does not swallow the next keystroke', async function () {
            this.timeout(60000);

            await loadLuaConfig(
                [
                    `vim.schedule(function()`,
                    `  pcall(vim.fn.getcharstr)`,
                    `end)`,
                ].join('\n'),
            );

            await setupEditor('', { line: 0, ch: 0 });
            await browser.pause(12000);

            await vimRawKeys('i');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys('hello');
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect((await getEditorValue()).trim()).toBe('hello');
        });
    });

    describe('teardown while suspended (P3b)', function () {
        it('reloading the configuration under a suspended callback is clean', async function () {
            this.timeout(60000);

            await loadLuaConfig(
                [
                    `vim.schedule(function()`,
                    `  pcall(vim.fn.getcharstr)`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('', { line: 0, ch: 0 });

            // Reload replaces the Lua state while the callback is parked on the
            // key waiter. Before the runner was registered for teardown, the
            // waiter survived into a closed lua_State.
            await loadLuaConfig('vim.opt.scrolloff = 2');

            await setupEditor('', { line: 0, ch: 0 });
            await vimRawKeys('i');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await browser.keys('after');
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect((await getEditorValue()).trim()).toBe('after');
        });
    });

    // Smoke test, not a regression test. It confirms the save/restore rework
    // did not break ordinary `vim.v.event` delivery. It does NOT discriminate
    // the premature-clear defect: the autocmd reads its context at its own
    // start, before another callback could reset it. That case needs a
    // suspension between the write and the read, which is arranged
    // deterministically in `test/unit/lua/vim-v-context.test.ts` (P1b) and is
    // not reproducible from a spec without the routing this plan defers.
    describe('vim.v delivery after the context rework', function () {
        it('an autocmd callback still observes its own event', async function () {
            this.timeout(60000);

            await loadLuaConfig(
                [
                    `RESULT = 'unset'`,
                    `vim.api.nvim_create_autocmd('InsertEnter', {`,
                    `  callback = function()`,
                    `    local before = vim.v.event ~= nil and vim.v.event.event or 'nil'`,
                    `    RESULT = before`,
                    `  end,`,
                    `})`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { tostring(RESULT) })`,
                    `end)`,
                ].join('\n'),
            );

            await setupEditor('x', { line: 0, ch: 0 });
            await vimRawKeys('i');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect((await getEditorValue()).trim()).toBe('InsertEnter');
        });
    });
});
