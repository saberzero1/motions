export interface Deviation {
    testPattern: string | RegExp;
    description: string;
    reason: string;
    fields: ('content' | 'cursor' | 'mode' | 'register')[];
}

export const KNOWN_DEVIATIONS: Deviation[] = [
    {
        testPattern: 'dG should delete from current line to end of file',
        description: 'dG leaves trailing newline',
        reason: 'codemirror-vim linewise delete preserves trailing newline',
        fields: ['content'],
    },
    {
        testPattern: ') at end of text should not move',
        description: 'Sentence motion cursor off-by-one at EOL',
        reason: 'codemirror-vim clamps to last char, not past it',
        fields: ['cursor'],
    },
    {
        testPattern: /CTRL-V block/,
        description: 'Block visual mode column editing',
        reason: 'CodeMirror Vim does not support block insert',
        fields: ['content'],
    },
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
        testPattern: 'diB with nested blockquote',
        description: 'iB does not scope to innermost blockquote nesting level',
        reason: 'Blockquote scanner has no nesting depth awareness',
        fields: ['content'],
    },
    {
        testPattern: 'di* with cursor on delimiter',
        description: 'di* operates when cursor is on the delimiter',
        reason: 'Delimiter scanner treats delimiter position as inside',
        fields: ['content'],
    },
    {
        testPattern: '. should repeat cw with typed text',
        description: 'Dot-repeat of cw + typed text unreliable',
        reason: 'codemirror-vim insert recording timing issue',
        fields: ['content'],
    },
    {
        testPattern: 'n should wrap to start when reaching end',
        description: 'n/N search wrap-around position unreliable',
        reason: 'codemirror-vim incsearch state affects cursor after wrap',
        fields: ['cursor'],
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
        testPattern: '>> should indent line',
        description: 'Cursor position after >> differs',
        reason: 'codemirror-vim places cursor at ch:1 after indent, Neovim at ch:0',
        fields: ['cursor'],
    },
    {
        testPattern: '<< should unindent line',
        description: '<< unindent behavior differs',
        reason: 'codemirror-vim and Neovim disagree on shiftwidth/tabstop defaults',
        fields: ['content'],
    },
    {
        testPattern: /diw should delete inner word/,
        description: 'diw word boundary differs at certain positions',
        reason: 'codemirror-vim and Neovim may select different words at same cursor position',
        fields: ['content'],
    },
    {
        testPattern: /da" should delete including quotes/,
        description: 'da" trailing space handling differs',
        reason: 'codemirror-vim preserves trailing space, Neovim consumes it',
        fields: ['content'],
    },
    {
        testPattern: 'di( across lines',
        description: 'di( multi-line newline preservation differs',
        reason: 'codemirror-vim collapses newlines inside parens, Neovim preserves them',
        fields: ['content'],
    },
    {
        testPattern: 'P should paste before cursor',
        description: 'P cursor position off-by-one after paste',
        reason: 'codemirror-vim places cursor one position further than Neovim after P',
        fields: ['cursor'],
    },
    {
        testPattern: /V \+ > should indent/,
        description: 'V + > cursor position after visual indent differs',
        reason: 'codemirror-vim places cursor at ch:1 after visual indent, Neovim at ch:0',
        fields: ['cursor'],
    },
    {
        testPattern: 'd0 at start should not delete',
        description: 'd0 at column 0 content difference',
        reason: 'codemirror-vim and Neovim differ on d0 behavior when already at column 0',
        fields: ['content'],
    },
    {
        testPattern: /^:s\//,
        description: 'Ex :s command via vimRawKeys does not open dialog',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:sort/,
        description: 'Ex :sort command via vimRawKeys does not open dialog',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:d should/,
        description: 'Ex :d command via vimRawKeys does not open dialog',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:yank/,
        description: 'Ex :yank command via vimRawKeys',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:join/,
        description: 'Ex :join command via vimRawKeys',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:noh/,
        description: 'Ex :nohlsearch command via vimRawKeys',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:undo/,
        description: 'Ex :undo command via vimRawKeys',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /^:redo/,
        description: 'Ex :redo command via vimRawKeys',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
    {
        testPattern: /global should execute/,
        description: 'Ex :global command via vimRawKeys',
        reason: 'Ex commands require Obsidian UI interaction, not raw key input',
        fields: ['content'],
    },
];

export function isKnownDeviation(testName: string): boolean {
    return KNOWN_DEVIATIONS.some((d) =>
        typeof d.testPattern === 'string'
            ? testName.includes(d.testPattern)
            : d.testPattern.test(testName),
    );
}
