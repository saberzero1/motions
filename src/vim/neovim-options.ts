/**
 * Comprehensive registry of ALL Neovim options and their status in the plugin.
 *
 * Every Neovim option (from `src/nvim/options.lua` in the Neovim source) is
 * classified into one of these tiers:
 *
 * - `hardcoded`      — Behavior exists but is not user-configurable.
 *                       Logs an info-level note on first use.
 * - `noop-platform`  — Accepted silently. The option is irrelevant because
 *                       the platform (Obsidian/CodeMirror/browser) handles it.
 * - `noop-deferred`  — Accepted, logs an info-level note that support is planned.
 * - `rejected`       — Not accepted. Logs a warning with a clear reason.
 * - `not-applicable` — Terminal, GUI, or Neovim-server-specific. Accepted
 *                       silently (users copying vimrc from Neovim shouldn't
 *                       see noise for these).
 *
 * Options that are fully implemented live in KNOWN_SET_OPTIONS (loader.ts) and
 * are NOT duplicated here. This registry only covers options NOT in that table.
 */

export type NeovimOptionTier =
    | 'hardcoded'
    | 'noop-platform'
    | 'noop-deferred'
    | 'rejected'
    | 'not-applicable';

export interface NeovimOptionEntry {
    tier: NeovimOptionTier;
    /** Human-readable reason shown to the user. */
    reason: string;
}

/**
 * Registry of Neovim options not implemented in KNOWN_SET_OPTIONS.
 *
 * Keys include both full names and standard abbreviations.
 * Options already in KNOWN_SET_OPTIONS or already handled by the fork's
 * `defineOption()` are NOT listed here — they are fully functional.
 */
export const NEOVIM_OPTIONS: Record<string, NeovimOptionEntry> = {
    // ── Hardcoded: behavior exists but not user-configurable ────────────

    // ignorecase, smartcase, hlsearch, incsearch: now in KNOWN_SET_OPTIONS
    // wrapscan, startofline, nrformats: now in KNOWN_SET_OPTIONS
    magic: {
        tier: 'hardcoded',
        reason: 'always on (regex is always "magic")',
    },
    // tildeop: already correct — ~ acts as operator-motion by default

    // ── No-op (deferred): planned for future implementation ─────────────

    // whichwrap, gdefault, virtualedit: now in KNOWN_SET_OPTIONS
    // matchpairs, iskeyword: deferred (complex implementation)
    matchpairs: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (% matches (){}[]<> only)',
    },
    mps: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (% matches (){}[]<> only)',
    },
    iskeyword: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (word boundaries use CodeMirror defaults)',
    },
    isk: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (word boundaries use CodeMirror defaults)',
    },
    // joinspaces, shiftround, softtabstop, smarttab: now in KNOWN_SET_OPTIONS
    // timeoutlen, tm: now aliases for operatorshadowtimeout in the fork
    ttimeout: {
        tier: 'noop-platform',
        reason: 'terminal key code timeout — not applicable in browser',
    },
    ttimeoutlen: {
        tier: 'noop-platform',
        reason: 'terminal key code timeout — not applicable in browser',
    },
    ttm: {
        tier: 'noop-platform',
        reason: 'terminal key code timeout — not applicable in browser',
    },
    softtabstop: {
        tier: 'noop-platform',
        reason: 'use tabstop and shiftwidth',
    },
    sts: {
        tier: 'noop-platform',
        reason: 'use tabstop and shiftwidth',
    },
    smarttab: {
        tier: 'noop-platform',
        reason: 'Tab behavior is handled by CodeMirror',
    },
    sta: {
        tier: 'noop-platform',
        reason: 'Tab behavior is handled by CodeMirror',
    },
    linebreak: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (word wrap is controlled by Obsidian settings)',
    },
    lbr: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (word wrap is controlled by Obsidian settings)',
    },
    breakindent: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (wrapped line indentation is controlled by Obsidian)',
    },
    bri: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (wrapped line indentation is controlled by Obsidian)',
    },
    breakindentopt: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    briopt: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    showbreak: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (no indicator for wrapped lines)',
    },
    sbr: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (no indicator for wrapped lines)',
    },
    splitbelow: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (split direction is fixed)',
    },
    sb: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (split direction is fixed)',
    },
    splitright: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (split direction is fixed)',
    },
    spr: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (split direction is fixed)',
    },
    foldmethod: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (heading-based folds are used)',
    },
    fdm: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (heading-based folds are used)',
    },
    foldlevel: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (no initial fold level setting)',
    },
    fdl: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (no initial fold level setting)',
    },
    foldlevelstart: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    fdls: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    foldclose: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (folds do not auto-close when cursor leaves)',
    },
    fcl: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (folds do not auto-close when cursor leaves)',
    },
    foldminlines: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (minimum fold size is not configurable)',
    },
    foldnestmax: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (fold nesting is unlimited)',
    },
    fdn: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (fold nesting is unlimited)',
    },
    foldtext: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (fold placeholder text is fixed)',
    },
    fdt: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (fold placeholder text is fixed)',
    },
    foldexpr: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    fde: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    foldmarker: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    fmr: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    foldignore: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    fdi: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    colorcolumn: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (no column highlight)',
    },
    cc: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (no column highlight)',
    },
    concealcursor: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (concealment is controlled by Obsidian Live Preview)',
    },
    cocu: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (concealment is controlled by Obsidian Live Preview)',
    },
    conceallevel: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (concealment is controlled by Obsidian Live Preview)',
    },
    cole: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (concealment is controlled by Obsidian Live Preview)',
    },
    sidescrolloff: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (horizontal scroll margin is not configurable)',
    },
    siso: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (horizontal scroll margin is not configurable)',
    },
    sidescroll: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    ss: {
        tier: 'noop-deferred',
        reason: 'not yet implemented',
    },
    cursorcolumn: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (only cursorline is supported)',
    },
    cuc: {
        tier: 'noop-deferred',
        reason: 'not yet implemented (only cursorline is supported)',
    },

    // ── No-op (platform): Obsidian/CodeMirror/browser handles this ──────

    wrap: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian editor settings',
    },
    mouse: {
        tier: 'noop-platform',
        reason: 'handled natively by Obsidian',
    },
    encoding: {
        tier: 'noop-platform',
        reason: 'always UTF-8 in the browser',
    },
    enc: {
        tier: 'noop-platform',
        reason: 'always UTF-8 in the browser',
    },
    fileencoding: {
        tier: 'noop-platform',
        reason: 'always UTF-8 in the browser',
    },
    fenc: {
        tier: 'noop-platform',
        reason: 'always UTF-8 in the browser',
    },
    fileencodings: {
        tier: 'noop-platform',
        reason: 'always UTF-8 in the browser',
    },
    fencs: {
        tier: 'noop-platform',
        reason: 'always UTF-8 in the browser',
    },
    autoread: {
        tier: 'noop-platform',
        reason: 'Obsidian auto-reloads files',
    },
    ar: {
        tier: 'noop-platform',
        reason: 'Obsidian auto-reloads files',
    },
    autoindent: {
        tier: 'noop-platform',
        reason: 'handled by CodeMirror indentation extensions',
    },
    ai: {
        tier: 'noop-platform',
        reason: 'handled by CodeMirror indentation extensions',
    },
    smartindent: {
        tier: 'noop-platform',
        reason: 'handled by CodeMirror indentation extensions',
    },
    si: {
        tier: 'noop-platform',
        reason: 'handled by CodeMirror indentation extensions',
    },
    cindent: {
        tier: 'noop-platform',
        reason: 'handled by CodeMirror indentation extensions',
    },
    cin: {
        tier: 'noop-platform',
        reason: 'handled by CodeMirror indentation extensions',
    },
    undolevels: {
        tier: 'noop-platform',
        reason: 'undo depth is managed by CodeMirror',
    },
    ul: {
        tier: 'noop-platform',
        reason: 'undo depth is managed by CodeMirror',
    },
    undoreload: {
        tier: 'noop-platform',
        reason: 'undo depth is managed by CodeMirror',
    },
    ur: {
        tier: 'noop-platform',
        reason: 'undo depth is managed by CodeMirror',
    },
    history: {
        tier: 'noop-platform',
        reason: 'no persistent ex command history',
    },
    hi: {
        tier: 'noop-platform',
        reason: 'no persistent ex command history',
    },
    laststatus: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    ls: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    showmode: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    smd: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    showcmd: {
        tier: 'noop-platform',
        reason: 'use the chorddisplay plugin setting instead',
    },
    sc: {
        tier: 'noop-platform',
        reason: 'use the chorddisplay plugin setting instead',
    },
    showcmdloc: {
        tier: 'noop-platform',
        reason: 'use the chorddisplay plugin setting instead',
    },
    ruler: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    ru: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    rulerformat: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    ruf: {
        tier: 'noop-platform',
        reason: 'use the statusbar plugin setting instead',
    },
    wildmenu: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wmnu: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wildmode: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wim: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wildoptions: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wop: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wildchar: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wc: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wildcharm: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wcm: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wildignore: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wig: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wildignorecase: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    wic: {
        tier: 'noop-platform',
        reason: 'no command-line completion',
    },
    spell: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spelllang: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spl: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spellfile: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spf: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spellcapcheck: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spc: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spelloptions: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spo: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    spellsuggest: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    sps: {
        tier: 'noop-platform',
        reason: 'Obsidian has native spellcheck',
    },
    termguicolors: {
        tier: 'noop-platform',
        reason: 'always true in browser',
    },
    tgc: {
        tier: 'noop-platform',
        reason: 'always true in browser',
    },
    compatible: {
        tier: 'noop-platform',
        reason: 'always off',
    },
    cp: {
        tier: 'noop-platform',
        reason: 'always off',
    },
    swapfile: {
        tier: 'noop-platform',
        reason: 'no swap files in Obsidian',
    },
    swf: {
        tier: 'noop-platform',
        reason: 'no swap files in Obsidian',
    },
    backup: {
        tier: 'noop-platform',
        reason: 'no backup files in Obsidian (use Obsidian file recovery)',
    },
    bk: {
        tier: 'noop-platform',
        reason: 'no backup files in Obsidian (use Obsidian file recovery)',
    },
    writebackup: {
        tier: 'noop-platform',
        reason: 'no backup files in Obsidian',
    },
    wb: {
        tier: 'noop-platform',
        reason: 'no backup files in Obsidian',
    },
    backspace: {
        tier: 'noop-platform',
        reason: 'backspace behavior is handled by CodeMirror',
    },
    bs: {
        tier: 'noop-platform',
        reason: 'backspace behavior is handled by CodeMirror',
    },
    formatoptions: {
        tier: 'noop-platform',
        reason: 'use the listcontinuation plugin setting for list formatting',
    },
    fo: {
        tier: 'noop-platform',
        reason: 'use the listcontinuation plugin setting for list formatting',
    },
    hidden: {
        tier: 'noop-platform',
        reason: 'always on in Obsidian (tabs keep buffers open)',
    },
    hid: {
        tier: 'noop-platform',
        reason: 'always on in Obsidian (tabs keep buffers open)',
    },
    modeline: {
        tier: 'noop-platform',
        reason: 'not applicable (use vimrc/Lua config instead)',
    },
    ml: {
        tier: 'noop-platform',
        reason: 'not applicable (use vimrc/Lua config instead)',
    },
    modelineexpr: {
        tier: 'noop-platform',
        reason: 'not applicable',
    },
    mle: {
        tier: 'noop-platform',
        reason: 'not applicable',
    },
    modelines: {
        tier: 'noop-platform',
        reason: 'not applicable (use vimrc/Lua config instead)',
    },
    mls: {
        tier: 'noop-platform',
        reason: 'not applicable (use vimrc/Lua config instead)',
    },
    secure: {
        tier: 'noop-platform',
        reason: 'not applicable',
    },
    exrc: {
        tier: 'noop-platform',
        reason: 'not applicable (use vimrc/Lua config instead)',
    },
    ex: {
        tier: 'noop-platform',
        reason: 'not applicable (use vimrc/Lua config instead)',
    },
    confirm: {
        tier: 'noop-platform',
        reason: 'Obsidian handles save confirmations',
    },
    cf: {
        tier: 'noop-platform',
        reason: 'Obsidian handles save confirmations',
    },
    autowrite: {
        tier: 'noop-platform',
        reason: 'Obsidian auto-saves',
    },
    aw: {
        tier: 'noop-platform',
        reason: 'Obsidian auto-saves',
    },
    autowriteall: {
        tier: 'noop-platform',
        reason: 'Obsidian auto-saves',
    },
    awa: {
        tier: 'noop-platform',
        reason: 'Obsidian auto-saves',
    },
    errorbells: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    eb: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    visualbell: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    vb: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    belloff: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    bo: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    ttyfast: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    tf: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    lazyredraw: {
        tier: 'noop-platform',
        reason: 'not applicable in browser (rendering is handled by CodeMirror)',
    },
    lz: {
        tier: 'noop-platform',
        reason: 'not applicable in browser (rendering is handled by CodeMirror)',
    },
    redrawtime: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    rdt: {
        tier: 'noop-platform',
        reason: 'not applicable in browser',
    },
    background: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian theme',
    },
    bg: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian theme',
    },
    syntax: {
        tier: 'noop-platform',
        reason: 'syntax highlighting is handled by CodeMirror',
    },
    syn: {
        tier: 'noop-platform',
        reason: 'syntax highlighting is handled by CodeMirror',
    },
    list: {
        tier: 'noop-platform',
        reason: 'whitespace visualization is controlled by Obsidian settings',
    },
    listchars: {
        tier: 'noop-platform',
        reason: 'whitespace visualization is controlled by Obsidian settings',
    },
    lcs: {
        tier: 'noop-platform',
        reason: 'whitespace visualization is controlled by Obsidian settings',
    },
    readonly: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian file permissions',
    },
    ro: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian file permissions',
    },
    modifiable: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian',
    },
    ma: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian',
    },
    fileformat: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian',
    },
    ff: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian',
    },
    fileformats: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian',
    },
    ffs: {
        tier: 'noop-platform',
        reason: 'controlled by Obsidian',
    },

    // ── Not applicable: terminal, GUI, server, or Neovim-internal ───────

    // Terminal
    shell: { tier: 'not-applicable', reason: 'terminal option' },
    sh: { tier: 'not-applicable', reason: 'terminal option' },
    shellcmdflag: { tier: 'not-applicable', reason: 'terminal option' },
    shcf: { tier: 'not-applicable', reason: 'terminal option' },
    shellpipe: { tier: 'not-applicable', reason: 'terminal option' },
    sp: { tier: 'not-applicable', reason: 'terminal option' },
    shellquote: { tier: 'not-applicable', reason: 'terminal option' },
    shq: { tier: 'not-applicable', reason: 'terminal option' },
    shellredir: { tier: 'not-applicable', reason: 'terminal option' },
    srr: { tier: 'not-applicable', reason: 'terminal option' },
    shellslash: { tier: 'not-applicable', reason: 'terminal option' },
    ssl: { tier: 'not-applicable', reason: 'terminal option' },
    shelltemp: { tier: 'not-applicable', reason: 'terminal option' },
    stmp: { tier: 'not-applicable', reason: 'terminal option' },
    shellxescape: { tier: 'not-applicable', reason: 'terminal option' },
    sxe: { tier: 'not-applicable', reason: 'terminal option' },
    shellxquote: { tier: 'not-applicable', reason: 'terminal option' },
    sxq: { tier: 'not-applicable', reason: 'terminal option' },
    termencoding: { tier: 'not-applicable', reason: 'terminal option' },
    tenc: { tier: 'not-applicable', reason: 'terminal option' },
    termsync: { tier: 'not-applicable', reason: 'terminal option' },
    termpastefilter: { tier: 'not-applicable', reason: 'terminal option' },
    title: { tier: 'not-applicable', reason: 'terminal option' },
    titlelen: { tier: 'not-applicable', reason: 'terminal option' },
    titleold: { tier: 'not-applicable', reason: 'terminal option' },
    titlestring: { tier: 'not-applicable', reason: 'terminal option' },
    tist: { tier: 'not-applicable', reason: 'terminal option' },
    icon: { tier: 'not-applicable', reason: 'terminal option' },
    iconstring: { tier: 'not-applicable', reason: 'terminal option' },
    lines: { tier: 'not-applicable', reason: 'terminal option' },
    columns: { tier: 'not-applicable', reason: 'terminal option' },
    scrollback: { tier: 'not-applicable', reason: 'terminal option' },

    // GUI
    guifont: { tier: 'not-applicable', reason: 'GUI option' },
    gfn: { tier: 'not-applicable', reason: 'GUI option' },
    guifontwide: { tier: 'not-applicable', reason: 'GUI option' },
    gfw: { tier: 'not-applicable', reason: 'GUI option' },
    guioptions: { tier: 'not-applicable', reason: 'GUI option' },
    go: { tier: 'not-applicable', reason: 'GUI option' },
    guitablabel: { tier: 'not-applicable', reason: 'GUI option' },
    gtl: { tier: 'not-applicable', reason: 'GUI option' },
    guitabtooltip: { tier: 'not-applicable', reason: 'GUI option' },
    gtt: { tier: 'not-applicable', reason: 'GUI option' },
    linespace: { tier: 'not-applicable', reason: 'GUI option' },
    lsp: { tier: 'not-applicable', reason: 'GUI option' },
    menuitems: { tier: 'not-applicable', reason: 'GUI option' },
    mis: { tier: 'not-applicable', reason: 'GUI option' },
    langmenu: { tier: 'not-applicable', reason: 'GUI option' },
    lm: { tier: 'not-applicable', reason: 'GUI option' },
    winaltkeys: { tier: 'not-applicable', reason: 'GUI option' },
    wak: { tier: 'not-applicable', reason: 'GUI option' },
    browsedir: { tier: 'not-applicable', reason: 'GUI option' },
    bsdir: { tier: 'not-applicable', reason: 'GUI option' },

    // Mouse (Obsidian handles natively)
    mousefocus: {
        tier: 'not-applicable',
        reason: 'mouse option (Obsidian handles mouse)',
    },
    mousef: {
        tier: 'not-applicable',
        reason: 'mouse option (Obsidian handles mouse)',
    },
    mousehide: { tier: 'not-applicable', reason: 'mouse option' },
    mh: { tier: 'not-applicable', reason: 'mouse option' },
    mousemodel: { tier: 'not-applicable', reason: 'mouse option' },
    mousem: { tier: 'not-applicable', reason: 'mouse option' },
    mousemoveevent: { tier: 'not-applicable', reason: 'mouse option' },
    mousemev: { tier: 'not-applicable', reason: 'mouse option' },
    mousescroll: { tier: 'not-applicable', reason: 'mouse option' },
    mouseshape: { tier: 'not-applicable', reason: 'mouse option' },
    mousetime: { tier: 'not-applicable', reason: 'mouse option' },
    mouset: { tier: 'not-applicable', reason: 'mouse option' },

    // File I/O
    directory: { tier: 'not-applicable', reason: 'swap file directory' },
    dir: { tier: 'not-applicable', reason: 'swap file directory' },
    backupdir: { tier: 'not-applicable', reason: 'backup directory' },
    bdir: { tier: 'not-applicable', reason: 'backup directory' },
    undodir: {
        tier: 'not-applicable',
        reason: 'undo directory (use undofile plugin setting)',
    },
    udir: {
        tier: 'not-applicable',
        reason: 'undo directory (use undofile plugin setting)',
    },
    backupcopy: { tier: 'not-applicable', reason: 'backup strategy' },
    bkc: { tier: 'not-applicable', reason: 'backup strategy' },
    backupext: { tier: 'not-applicable', reason: 'backup file extension' },
    bex: { tier: 'not-applicable', reason: 'backup file extension' },
    backupskip: { tier: 'not-applicable', reason: 'backup skip pattern' },
    bsk: { tier: 'not-applicable', reason: 'backup skip pattern' },
    patchmode: { tier: 'not-applicable', reason: 'patch file mode' },
    pm: { tier: 'not-applicable', reason: 'patch file mode' },
    patchexpr: { tier: 'not-applicable', reason: 'patch expression' },
    pex: { tier: 'not-applicable', reason: 'patch expression' },

    // Session/view
    shada: {
        tier: 'not-applicable',
        reason: 'session persistence (use plugin settings)',
    },
    sd: { tier: 'not-applicable', reason: 'session persistence' },
    shadafile: { tier: 'not-applicable', reason: 'session persistence' },
    sdf: { tier: 'not-applicable', reason: 'session persistence' },
    sessionoptions: { tier: 'not-applicable', reason: 'session options' },
    ssop: { tier: 'not-applicable', reason: 'session options' },
    viewdir: { tier: 'not-applicable', reason: 'view directory' },
    vdir: { tier: 'not-applicable', reason: 'view directory' },
    viewoptions: { tier: 'not-applicable', reason: 'view options' },
    vop: { tier: 'not-applicable', reason: 'view options' },
    viminfo: { tier: 'not-applicable', reason: 'deprecated (use shada)' },

    // Tags/ctags
    tags: { tier: 'not-applicable', reason: 'ctags system' },
    tag: { tier: 'not-applicable', reason: 'ctags system' },
    tagbsearch: { tier: 'not-applicable', reason: 'ctags system' },
    tbs: { tier: 'not-applicable', reason: 'ctags system' },
    tagcase: { tier: 'not-applicable', reason: 'ctags system' },
    tc: { tier: 'not-applicable', reason: 'ctags system' },
    tagfunc: { tier: 'not-applicable', reason: 'ctags system' },
    tfu: { tier: 'not-applicable', reason: 'ctags system' },
    taglength: { tier: 'not-applicable', reason: 'ctags system' },
    tl: { tier: 'not-applicable', reason: 'ctags system' },
    tagrelative: { tier: 'not-applicable', reason: 'ctags system' },
    tr: { tier: 'not-applicable', reason: 'ctags system' },
    tagstack: { tier: 'not-applicable', reason: 'ctags system' },
    tgst: { tier: 'not-applicable', reason: 'ctags system' },

    // Quickfix/location list
    errorformat: { tier: 'not-applicable', reason: 'quickfix system' },
    efm: { tier: 'not-applicable', reason: 'quickfix system' },
    errorfile: { tier: 'not-applicable', reason: 'quickfix system' },
    ef: { tier: 'not-applicable', reason: 'quickfix system' },
    makeprg: { tier: 'not-applicable', reason: 'quickfix system' },
    mp: { tier: 'not-applicable', reason: 'quickfix system' },
    makeef: { tier: 'not-applicable', reason: 'quickfix system' },
    mef: { tier: 'not-applicable', reason: 'quickfix system' },
    grepprg: {
        tier: 'not-applicable',
        reason: 'use ripgrep plugin setting instead',
    },
    gp: {
        tier: 'not-applicable',
        reason: 'use ripgrep plugin setting instead',
    },
    grepformat: {
        tier: 'not-applicable',
        reason: 'use ripgrep plugin setting instead',
    },
    gfm: {
        tier: 'not-applicable',
        reason: 'use ripgrep plugin setting instead',
    },
    quickfixtextfunc: { tier: 'not-applicable', reason: 'quickfix system' },
    qftf: { tier: 'not-applicable', reason: 'quickfix system' },

    // Completion
    complete: { tier: 'not-applicable', reason: 'completion system' },
    cpt: { tier: 'not-applicable', reason: 'completion system' },
    completefunc: { tier: 'not-applicable', reason: 'completion system' },
    cfu: { tier: 'not-applicable', reason: 'completion system' },
    omnifunc: { tier: 'not-applicable', reason: 'completion system' },
    ofu: { tier: 'not-applicable', reason: 'completion system' },
    completeopt: { tier: 'not-applicable', reason: 'completion system' },
    cot: { tier: 'not-applicable', reason: 'completion system' },
    pumheight: { tier: 'not-applicable', reason: 'completion popup' },
    ph: { tier: 'not-applicable', reason: 'completion popup' },
    pumwidth: { tier: 'not-applicable', reason: 'completion popup' },
    pw: { tier: 'not-applicable', reason: 'completion popup' },
    pumblend: { tier: 'not-applicable', reason: 'completion popup' },

    // Diff
    diff: { tier: 'not-applicable', reason: 'diff mode' },
    diffexpr: { tier: 'not-applicable', reason: 'diff mode' },
    dex: { tier: 'not-applicable', reason: 'diff mode' },
    diffopt: { tier: 'not-applicable', reason: 'diff mode' },
    dip: { tier: 'not-applicable', reason: 'diff mode' },

    // Buffer management
    buftype: { tier: 'not-applicable', reason: 'buffer system' },
    bt: { tier: 'not-applicable', reason: 'buffer system' },
    bufhidden: { tier: 'not-applicable', reason: 'buffer system' },
    bh: { tier: 'not-applicable', reason: 'buffer system' },
    buflisted: { tier: 'not-applicable', reason: 'buffer system' },
    bl: { tier: 'not-applicable', reason: 'buffer system' },
    switchbuf: { tier: 'not-applicable', reason: 'buffer system' },
    swb: { tier: 'not-applicable', reason: 'buffer system' },

    // Window management
    equalalways: {
        tier: 'not-applicable',
        reason: 'window management (Obsidian handles pane sizing)',
    },
    ea: { tier: 'not-applicable', reason: 'window management' },
    eadirection: { tier: 'not-applicable', reason: 'window management' },
    ead: { tier: 'not-applicable', reason: 'window management' },
    winheight: { tier: 'not-applicable', reason: 'window management' },
    wh: { tier: 'not-applicable', reason: 'window management' },
    winwidth: { tier: 'not-applicable', reason: 'window management' },
    wiw: { tier: 'not-applicable', reason: 'window management' },
    winminheight: { tier: 'not-applicable', reason: 'window management' },
    wmh: { tier: 'not-applicable', reason: 'window management' },
    winminwidth: { tier: 'not-applicable', reason: 'window management' },
    wmw: { tier: 'not-applicable', reason: 'window management' },
    winfixheight: { tier: 'not-applicable', reason: 'window management' },
    wfh: { tier: 'not-applicable', reason: 'window management' },
    winfixwidth: { tier: 'not-applicable', reason: 'window management' },
    wfw: { tier: 'not-applicable', reason: 'window management' },
    previewheight: { tier: 'not-applicable', reason: 'window management' },
    pvh: { tier: 'not-applicable', reason: 'window management' },
    previewwindow: { tier: 'not-applicable', reason: 'window management' },
    pvw: { tier: 'not-applicable', reason: 'window management' },

    // Messages/debug
    shortmess: { tier: 'not-applicable', reason: 'message format' },
    shm: { tier: 'not-applicable', reason: 'message format' },
    verbose: { tier: 'not-applicable', reason: 'debug output' },
    vbs: { tier: 'not-applicable', reason: 'debug output' },
    verbosefile: { tier: 'not-applicable', reason: 'debug output' },
    vfile: { tier: 'not-applicable', reason: 'debug output' },
    debug: { tier: 'not-applicable', reason: 'debug mode' },

    // Scripting/autocommands
    eventignore: { tier: 'not-applicable', reason: 'autocommand control' },
    ei: { tier: 'not-applicable', reason: 'autocommand control' },
    maxfuncdepth: { tier: 'not-applicable', reason: 'Vimscript runtime' },
    mfd: { tier: 'not-applicable', reason: 'Vimscript runtime' },
    maxmapdepth: { tier: 'not-applicable', reason: 'Vimscript runtime' },
    maxmempattern: { tier: 'not-applicable', reason: 'Vimscript runtime' },
    mmp: { tier: 'not-applicable', reason: 'Vimscript runtime' },

    // Paths/plugins
    runtimepath: { tier: 'not-applicable', reason: 'Neovim plugin system' },
    rtp: { tier: 'not-applicable', reason: 'Neovim plugin system' },
    packpath: { tier: 'not-applicable', reason: 'Neovim plugin system' },
    pp: { tier: 'not-applicable', reason: 'Neovim plugin system' },
    loadplugins: { tier: 'not-applicable', reason: 'Neovim plugin system' },
    lpl: { tier: 'not-applicable', reason: 'Neovim plugin system' },
    helpfile: { tier: 'not-applicable', reason: 'Neovim help system' },
    hf: { tier: 'not-applicable', reason: 'Neovim help system' },
    helpheight: { tier: 'not-applicable', reason: 'Neovim help system' },
    hh: { tier: 'not-applicable', reason: 'Neovim help system' },
    helplang: { tier: 'not-applicable', reason: 'Neovim help system' },
    hlg: { tier: 'not-applicable', reason: 'Neovim help system' },

    // Misc
    keywordprg: { tier: 'not-applicable', reason: 'external program for K' },
    kp: { tier: 'not-applicable', reason: 'external program for K' },
    equalprg: { tier: 'not-applicable', reason: 'external program for =' },
    ep: { tier: 'not-applicable', reason: 'external program for =' },
    formatprg: { tier: 'not-applicable', reason: 'external format program' },
    fp: { tier: 'not-applicable', reason: 'external format program' },
    include: { tier: 'not-applicable', reason: 'C include pattern' },
    inc: { tier: 'not-applicable', reason: 'C include pattern' },
    includeexpr: { tier: 'not-applicable', reason: 'C include expression' },
    inex: { tier: 'not-applicable', reason: 'C include expression' },
    define: { tier: 'not-applicable', reason: 'C define pattern' },
    def: { tier: 'not-applicable', reason: 'C define pattern' },
    path: { tier: 'not-applicable', reason: 'file search path' },
    pa: { tier: 'not-applicable', reason: 'file search path' },
    cdpath: { tier: 'not-applicable', reason: 'directory search path' },
    suffixes: { tier: 'not-applicable', reason: 'file suffix priority' },
    su: { tier: 'not-applicable', reason: 'file suffix priority' },
    suffixesadd: { tier: 'not-applicable', reason: 'file suffix resolution' },
    sua: { tier: 'not-applicable', reason: 'file suffix resolution' },
    isfname: { tier: 'not-applicable', reason: 'filename character class' },
    isf: { tier: 'not-applicable', reason: 'filename character class' },
    isident: { tier: 'not-applicable', reason: 'identifier character class' },
    isi: { tier: 'not-applicable', reason: 'identifier character class' },
    isprint: { tier: 'not-applicable', reason: 'printable character class' },
    isp: { tier: 'not-applicable', reason: 'printable character class' },
    dictionary: { tier: 'not-applicable', reason: 'dictionary completion' },
    dict: { tier: 'not-applicable', reason: 'dictionary completion' },
    thesaurus: { tier: 'not-applicable', reason: 'thesaurus completion' },
    tsr: { tier: 'not-applicable', reason: 'thesaurus completion' },
    thesaurusfunc: { tier: 'not-applicable', reason: 'thesaurus function' },
    tsrfu: { tier: 'not-applicable', reason: 'thesaurus function' },
    comments: { tier: 'not-applicable', reason: 'comment format string' },
    com: { tier: 'not-applicable', reason: 'comment format string' },
    commentstring: { tier: 'not-applicable', reason: 'comment format string' },
    cms: { tier: 'not-applicable', reason: 'comment format string' },
    formatlistpat: { tier: 'not-applicable', reason: 'list format pattern' },
    flp: { tier: 'not-applicable', reason: 'list format pattern' },
    formatexpr: { tier: 'not-applicable', reason: 'format expression' },
    fex: { tier: 'not-applicable', reason: 'format expression' },
    paragraphs: { tier: 'not-applicable', reason: 'nroff paragraph macros' },
    para: { tier: 'not-applicable', reason: 'nroff paragraph macros' },
    sections: { tier: 'not-applicable', reason: 'nroff section macros' },
    sect: { tier: 'not-applicable', reason: 'nroff section macros' },
    cpoptions: { tier: 'not-applicable', reason: 'vi compatibility flags' },
    cpo: { tier: 'not-applicable', reason: 'vi compatibility flags' },
    edcompatible: { tier: 'not-applicable', reason: 'ed compatibility' },
    ed: { tier: 'not-applicable', reason: 'ed compatibility' },
    report: { tier: 'not-applicable', reason: 'change report threshold' },
    updatecount: { tier: 'not-applicable', reason: 'swap file update count' },
    uc: { tier: 'not-applicable', reason: 'swap file update count' },
    fsync: { tier: 'not-applicable', reason: 'file system sync' },
    synmaxcol: {
        tier: 'not-applicable',
        reason: 'syntax highlight column limit',
    },
    smc: { tier: 'not-applicable', reason: 'syntax highlight column limit' },
    regexpengine: { tier: 'not-applicable', reason: 'regex engine selection' },
    re: { tier: 'not-applicable', reason: 'regex engine selection' },
    pyxversion: { tier: 'not-applicable', reason: 'Python version' },
    pyx: { tier: 'not-applicable', reason: 'Python version' },
    cmdheight: { tier: 'not-applicable', reason: 'command line height' },
    ch: { tier: 'not-applicable', reason: 'command line height' },
    cmdwinheight: { tier: 'not-applicable', reason: 'command window height' },
    cwh: { tier: 'not-applicable', reason: 'command window height' },
    cedit: { tier: 'not-applicable', reason: 'command-line editing key' },
    more: { tier: 'not-applicable', reason: 'message paging' },
    terse: { tier: 'not-applicable', reason: 'terse messages' },
    tabpagemax: { tier: 'not-applicable', reason: 'tab page limit' },
    tpm: { tier: 'not-applicable', reason: 'tab page limit' },
    tabline: { tier: 'not-applicable', reason: 'tab line format' },
    tal: { tier: 'not-applicable', reason: 'tab line format' },
    showtabline: { tier: 'not-applicable', reason: 'tab line visibility' },
    stal: { tier: 'not-applicable', reason: 'tab line visibility' },
    statusline: {
        tier: 'not-applicable',
        reason: 'use the statusbar plugin setting',
    },
    stl: { tier: 'not-applicable', reason: 'use the statusbar plugin setting' },
    winbar: { tier: 'not-applicable', reason: 'window bar format' },

    // Internationalization
    arabic: { tier: 'not-applicable', reason: 'Arabic-specific' },
    arab: { tier: 'not-applicable', reason: 'Arabic-specific' },
    arabicshape: { tier: 'not-applicable', reason: 'Arabic-specific' },
    arshape: { tier: 'not-applicable', reason: 'Arabic-specific' },
    rightleft: { tier: 'not-applicable', reason: 'right-to-left mode' },
    rl: { tier: 'not-applicable', reason: 'right-to-left mode' },
    rightleftcmd: { tier: 'not-applicable', reason: 'right-to-left mode' },
    rlc: { tier: 'not-applicable', reason: 'right-to-left mode' },
    hkmap: { tier: 'not-applicable', reason: 'Hebrew keyboard' },
    hk: { tier: 'not-applicable', reason: 'Hebrew keyboard' },
    hkmapp: { tier: 'not-applicable', reason: 'Hebrew keyboard' },
    hkp: { tier: 'not-applicable', reason: 'Hebrew keyboard' },
    aleph: { tier: 'not-applicable', reason: 'Hebrew character' },
    al: { tier: 'not-applicable', reason: 'Hebrew character' },
    termbidi: { tier: 'not-applicable', reason: 'terminal bidi' },
    tbidi: { tier: 'not-applicable', reason: 'terminal bidi' },
    keymap: { tier: 'not-applicable', reason: 'use langmap instead' },
    kmp: { tier: 'not-applicable', reason: 'use langmap instead' },
    iminsert: {
        tier: 'not-applicable',
        reason: 'use imswitching plugin setting',
    },
    imi: { tier: 'not-applicable', reason: 'use imswitching plugin setting' },
    imsearch: {
        tier: 'not-applicable',
        reason: 'use imswitching plugin setting',
    },
    ims: { tier: 'not-applicable', reason: 'use imswitching plugin setting' },
    imcmdline: {
        tier: 'not-applicable',
        reason: 'use imswitching plugin setting',
    },
    imc: { tier: 'not-applicable', reason: 'use imswitching plugin setting' },
    imdisable: {
        tier: 'not-applicable',
        reason: 'use imswitching plugin setting',
    },
    imd: { tier: 'not-applicable', reason: 'use imswitching plugin setting' },
    digraph: { tier: 'not-applicable', reason: 'digraph input' },
    dg: { tier: 'not-applicable', reason: 'digraph input' },

    // Misc internal
    modified: { tier: 'not-applicable', reason: 'buffer state' },
    mod: { tier: 'not-applicable', reason: 'buffer state' },
    binary: { tier: 'not-applicable', reason: 'binary editing' },
    bin: { tier: 'not-applicable', reason: 'binary editing' },
    bomb: { tier: 'not-applicable', reason: 'BOM handling' },
    endofline: { tier: 'not-applicable', reason: 'end-of-line marker' },
    eol: { tier: 'not-applicable', reason: 'end-of-line marker' },
    endoffile: { tier: 'not-applicable', reason: 'end-of-file marker' },
    eof: { tier: 'not-applicable', reason: 'end-of-file marker' },
    fixendofline: { tier: 'not-applicable', reason: 'end-of-line fix' },
    fixeol: { tier: 'not-applicable', reason: 'end-of-line fix' },
    charconvert: { tier: 'not-applicable', reason: 'character conversion' },
    ccv: { tier: 'not-applicable', reason: 'character conversion' },
    makeencoding: { tier: 'not-applicable', reason: 'make encoding' },
    menc: { tier: 'not-applicable', reason: 'make encoding' },
    delcombine: {
        tier: 'not-applicable',
        reason: 'combining character deletion',
    },
    deco: { tier: 'not-applicable', reason: 'combining character deletion' },
    maxcombine: { tier: 'not-applicable', reason: 'combining character limit' },
    mco: { tier: 'not-applicable', reason: 'combining character limit' },
    ambiwidth: { tier: 'not-applicable', reason: 'ambiguous width characters' },
    ambw: { tier: 'not-applicable', reason: 'ambiguous width characters' },
    emoji: { tier: 'not-applicable', reason: 'emoji width' },
    fileignorecase: {
        tier: 'not-applicable',
        reason: 'filename case sensitivity',
    },
    fic: { tier: 'not-applicable', reason: 'filename case sensitivity' },
    highlight: { tier: 'not-applicable', reason: 'highlight group override' },
    hl: { tier: 'not-applicable', reason: 'highlight group override' },
    langnoremap: { tier: 'not-applicable', reason: 'langmap remap control' },
    lnr: { tier: 'not-applicable', reason: 'langmap remap control' },
    langremap: { tier: 'not-applicable', reason: 'langmap remap control' },
    lrm: { tier: 'not-applicable', reason: 'langmap remap control' },
    opendevice: { tier: 'not-applicable', reason: 'device file opening' },
    od: { tier: 'not-applicable', reason: 'device file opening' },
    paste: {
        tier: 'not-applicable',
        reason: 'paste mode (not needed in browser)',
    },
    pastetoggle: { tier: 'not-applicable', reason: 'paste toggle key' },
    pt: { tier: 'not-applicable', reason: 'paste toggle key' },
    quoteescape: { tier: 'not-applicable', reason: 'quote escape characters' },
    qe: { tier: 'not-applicable', reason: 'quote escape characters' },
    allowrevins: { tier: 'not-applicable', reason: 'reverse insert' },
    ari: { tier: 'not-applicable', reason: 'reverse insert' },
    revins: { tier: 'not-applicable', reason: 'reverse insert' },
    ri: { tier: 'not-applicable', reason: 'reverse insert' },
    insertmode: { tier: 'not-applicable', reason: 'permanent insert mode' },
    im: { tier: 'not-applicable', reason: 'permanent insert mode' },
    casemap: { tier: 'not-applicable', reason: 'case mapping' },
    cmp: { tier: 'not-applicable', reason: 'case mapping' },
    infercase: { tier: 'not-applicable', reason: 'completion case inference' },
    inf: { tier: 'not-applicable', reason: 'completion case inference' },
    selection: { tier: 'not-applicable', reason: 'selection behavior' },
    sel: { tier: 'not-applicable', reason: 'selection behavior' },
    warn: { tier: 'not-applicable', reason: 'write warning' },
    write: { tier: 'not-applicable', reason: 'write enable' },
    writeany: { tier: 'not-applicable', reason: 'write any buffer' },
    wa: { tier: 'not-applicable', reason: 'write any buffer' },
    writedelay: { tier: 'not-applicable', reason: 'write delay' },
    autochdir: { tier: 'not-applicable', reason: 'auto change directory' },
    acd: { tier: 'not-applicable', reason: 'auto change directory' },
    scrollbind: { tier: 'not-applicable', reason: 'scroll binding' },
    scb: { tier: 'not-applicable', reason: 'scroll binding' },
    scrollopt: { tier: 'not-applicable', reason: 'scroll binding options' },
    sbo: { tier: 'not-applicable', reason: 'scroll binding options' },
    cursorbind: { tier: 'not-applicable', reason: 'cursor binding' },
    crb: { tier: 'not-applicable', reason: 'cursor binding' },
    matchtime: { tier: 'not-applicable', reason: 'match highlight duration' },
    mat: { tier: 'not-applicable', reason: 'match highlight duration' },
    showmatch: { tier: 'not-applicable', reason: 'bracket match flash' },
    sm: { tier: 'not-applicable', reason: 'bracket match flash' },
    mkspellmem: { tier: 'not-applicable', reason: 'spell file memory' },
    msm: { tier: 'not-applicable', reason: 'spell file memory' },
    smoothscroll: {
        tier: 'not-applicable',
        reason: 'smooth scroll (use smoothcursor plugin setting)',
    },
    sms: {
        tier: 'not-applicable',
        reason: 'smooth scroll (use smoothcursor plugin setting)',
    },
    scrolljump: { tier: 'not-applicable', reason: 'scroll jump size' },
    sj: { tier: 'not-applicable', reason: 'scroll jump size' },
    scroll: { tier: 'not-applicable', reason: 'scroll half-page size' },
    scr: { tier: 'not-applicable', reason: 'scroll half-page size' },
    window: { tier: 'not-applicable', reason: 'window size' },
    maxsearchcount: { tier: 'not-applicable', reason: 'search count limit' },
    msc: { tier: 'not-applicable', reason: 'search count limit' },
    display: { tier: 'not-applicable', reason: 'display options' },

    // ── Rejected: explicitly not supported ──────────────────────────────

    // (None currently — jscommand/cmcommand are handled at the vimrc
    //  command level, not as `:set` options.)
};

/**
 * Look up a Neovim option that is NOT in KNOWN_SET_OPTIONS.
 * Returns the entry if found, or undefined if the option is truly unknown.
 */
export function getNeovimOption(name: string): NeovimOptionEntry | undefined {
    return NEOVIM_OPTIONS[name];
}

/**
 * Returns true if the option's tier means it should be silently accepted
 * (no console output at all).
 */
export function isNoopSilent(entry: NeovimOptionEntry): boolean {
    return entry.tier === 'noop-platform' || entry.tier === 'not-applicable';
}

/**
 * Returns true if the option's tier means it should log an info-level note.
 */
export function isNoopLogged(entry: NeovimOptionEntry): boolean {
    return entry.tier === 'hardcoded' || entry.tier === 'noop-deferred';
}

/**
 * Returns true if the option's tier means it should log a warning/error.
 */
export function isRejected(entry: NeovimOptionEntry): boolean {
    return entry.tier === 'rejected';
}
