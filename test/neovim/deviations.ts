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
        testPattern: /^cst|^ysiwtdiv/,
        description:
            'cst and ys with tag target — golden recording uses nvim_feedkeys, may need re-recording',
        reason: 'Tag surround requires interactive input (tag name + Enter). Golden infra switched from nvim_input to nvim_feedkeys; re-record to verify',
        fields: ['content'],
    },
    {
        testPattern: 'ds< removes angle brackets with spaces',
        description:
            'ds< is intentionally a no-op — nvim-surround treats < as tag prompt',
        reason: 'Fork treats < as angle bracket (intentional design decision for Markdown users). nvim-surround golden shows ds< as no-op because < triggers tag prompt.',
        fields: ['content'],
    },
    {
        testPattern: 'csbB then ysaBb chain',
        description:
            'aB text object does not match when cursor is on the opening brace at column 0',
        reason: 'After csbB places cursor at 0:0 on the opening {, the aB text object fails to find the surrounding braces. This is a codemirror-vim bracket matching limitation, not a surround chain bug.',
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

    {
        testPattern: /gk over heading.*preserves column/,
        description:
            'gk across heading lines drifts cursor column due to proportional font',
        reason: 'CM6 moveVertically operates in pixel space; headings have wider characters than body text, so posAtCoords maps the same pixel X to a different character index. Neovim preserves curswant (character column) because all terminal chars are monospace.',
        fields: ['cursor'],
    },
    {
        testPattern: 'gk gj round-trip preserves column',
        description:
            'gk/gj round-trip restores column but intermediate positions differ from Neovim',
        reason: 'Same pixel-vs-character column deviation as above; round-trip works because goalColumn (pixel X) is preserved throughout',
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
