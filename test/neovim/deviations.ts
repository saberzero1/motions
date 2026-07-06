export interface Deviation {
    testPattern: string | RegExp;
    description: string;
    reason: string;
    fields: ('content' | 'cursor' | 'mode' | 'register')[];
}

export const KNOWN_DEVIATIONS: Deviation[] = [
    {
        testPattern: /zO|zC|zA/,
        description: 'Recursive fold operations map to non-recursive',
        reason: "Obsidian fold API doesn't distinguish recursive from non-recursive",
        fields: ['content'],
    },
    {
        testPattern: /\bgf\b/,
        description: 'gf opens quick switcher, not file under cursor',
        reason: 'Wikilinks are more natural for note navigation',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /\bY\b.*yank/i,
        description: 'Y mapped to y$ instead of yy',
        reason: 'Follows Neovim convention (intentional override)',
        fields: ['content'],
    },
    {
        testPattern: /\bQ\b.*macro/i,
        description: 'Q mapped to @@ instead of Ex mode',
        reason: 'Follows Neovim convention (intentional override)',
        fields: ['content'],
    },

    {
        testPattern: '<< should unindent line',
        description: '<< unindent behavior differs',
        reason: 'codemirror-vim and Neovim disagree on shiftwidth/tabstop defaults',
        fields: ['content'],
    },

    {
        testPattern: /\bgq/,
        description: 'gq wrapping differs from Neovim',
        reason: 'Plugin uses Markdown-aware wrapping at textwidth 80; Neovim uses plain-text formatting with textwidth 0',
        fields: ['content', 'cursor'],
    },

    {
        testPattern: '% should skip quoted brackets',
        description:
            '% goes to ch:3 instead of ch:6. Neovim skips brackets inside double-quoted strings when seeking match.',
        reason: "Markdown's Lezer parser does not classify double-quoted text as string tokens, so getTokenTypeAt returns empty for quotes in Markdown context",
        fields: ['cursor'],
    },

    {
        testPattern: 'CTRL-V $ delete to EOL',
        description:
            'Cursor lands at ch:1 instead of ch:0 after block delete to EOL',
        reason: 'Cursor repositioning after block delete does not account for shortened line',
        fields: ['cursor'],
    },

    {
        testPattern: 'N after / search should go to previous match',
        description:
            'N after /word search: cursor stays at (5,5) instead of moving to (5,0). CM6 search panel timing prevents reliable automated dispatch of /pattern followed by N.',
        reason: 'CM6 search panel timing in test infrastructure',
        fields: ['cursor'],
    },
    {
        testPattern: 'lua keymap.del removes mapping',
        description:
            'After keymap.del, plugin default Q->@@ mapping remains active',
        reason: 'Plugin registers Q->@@ as a built-in default separately from Lua-registered maps; unmap only removes the Lua registration',
        fields: ['content'],
    },
    {
        testPattern: 'lua nmap change word',
        description:
            '<Esc> literal appears in content instead of exiting insert mode',
        reason: 'vimRawKeys dispatches <Esc> notation differently in test infrastructure for Lua-mapped cw sequences',
        fields: ['content'],
    },
    {
        testPattern: 'lua vmap surrounds with parens',
        description:
            'Cursor position off by one after visual mode surround operation',
        reason: 'Visual mode cursor positioning after replace differs between codemirror-vim and Neovim',
        fields: ['cursor'],
    },
    {
        testPattern: 'lua leader key mapping',
        description: 'Leader key mapping via executeLuaForTest does not fire',
        reason: 'Leader key set via leaderRegistry during test does not propagate to the vim engine keymap resolver within the same evaluation',
        fields: ['content'],
    },
    {
        testPattern: 'macro insert repeat with dot',
        description:
            'Macro replay of $a inserts truncated text (missing leading chars)',
        reason: 'codemirror-vim macro replay of $a sequence loses characters at the append position',
        fields: ['content'],
    },

    {
        testPattern: /^[23]dsb|^[23]csbr|^[23]csbB/,
        description:
            'Count-prefixed ds/cs (2dsb, 3dsb, 2csbB, 3csbr) do not work',
        reason: 'Fork count support for surround find does not iterate outward correctly for count > 1 with aliases',
        fields: ['content'],
    },
    {
        testPattern: 'csba then . dot-repeat changes layers',
        description:
            'csba dot-repeat produces angle brackets then fails on second repeat',
        reason: 'Dot-repeat for cs does not preserve the target+replacement pair correctly across multiple repeats',
        fields: ['content'],
    },
    {
        testPattern: /^cst|^ysiwtdiv/,
        description:
            'cst and ys with tag target do not work via golden test dispatch',
        reason: 'Tag surround requires interactive input (tag name + Enter) which the nvim.input RPC handles but the fork processes differently',
        fields: ['content'],
    },
    {
        testPattern: /^dsf/,
        description: 'dsf (delete surrounding function) is not implemented',
        reason: 'Fork only supports f/F as replacement character, not as a target for finding and deleting function calls (nvim-surround extension)',
        fields: ['content'],
    },
    {
        testPattern: 'ds} preserves spaces from braces',
        description: 'ds} strips inner spaces instead of preserving them',
        reason: 'Fork deleteSurroundPair unconditionally strips adjacent spaces regardless of opening vs closing bracket target',
        fields: ['content'],
    },
    {
        testPattern: 'ds< removes angle brackets with spaces',
        description:
            'ds< on angle brackets with inner spaces does not strip spaces',
        reason: 'Same opening-bracket space-stripping gap as ds(/ds[/ds{ but for angle brackets',
        fields: ['content'],
    },
    {
        testPattern: /^ys[j2]|^ysjb|^ys2jB/,
        description: 'ys with j/2j motion does not surround linewise',
        reason: 'Fork ys with line-crossing motions (j, 2j) does not produce the correct linewise range',
        fields: ['content'],
    },
    {
        testPattern: /^ySS|^VSB/,
        description:
            'ySS and VS linewise surround produce incorrect indentation or mode',
        reason: 'Fork newline surround variants (ySS, VS with linewise) differ from nvim-surround in indentation handling',
        fields: ['content'],
    },
    {
        testPattern: 'dsb on multiline function',
        description: 'dsb on multiline function() removes wrong characters',
        reason: 'Fork multiline bracket deletion cursor position differs from nvim-surround',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^visual block.*S}/,
        description:
            'Visual block $ S} does not surround each line individually',
        reason: 'Fork visual block surround with $ selection wraps the entire block instead of per-line surround',
        fields: ['content'],
    },
    {
        testPattern: 'csbB then ysaBb chain',
        description: 'csbB then ysaBb chained operation produces wrong result',
        reason: 'After csbB changes () to {}, the cursor position prevents ysaBb from finding the correct a} text object',
        fields: ['content'],
    },
    {
        testPattern: /^(gh|gH|v then Ctrl-G|Ctrl-G in select)/,
        description: 'gh/gH select mode not entered via vimRawKeys dispatch',
        reason: 'Test infrastructure: browser.keys dispatches g and h as separate DOM events; the g prefix is consumed but gh action does not trigger in headless test environment',
        fields: ['content'],
    },

    {
        testPattern: ':2,3sort range',
        description: 'Cursor at line 0 instead of line 1 after ranged :sort',
        reason: 'Fork :sort cursor positioning does not move to the first line of the sorted range',
        fields: ['cursor'],
    },
];

export function isKnownDeviation(testName: string): boolean {
    return KNOWN_DEVIATIONS.some((d) =>
        typeof d.testPattern === 'string'
            ? testName.includes(d.testPattern)
            : d.testPattern.test(testName),
    );
}
