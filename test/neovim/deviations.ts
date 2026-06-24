export interface Deviation {
    testPattern: string | RegExp;
    description: string;
    reason: string;
    fields: ('content' | 'cursor' | 'mode' | 'register')[];
}

export const KNOWN_DEVIATIONS: Deviation[] = [
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
        testPattern: ':join should join lines',
        description: ':join cursor position differs after join',
        reason: 'codemirror-vim handleEx places cursor at join point, Neovim at column 0',
        fields: ['cursor'],
    },
    {
        testPattern: ':global should execute',
        description: ':global cursor position differs after global command',
        reason: 'codemirror-vim handleEx cursor placement differs from Neovim after :g',
        fields: ['cursor'],
    },
    {
        testPattern: /\bgq/,
        description: 'gq wrapping differs from Neovim',
        reason: 'Plugin uses Markdown-aware wrapping at textwidth 80; Neovim uses plain-text formatting with textwidth 0',
        fields: ['content', 'cursor'],
    },
    {
        testPattern:
            'dw on empty line before whitespace should place cursor correctly',
        description:
            'dw on empty line: cursor goes to ch:0 instead of ch:1. Neovim places cursor at second char of whitespace-only line.',
        reason: 'codemirror-vim cursor positioning after dw on empty line',
        fields: ['cursor'],
    },
    {
        testPattern: 'd2w should delete across line boundary',
        description:
            'd2w leaves leading space instead of deleting entire content. Neovim deletes from cursor through second word across newline.',
        reason: 'codemirror-vim dw cross-line word count boundary',
        fields: ['content'],
    },
    {
        testPattern: 'dge on empty lines should delete all',
        description:
            'dge on double-empty-lines leaves one newline. Neovim deletes both empty lines entirely.',
        reason: 'codemirror-vim ge motion on empty lines deletes one fewer newline',
        fields: ['content'],
    },
    {
        testPattern:
            'db should delete across line boundary including whitespace',
        description:
            'db from line start keeps leading space. Neovim deletes from previous word start through newline, removing leading whitespace.',
        reason: 'codemirror-vim b motion cross-line does not include leading whitespace',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: '% should skip quoted brackets',
        description:
            '% goes to ch:9 instead of ch:6. Neovim skips brackets inside double-quoted strings when seeking match.',
        reason: 'codemirror-vim % does not skip brackets inside string literals',
        fields: ['cursor'],
    },
    {
        testPattern: 'N after / search should go to previous match',
        description:
            'N cursor at (1,1) instead of (2,3). Neovim N goes to previous search match from search start position.',
        reason: 'codemirror-vim jumplist/search state differs for N after / search',
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
