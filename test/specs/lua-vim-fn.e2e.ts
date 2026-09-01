import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    setupEditor,
    getEditorValue,
    getCursorPos,
    getRegisterContent,
    getPluginSetting,
    PAUSE,
} from '../helpers';

async function executeLua(code: string): Promise<void> {
    await browser.executeObsidian(({ app }, luaCode: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { executeLuaForTest?: (code: string) => void }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        plugin?.executeLuaForTest?.(luaCode);
    }, code);
}

describe('vim.fn functions', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    // ── Registers ──────────────────────────────────────────────────────

    describe('Registers', function () {
        before(async function () {
            await loadLuaConfig('-- init register tests\n');
        });

        it('setreg sets register content', async function () {
            await setupEditor('test', { line: 0, ch: 0 });
            await executeLua('vim.fn.setreg("a", "hello vim")');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const reg = await getRegisterContent('a');
            expect(reg).not.toBeNull();
            expect(reg!.text).toBe('hello vim');
        });

        it('getreg reads back register content set by setreg', async function () {
            await loadLuaConfig(
                'vim.fn.setreg("b", "test content")\n' +
                    'if vim.fn.getreg("b") == "test content" then\n' +
                    '  vim.opt.scrolloff = 60\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(60);
        });

        it('getregtype returns V for linewise register', async function () {
            await loadLuaConfig(
                'vim.fn.setreg("c", "line text", "V")\n' +
                    'if vim.fn.getregtype("c") == "V" then\n' +
                    '  vim.opt.scrolloff = 61\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(61);
        });
    });

    // ── Buffer modification ────────────────────────────────────────────

    describe('Buffer modification', function () {
        before(async function () {
            await loadLuaConfig('-- init buffer tests\n');
        });

        it('setline replaces a line', async function () {
            await setupEditor('original content', { line: 0, ch: 0 });
            await executeLua('vim.fn.setline(1, "replaced")');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await getEditorValue()).toBe('replaced');
        });

        it('append inserts a string after a line', async function () {
            await setupEditor('line1', { line: 0, ch: 0 });
            await executeLua('vim.fn.append(1, "line2")');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await getEditorValue()).toBe('line1\nline2');
        });

        it('append inserts a list of strings after a line', async function () {
            await setupEditor('line1', { line: 0, ch: 0 });
            await executeLua('vim.fn.append(1, {"line2", "line3"})');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await getEditorValue()).toBe('line1\nline2\nline3');
        });

        it('indent returns indentation level in spaces', async function () {
            await loadLuaConfig(
                'vim.fn.setline(1, "    hello")\n' +
                    'local ind = vim.fn.indent(1)\n' +
                    'if ind == 4 then\n' +
                    '  vim.opt.scrolloff = 62\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(62);
        });
    });

    // ── Position / cursor ──────────────────────────────────────────────

    describe('Position/cursor', function () {
        before(async function () {
            await loadLuaConfig('-- init position tests\n');
        });

        it('nextnonblank finds the next non-blank line', async function () {
            await setupEditor('\nhello', { line: 0, ch: 0 });
            await executeLua(
                'local nb = vim.fn.nextnonblank(1)\n' +
                    'if nb == 2 then\n' +
                    '  vim.opt.scrolloff = 63\n' +
                    'end',
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await getPluginSetting('scrolloffLines')).toBe(63);
        });

        it('prevnonblank finds the previous non-blank line', async function () {
            await loadLuaConfig(
                'local pb = vim.fn.prevnonblank(1)\n' +
                    'if pb == 1 then\n' +
                    '  vim.opt.scrolloff = 64\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(64);
        });

        it('cursor moves the cursor to a 1-based position', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await executeLua('vim.fn.cursor(2, 4)');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(3);
        });

        it('setpos sets cursor position via dot expr', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await executeLua('vim.fn.setpos(".", {0, 1, 6, 0})');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(5);
        });

        it('getpos returns cursor position as a 4-element list', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });
            await executeLua(
                'local pos = vim.fn.getpos(".")\n' +
                    'if pos[2] >= 1 and pos[3] >= 1 then\n' +
                    '  vim.opt.scrolloff = 65\n' +
                    'end',
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await getPluginSetting('scrolloffLines')).toBe(65);
        });

        it('getcurpos returns cursor position as a 5-element list', async function () {
            await setupEditor('hello world', { line: 0, ch: 3 });
            await executeLua(
                'local pos = vim.fn.getcurpos()\n' +
                    'if pos[2] >= 1 and pos[3] >= 1 then\n' +
                    '  vim.opt.scrolloff = 66\n' +
                    'end',
            );
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await getPluginSetting('scrolloffLines')).toBe(66);
        });
    });

    // ── Type / introspection ───────────────────────────────────────────

    describe('Type/introspection', function () {
        it('type returns 0 for number', async function () {
            await loadLuaConfig(
                'if vim.fn.type(42) == 0 then\n' +
                    '  vim.opt.scrolloff = 67\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(67);
        });

        it('type returns 1 for string', async function () {
            await loadLuaConfig(
                'if vim.fn.type("hello") == 1 then\n' +
                    '  vim.opt.scrolloff = 68\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(68);
        });

        it('type returns 3 for list', async function () {
            await loadLuaConfig(
                'if vim.fn.type({1, 2, 3}) == 3 then\n' +
                    '  vim.opt.scrolloff = 69\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(69);
        });

        it('type returns 4 for dict', async function () {
            await loadLuaConfig(
                'if vim.fn.type({a = 1}) == 4 then\n' +
                    '  vim.opt.scrolloff = 70\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(70);
        });

        it('type returns 6 for bool', async function () {
            await loadLuaConfig(
                'if vim.fn.type(true) == 6 then\n' +
                    '  vim.opt.scrolloff = 71\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(71);
        });

        it('len returns string length', async function () {
            await loadLuaConfig(
                'if vim.fn.len("hello") == 5 then\n' +
                    '  vim.opt.scrolloff = 72\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(72);
        });

        it('len returns table length', async function () {
            await loadLuaConfig(
                'if vim.fn.len({1, 2, 3}) == 3 then\n' +
                    '  vim.opt.scrolloff = 73\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(73);
        });

        it('empty detects empty string and zero', async function () {
            await loadLuaConfig(
                'if vim.fn.empty("") == 1 and vim.fn.empty("x") == 0 then\n' +
                    '  vim.opt.scrolloff = 74\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(74);
        });
    });

    // ── Pattern matching ───────────────────────────────────────────────

    describe('Pattern matching', function () {
        it('matchstr extracts the first regex match', async function () {
            await loadLuaConfig(
                'local s = vim.fn.matchstr("hello world", "[a-z]+")\n' +
                    'if s == "hello" then\n' +
                    '  vim.opt.scrolloff = 75\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(75);
        });

        it('match returns the byte index of the first match', async function () {
            await loadLuaConfig(
                'local pos = vim.fn.match("hello", "ll")\n' +
                    'if pos == 2 then\n' +
                    '  vim.opt.scrolloff = 76\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(76);
        });

        it('matchlist returns capture groups', async function () {
            await loadLuaConfig(
                'local m = vim.fn.matchlist("hello 42", "([a-z]+) ([0-9]+)")\n' +
                    'if m[1] == "hello 42" and m[2] == "hello" and m[3] == "42" then\n' +
                    '  vim.opt.scrolloff = 77\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(77);
        });

        it('escape prepends backslash to specified characters', async function () {
            await loadLuaConfig(
                'local e = vim.fn.escape("a.b*c", ".*")\n' +
                    'if e == "a\\\\.b\\\\*c" then\n' +
                    '  vim.opt.scrolloff = 78\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(78);
        });
    });

    // ── String / list utilities ────────────────────────────────────────

    describe('String/list utilities', function () {
        it('repeat repeats a string N times', async function () {
            await loadLuaConfig(
                'local r = vim.fn["repeat"]("ab", 3)\n' +
                    'if r == "ababab" then\n' +
                    '  vim.opt.scrolloff = 79\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(79);
        });

        it('reverse reverses a string', async function () {
            await loadLuaConfig(
                'local s = vim.fn.reverse("hello")\n' +
                    'if s == "olleh" then\n' +
                    '  vim.opt.scrolloff = 80\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(80);
        });

        it('range generates a number sequence', async function () {
            await loadLuaConfig(
                'local r = vim.fn.range(1, 5)\n' +
                    'if #r == 5 and r[1] == 1 and r[5] == 5 then\n' +
                    '  vim.opt.scrolloff = 81\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(81);
        });

        it('sort sorts a list in-place', async function () {
            await loadLuaConfig(
                'local t = {"c", "a", "b"}\n' +
                    'vim.fn.sort(t)\n' +
                    'if t[1] == "a" and t[2] == "b" and t[3] == "c" then\n' +
                    '  vim.opt.scrolloff = 82\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(82);
        });

        it('uniq removes consecutive duplicates', async function () {
            await loadLuaConfig(
                'local t = {"a", "a", "b", "b", "c"}\n' +
                    'vim.fn.uniq(t)\n' +
                    'if t[1] == "a" and t[2] == "b" and t[3] == "c" then\n' +
                    '  vim.opt.scrolloff = 83\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(83);
        });

        it('max returns the largest number in a list', async function () {
            await loadLuaConfig(
                'if vim.fn.max({3, 7, 2}) == 7 then\n' +
                    '  vim.opt.scrolloff = 84\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(84);
        });

        it('min returns the smallest number in a list', async function () {
            await loadLuaConfig(
                'if vim.fn.min({3, 7, 2}) == 2 then\n' +
                    '  vim.opt.scrolloff = 85\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(85);
        });

        it('abs returns absolute value', async function () {
            await loadLuaConfig(
                'if vim.fn.abs(-5) == 5 then\n' +
                    '  vim.opt.scrolloff = 86\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(86);
        });

        it('index finds item position in a list (0-based)', async function () {
            await loadLuaConfig(
                'if vim.fn.index({"a", "b", "c"}, "b") == 1 then\n' +
                    '  vim.opt.scrolloff = 87\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(87);
        });

        it('count returns number of occurrences in a list', async function () {
            await loadLuaConfig(
                'if vim.fn.count({"a", "b", "a", "c", "a"}, "a") == 3 then\n' +
                    '  vim.opt.scrolloff = 88\n' +
                    'end\n',
            );
            expect(await getPluginSetting('scrolloffLines')).toBe(88);
        });
    });
});
