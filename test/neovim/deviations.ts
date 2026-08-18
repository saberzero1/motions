export interface Deviation {
    testPattern: string | RegExp;
    description: string;
    reason: string;
    fields: ('content' | 'cursor' | 'mode' | 'register')[];
    category:
        | 'intentional'
        | 'infra-limitation'
        | 'upstream-bug'
        | 'upstream-unsupported'
        | 'recording-issue';
}

export const KNOWN_DEVIATIONS: Deviation[] = [
    {
        testPattern: /zk with count skips folds backward/,
        description:
            '2zk fold traversal differs — Neovim treesitter markdown fold structure differs from heading-level fold provider',
        reason: 'Neovim treesitter creates different fold hierarchy for nested headings than our heading fold provider',
        fields: ['cursor'],
        category: 'infra-limitation',
    },
    {
        testPattern: /\[z moves to start of enclosing fold/,
        description:
            '[z enclosing fold boundary differs — CM6 foldable region starts at heading line vs Neovim fold body',
        reason: 'CM6 foldable() range starts at the heading line; Neovim treesitter fold starts at first content line',
        fields: ['cursor'],
        category: 'infra-limitation',
    },
    {
        testPattern: /\]z moves to end of enclosing fold/,
        description:
            ']z enclosing fold boundary differs — CM6 foldable region ends differently from Neovim treesitter',
        reason: 'CM6 foldable() range boundaries differ from Neovim treesitter fold boundaries',
        fields: ['cursor'],
        category: 'infra-limitation',
    },
    {
        testPattern: /\bgf\b/,
        description: 'gf opens quick switcher, not file under cursor',
        reason: 'Wikilinks are more natural for note navigation',
        fields: ['content', 'cursor'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: /\bY\b.*yank/i,
        description: 'Y mapped to y$ instead of yy',
        reason: 'Follows Neovim convention (intentional override)',
        fields: ['content'],
        category: 'intentional',
    },
    {
        testPattern: /\bQ\b.*macro/i,
        description: 'Q mapped to @@ instead of Ex mode',
        reason: 'Follows Neovim convention (intentional override)',
        fields: ['content'],
        category: 'intentional',
    },

    {
        testPattern: '<< should unindent line',
        description: '<< unindent behavior differs',
        reason: 'codemirror-vim and Neovim disagree on shiftwidth/tabstop defaults',
        fields: ['content'],
        category: 'intentional',
    },

    {
        testPattern: /\bgq/,
        description: 'gq wrapping differs from Neovim',
        reason: 'Plugin uses Markdown-aware wrapping at textwidth 80; Neovim uses plain-text formatting with textwidth 0',
        fields: ['content', 'cursor'],
        category: 'intentional',
    },

    {
        testPattern: '% should skip quoted brackets',
        description:
            '% goes to ch:3 instead of ch:6. Neovim skips brackets inside double-quoted strings when seeking match.',
        reason: "Markdown's Lezer parser does not classify double-quoted text as string tokens, so getTokenTypeAt returns empty for quotes in Markdown context",
        fields: ['cursor'],
        category: 'intentional',
    },

    {
        testPattern: 'N after / search should go to previous match',
        description:
            'N after /word search: cursor stays at (5,5) instead of moving to (5,0). CM6 search panel timing prevents reliable automated dispatch of /pattern followed by N.',
        reason: 'CM6 search panel timing in test infrastructure',
        fields: ['cursor'],
        category: 'infra-limitation',
    },
    {
        testPattern: 'lua keymap.del removes mapping',
        description:
            'After keymap.del, plugin default Q->@@ mapping remains active',
        reason: 'Plugin registers Q->@@ as a built-in default separately from Lua-registered maps; unmap only removes the Lua registration',
        fields: ['content'],
        category: 'upstream-bug',
    },

    {
        testPattern: 'lua vmap surrounds with parens',
        description:
            'Cursor position off by one after visual mode surround operation',
        reason: 'Visual mode cursor positioning after replace differs between codemirror-vim and Neovim',
        fields: ['cursor'],
        category: 'upstream-bug',
    },
    {
        testPattern: 'lua leader key mapping',
        description: 'Leader key mapping via executeLuaForTest does not fire',
        reason: 'Leader key set via leaderRegistry during test does not propagate to the vim engine keymap resolver within the same evaluation',
        fields: ['content'],
        category: 'upstream-bug',
    },
    {
        testPattern: 'macro insert repeat with dot',
        description:
            'Macro replay of $a inserts truncated text (missing leading chars)',
        reason: 'codemirror-vim macro replay of $a sequence loses characters at the append position',
        fields: ['content'],
        category: 'upstream-bug',
    },

    {
        testPattern: /^cst|^ysiwtdiv/,
        description:
            'cst and ys with tag target — golden recording uses nvim_feedkeys, may need re-recording',
        reason: 'Tag surround requires interactive input (tag name + Enter). Golden infra switched from nvim_input to nvim_feedkeys; re-record to verify',
        fields: ['content'],
        category: 'recording-issue',
    },
    {
        testPattern: 'ds< removes angle brackets with spaces',
        description:
            'ds< is intentionally a no-op — nvim-surround treats < as tag prompt',
        reason: 'Fork treats < as angle bracket (intentional design decision for Markdown users). nvim-surround golden shows ds< as no-op because < triggers tag prompt.',
        fields: ['content'],
        category: 'intentional',
    },
    {
        testPattern: 'ysiwb then . dot-repeat adds layers',
        description: 'ys dot-repeat does not replay surround-add correctly',
        reason: 'Pre-existing: dot-repeat of ys with text object motions (iw, aB) does not correctly restore the surround state. The ys_motion handler creates ys_replacement state but dot-repeat replay does not complete the motion dispatch.',
        fields: ['content'],
        category: 'upstream-bug',
    },
    {
        testPattern: /^(gh|gH|v then Ctrl-G|Ctrl-G in select)/,
        description: 'gh/gH select mode not entered via vimRawKeys dispatch',
        reason: 'Test infrastructure: browser.keys dispatches g and h as separate DOM events; the g prefix is consumed but gh action does not trigger in headless test environment',
        fields: ['content'],
        category: 'infra-limitation',
    },

    {
        testPattern: /gk over heading.*preserves column/,
        description:
            'gk across heading lines drifts cursor column due to proportional font',
        reason: 'CM6 moveVertically operates in pixel space; headings have wider characters than body text, so posAtCoords maps the same pixel X to a different character index. Neovim preserves curswant (character column) because all terminal chars are monospace.',
        fields: ['cursor'],
        category: 'intentional',
    },
    {
        testPattern: 'gk gj round-trip preserves column',
        description:
            'gk/gj round-trip restores column but intermediate positions differ from Neovim',
        reason: 'Same pixel-vs-character column deviation as above; round-trip works because goalColumn (pixel X) is preserved throughout',
        fields: ['cursor'],
        category: 'intentional',
    },
    {
        testPattern: ':d3 should delete 3 lines',
        description: ':d with count argument not supported',
        reason: 'codemirror-vim :d does not accept a count argument',
        fields: ['content'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: /^:m[+-]/,
        description: ':m (move) ex command not supported',
        reason: 'codemirror-vim does not implement the :move ex command',
        fields: ['content'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: /^:.*co.*should copy/,
        description: ':co (copy) ex command not supported',
        reason: 'codemirror-vim does not implement the :copy/:co ex command',
        fields: ['content'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: ':1,3m4 should move range',
        description: ':m (move) range not supported',
        reason: 'codemirror-vim does not implement the :move ex command',
        fields: ['content'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: ':$d should delete last line',
        description: ':$d cursor position differs',
        reason: 'codemirror-vim :d with $ address leaves cursor at different position',
        fields: ['cursor'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: ':g/pattern/m0 should reverse',
        description: ':g with :m subcommand not supported',
        reason: 'codemirror-vim :g does not support :m as a subcommand',
        fields: ['content'],
        category: 'upstream-unsupported',
    },
    {
        testPattern: 'Ctrl-U should delete to start of inserted text',
        description:
            'Ctrl-U deletes to line start instead of insert-mode entry point',
        reason: 'codemirror-vim Ctrl-U deletes to start of line, not to the position where insert mode was entered (Neovim tracks insert-start position)',
        fields: ['content'],
        category: 'upstream-bug',
    },

    {
        testPattern: 'V + < should unindent line',
        description: 'V< unindent differs from Neovim',
        reason: 'Same shiftwidth/tabstop default difference as << (CM6 tabSize=4 vs Neovim shiftwidth=8)',
        fields: ['content'],
        category: 'intentional',
    },
];

export function isKnownDeviation(testName: string): boolean {
    return KNOWN_DEVIATIONS.some((d) =>
        typeof d.testPattern === 'string'
            ? testName.includes(d.testPattern)
            : d.testPattern.test(testName),
    );
}

export function findDeviation(testName: string): Deviation | undefined {
    return KNOWN_DEVIATIONS.find((d) =>
        typeof d.testPattern === 'string'
            ? testName.includes(d.testPattern)
            : d.testPattern.test(testName),
    );
}
