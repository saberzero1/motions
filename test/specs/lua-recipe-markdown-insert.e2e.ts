import { browser, expect } from '@wdio/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    loadLuaConfig,
    setupEditor,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
} from '../helpers';

// The "Markdown-aware `I`" recipe in docs/guides/lua-recipes.md (#241), read
// from the page itself so the documented code is what runs. Each case is the
// line before, and the line after typing Z where the mapping puts the cursor;
// the same 35 expectations were checked against Neovim 0.12 with the same
// file. With no recipe loaded, every case fails.
const RECIPES = fs.readFileSync(
    path.join(process.cwd(), 'docs/guides/lua-recipes.md'),
    'utf8',
);
const SECTION = RECIPES.split('## Markdown-aware `I`')[1] ?? '';
const RECIPE = /```lua\n([\s\S]*?)```/.exec(SECTION)?.[1] ?? '';

const CASES: [string, string][] = [
    ['- Bullet item', '- ZBullet item'],
    ['* Bullet item', '* ZBullet item'],
    ['+ Bullet item', '+ ZBullet item'],
    ['1. Numbered item', '1. ZNumbered item'],
    ['12. Numbered item', '12. ZNumbered item'],
    ['- [ ] Unchecked task', '- [ ] ZUnchecked task'],
    ['- [x] Completed task', '- [x] ZCompleted task'],
    ['12. [ ] Numbered task', '12. [ ] ZNumbered task'],
    ['    - Nested item', '    - ZNested item'],
    ['    - [ ] Nested task', '    - [ ] ZNested task'],
    ['- ', '- Z'],
    ['- [ ] ', '- [ ] Z'],
    ['-', '-Z'],
    ['  plain text', '  Zplain text'],
    ['> - Quoted item', '> - ZQuoted item'],
    ['> - [ ] Quoted task', '> - [ ] ZQuoted task'],
    ['>> 1. Nested quote', '>> 1. ZNested quote'],
    ['> > - [x] Spaced quote', '> > - [x] ZSpaced quote'],
    ['>     - Indented in quote', '>     - ZIndented in quote'],
    ['> - ', '> - Z'],
    ['> [!note] Callout title', '> [!note] ZCallout title'],
    ['> plain quote', '> Zplain quote'],
    ['> [!tip]- Folded callout', '> [!tip]- ZFolded callout'],
    ['> > [!info] Nested callout', '> > [!info] ZNested callout'],
    ['>> nested plain', '>> Znested plain'],
    ['  > indented quote', '  > Zindented quote'],
    ['> ', '> Z'],
    ['>', '>Z'],
    ['> [!note]', '> [!note]Z'],
    ['[!note] Not quoted', 'Z[!note] Not quoted'],
    ['> [link] text', '> Z[link] text'],
    ['- [✓] Unicode box', '- [✓] ZUnicode box'],
    ['- [!] Custom box', '- [!] ZCustom box'],
    ['- [ab] Not a box', '- Z[ab] Not a box'],
    ['-text', 'Z-text'],
];

async function press(...keys: string[]): Promise<void> {
    for (const key of keys) {
        await browser.keys([key]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Lua recipe: Markdown-aware I (#241)', function () {
    before(async function () {
        expect(RECIPE).toContain('local function text_col(line)');
        await loadLuaConfig(RECIPE);
    });

    afterEach(async function () {
        await sendVimEscape();
    });

    for (const [line, want] of CASES) {
        it(`<leader>i on ${JSON.stringify(line)}`, async function () {
            await setupEditor(`${line}\nnext`, {
                line: 0,
                ch: Math.max(line.length - 1, 0),
            });
            await press('\\', 'i');
            const mode = await getVimMode();
            await press('Z');
            await sendVimEscape();
            const text = (await getEditorValue()).split('\n')[0];
            expect({ mode, text }).toEqual({ mode: 'insert', text: want });
        });

        it(`insert-mode <C-q> on ${JSON.stringify(line)}`, async function () {
            await setupEditor(`${line}\nnext`, { line: 0, ch: 0 });
            await press('A');
            await browser.keys(['Control', 'q']);
            await browser.keys(['Control']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await press('Z');
            await sendVimEscape();
            expect((await getEditorValue()).split('\n')[0]).toBe(want);
        });
    }
});
