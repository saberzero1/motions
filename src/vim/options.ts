import type { VimApi } from '../types/vim-api';
import type { CursorShape, CursorShapes } from '../settings';
import { isValidSignColumnValue } from './sign-column';

let textwidthValue = 80;
let statuscolumnValue = '';
let jumpListEnabled = true;
let jumpListSize = 200;

export function getTextwidth(): number {
    return textwidthValue;
}

export function setTextwidth(value: number): void {
    if (value > 0) {
        textwidthValue = value;
        textwidthSetExplicitly = true;
    }
}

export function isJumpListEnabled(): boolean {
    return jumpListEnabled;
}

export function setJumpListEnabled(enabled: boolean): void {
    jumpListEnabled = enabled;
}

export function getJumpListSize(): number {
    return jumpListSize;
}

export function setJumpListSize(size: number): void {
    if (size > 0) jumpListSize = size;
}

let textwidthSetExplicitly = false;

let clipboardValue = '';

export function setClipboardOption(value: string): void {
    clipboardValue = value;
}

let insertEscapeValue = '';
let insertEscapeTimeoutValue = 1000;

export function registerVimOptions(
    vim: VimApi,
    onSettingOverride?: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void,
): () => void {
    let registered = false;
    const notify = (key: string, value: unknown, directive?: string) => {
        if (registered) onSettingOverride?.(key, value, directive);
    };
    vim.defineOption('clipboard', '', 'string', ['clip'], (value: unknown) => {
        if (value === undefined) return clipboardValue;
        const str = typeof value === 'string' ? value : '';
        if (clipboardValue && !str) return undefined;
        clipboardValue = str;
        notify('clipboard', str, `set clipboard=${str}`);
        return undefined;
    });
    vim.defineOption('tabstop', 4, 'number', ['ts'], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n)) {
            notify('tabstop', n, `set tabstop=${n}`);
        }
    });
    vim.defineOption('textwidth', 80, 'number', ['tw'], (value) => {
        if (value === undefined) return textwidthValue;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n > 0) {
            if (!textwidthSetExplicitly) textwidthValue = n;
            notify('textwidth', n, `set textwidth=${n}`);
        }
        return undefined;
    });
    vim.defineOption('shiftwidth', 4, 'number', ['sw'], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n)) {
            notify('shiftwidth', n, `set shiftwidth=${n}`);
        }
    });
    vim.defineOption('expandtab', true, 'boolean', ['et'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('expandtab', enabled, `set ${enabled ? '' : 'no'}expandtab`);
    });
    vim.defineOption('insertmodeescape', '', 'string', ['ime'], (value) => {
        if (value === undefined) return insertEscapeValue;
        const str = typeof value === 'string' ? value : '';
        insertEscapeValue = str;
        notify('insertmodeescape', str, `set insertmodeescape=${str}`);
        return undefined;
    });
    vim.defineOption(
        'insertmodeescapetimeout',
        1000,
        'number',
        ['imet'],
        (value) => {
            if (value === undefined) return insertEscapeTimeoutValue;
            const n = typeof value === 'number' ? value : Number(value);
            if (!isNaN(n) && n >= 100 && n <= 5000) {
                insertEscapeTimeoutValue = n;
                notify(
                    'insertmodeescapetimeout',
                    n,
                    `set insertmodeescapetimeout=${n}`,
                );
            }
            return undefined;
        },
    );
    vim.defineOption('guicursor', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        const partial = parseGuicursor(str);
        if (Object.keys(partial).length > 0) {
            notify('cursorShapes', partial, `set guicursor=${str}`);
        }
    });

    vim.defineOption('textobjects', true, 'boolean', ['to'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableTextObjects',
            enabled,
            `set ${enabled ? '' : 'no'}textobjects`,
        );
    });
    vim.defineOption('navigation', true, 'boolean', ['nav'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableNavigation',
            enabled,
            `set ${enabled ? '' : 'no'}navigation`,
        );
    });
    vim.defineOption('hardwrap', true, 'boolean', ['hw'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableHardWrap', enabled, `set ${enabled ? '' : 'no'}hardwrap`);
    });
    vim.defineOption('listcontinuation', true, 'boolean', ['lc'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'listContinuationOnOpen',
            enabled,
            `set ${enabled ? '' : 'no'}listcontinuation`,
        );
    });
    vim.defineOption('tablenav', true, 'boolean', ['tn'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableTableNav', enabled, `set ${enabled ? '' : 'no'}tablenav`);
    });
    vim.defineOption('jumplist', true, 'boolean', [], (value) => {
        if (value === undefined) return jumpListEnabled;
        const enabled = !!value;
        jumpListEnabled = enabled;
        notify('jumplist', enabled, `set ${enabled ? '' : 'no'}jumplist`);
        return undefined;
    });
    vim.defineOption('jumplistsize', 200, 'number', [], (value) => {
        if (value === undefined) return jumpListSize;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n > 0) {
            jumpListSize = n;
            notify('jumplistsize', n, `set jumplistsize=${n}`);
        }
        return undefined;
    });
    vim.defineOption('workspacenav', true, 'boolean', ['wn'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableWorkspaceNav',
            enabled,
            `set ${enabled ? '' : 'no'}workspacenav`,
        );
    });
    vim.defineOption('workspacenavviewtypes', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify(
            'workspaceNavViewTypes',
            str,
            `set workspacenavviewtypes=${str}`,
        );
    });
    vim.defineOption('easymotion', true, 'boolean', ['em'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableEasyMotion',
            enabled,
            `set ${enabled ? '' : 'no'}easymotion`,
        );
    });
    vim.defineOption('easymotiondimming', true, 'boolean', ['emd'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'easyMotionDimming',
            enabled,
            `set ${enabled ? '' : 'no'}easymotiondimming`,
        );
    });
    vim.defineOption('hintmode', true, 'boolean', ['hm'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableHintMode', enabled, `set ${enabled ? '' : 'no'}hintmode`);
    });
    vim.defineOption('statusbar', true, 'boolean', ['sb'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableStatusBar',
            enabled,
            `set ${enabled ? '' : 'no'}statusbar`,
        );
    });
    vim.defineOption('chorddisplay', true, 'boolean', ['cd'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableChordDisplay',
            enabled,
            `set ${enabled ? '' : 'no'}chorddisplay`,
        );
    });
    vim.defineOption('powerline', false, 'boolean', ['pl'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enablePowerline',
            enabled,
            `set ${enabled ? '' : 'no'}powerline`,
        );
    });

    vim.defineOption('scrolloff', 5, 'number', ['so'], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 0 && n <= 9999) {
            notify('scrolloffLines', n, `set scrolloff=${n}`);
        }
    });
    vim.defineOption('scanlimit', 20, 'number', ['sl'], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 5 && n <= 200) {
            notify('multilineScanLimit', n, `set scanlimit=${n}`);
        }
    });
    vim.defineOption('labelfontsize', 14, 'number', ['lfs'], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 10 && n <= 20) {
            notify('labelFontSize', n, `set labelfontsize=${n}`);
        }
    });
    vim.defineOption(
        'labelmatchfontsize',
        false,
        'boolean',
        ['lmfs'],
        (value) => {
            if (value === undefined) return;
            notify(
                'labelMatchFontSize',
                !!value,
                `set ${value ? '' : 'no'}labelmatchfontsize`,
            );
        },
    );

    vim.defineOption('number', false, 'boolean', ['nu'], (value) => {
        if (value === undefined) return;
        notify('number', !!value, `set ${value ? '' : 'no'}number`);
    });
    vim.defineOption('relativenumber', false, 'boolean', ['rnu'], (value) => {
        if (value === undefined) return;
        notify(
            'relativenumber',
            !!value,
            `set ${value ? '' : 'no'}relativenumber`,
        );
    });
    vim.defineOption('numberwidth', 2, 'number', ['nuw'], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 1 && n <= 20) {
            notify('numberwidth', n, `set numberwidth=${n}`);
        }
    });
    vim.defineOption('cursorline', true, 'boolean', ['cul'], (value) => {
        if (value === undefined) return;
        notify('cursorline', !!value, `set ${value ? '' : 'no'}cursorline`);
    });
    vim.defineOption(
        'cursorlineopt',
        'number',
        'string',
        ['culopt'],
        (value) => {
            if (value === undefined) return;
            const str = typeof value === 'string' ? value : '';
            if (str === 'number' || str === 'line' || str === 'both') {
                notify('cursorlineopt', str, `set cursorlineopt=${str}`);
            }
        },
    );
    vim.defineOption('linenumbermode', 'hybrid', 'string', ['lnm'], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'hybrid' || str === 'dual' || str === 'dual-rel-abs') {
            notify('linenumbermode', str, `set linenumbermode=${str}`);
        }
    });
    vim.defineOption('signcolumn', 'auto', 'string', ['scl'], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (isValidSignColumnValue(str)) {
            notify('signcolumn', str, `set signcolumn=${str}`);
        }
    });
    vim.defineOption(
        'statuscolumn',
        '',
        'string',
        ['stc'],
        (value): string | undefined => {
            if (value === undefined) return statuscolumnValue;
            const str = typeof value === 'string' ? value : '';
            statuscolumnValue = str;
            notify('statuscolumn', str, `set statuscolumn=${str}`);
            return undefined;
        },
    );
    vim.defineOption('foldcolumn', false, 'boolean', ['fdc'], (value) => {
        if (value === undefined) return;
        notify('foldcolumn', !!value, `set ${value ? '' : 'no'}foldcolumn`);
    });

    vim.defineOption('flash', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        notify('enableFlash', !!value, `set ${value ? '' : 'no'}flash`);
    });
    vim.defineOption('flashmultiline', true, 'boolean', ['fml'], (value) => {
        if (value === undefined) return;
        notify(
            'flashMultiLine',
            !!value,
            `set ${value ? '' : 'no'}flashmultiline`,
        );
    });

    vim.defineOption(
        'flashminpatternlength',
        1,
        'number',
        ['fmpl'],
        (value) => {
            if (value === undefined) return;
            const num =
                typeof value === 'number'
                    ? value
                    : parseInt(value as string, 10);
            if (!isNaN(num) && num >= 0 && num <= 10) {
                notify(
                    'flashMinPatternLength',
                    num,
                    `set flashminpatternlength=${num}`,
                );
            }
        },
    );
    vim.defineOption('flashsearch', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        notify('flashSearch', !!value, `set ${value ? '' : 'no'}flashsearch`);
    });

    vim.defineOption('flashjump', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        notify(
            'flashJumpEnabled',
            !!value,
            `set ${value ? '' : 'no'}flashjump`,
        );
    });
    vim.defineOption('flashjumpkey', 's', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str) {
            notify('flashJumpKey', str, `set flashjumpkey=${str}`);
        }
    });
    vim.defineOption('flashcleverf', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        notify('flashCleverF', !!value, `set ${value ? '' : 'no'}flashcleverf`);
    });

    vim.defineOption(
        'easymotionlabels',
        'asdghklqwertyuiopzxcvbnmfj',
        'string',
        ['eml'],
        (value) => {
            if (value === undefined) return;
            const str = typeof value === 'string' ? value : '';
            if (str) {
                notify('easyMotionLabels', str, `set easymotionlabels=${str}`);
            }
        },
    );
    vim.defineOption('hintlabels', 'asdfghjkl', 'string', ['hl'], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str) {
            notify('hintModeLabels', str, `set hintlabels=${str}`);
        }
    });

    vim.defineOption('tablewidget', 'native', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        const mapping: Record<string, string> = {
            off: 'native',
            cursor: 'native',
            embedded: 'native',
            always: 'raw',
            native: 'native',
            raw: 'raw',
        };
        const mapped = mapping[str];
        if (mapped) {
            if (mapped !== str) {
                console.warn(
                    `[Vim Motions] "set tablewidget=${str}" is deprecated. Using "${mapped}" instead.`,
                );
            }
            notify('tableWidgetMode', mapped, `set tablewidget=${mapped}`);
        }
    });

    vim.defineOption('whichkey', 'off', 'string', ['wk'], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'off' || str === 'leader' || str === 'all') {
            notify('whichKeyMode', str, `set whichkey=${str}`);
        }
    });
    vim.defineOption(
        'whichkeygrouping',
        'grouped',
        'string',
        ['wkg'],
        (value) => {
            if (value === undefined) return;
            const str = typeof value === 'string' ? value : '';
            if (str === 'flat' || str === 'grouped') {
                notify('whichKeyGrouping', str, `set whichkeygrouping=${str}`);
            }
        },
    );
    vim.defineOption(
        'whichkeysort',
        'which-key',
        'string',
        ['wks'],
        (value) => {
            if (value === undefined) return;
            const str = typeof value === 'string' ? value : '';
            if (str === 'which-key' || str === 'groups-first') {
                notify('whichKeySortOrder', str, `set whichkeysort=${str}`);
            }
        },
    );
    vim.defineOption('whichkeyicons', true, 'boolean', ['wki'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'whichKeyIcons',
            enabled,
            `set ${enabled ? '' : 'no'}whichkeyicons`,
        );
    });

    vim.defineOption('vimtextareas', false, 'boolean', ['vta'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableVimTextareas',
            enabled,
            `set ${enabled ? '' : 'no'}vimtextareas`,
        );
    });

    vim.defineOption('yankring', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableYankRing', enabled, `set ${enabled ? '' : 'no'}yankring`);
    });
    vim.defineOption('yankhighlightmode', 'solid', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'off' || str === 'solid' || str === 'fade') {
            notify('yankHighlightMode', str, `set yankhighlightmode=${str}`);
        }
    });
    vim.defineOption('yankhighlightduration', 200, 'number', [], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 0 && n <= 5000) {
            notify(
                'yankHighlightDuration',
                n,
                `set yankhighlightduration=${n}`,
            );
        }
    });
    vim.defineOption('undotree', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableUndoTree', enabled, `set ${enabled ? '' : 'no'}undotree`);
    });
    vim.defineOption('undofile', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('undoFile', enabled, `set ${enabled ? '' : 'no'}undofile`);
    });
    vim.defineOption('undotreemaxnodes', 1000, 'number', [], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 100 && n <= 5000) {
            notify('undoTreeMaxNodes', n, `set undotreemaxnodes=${n}`);
        }
    });
    vim.defineOption('foldawarenavigation', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'foldAwareNavigation',
            enabled,
            `set ${enabled ? '' : 'no'}foldawarenavigation`,
        );
    });
    vim.defineOption('foldpersistence', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'foldPersistence',
            enabled,
            `set ${enabled ? '' : 'no'}foldpersistence`,
        );
    });
    vim.defineOption('harpoon', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableHarpoon', enabled, `set ${enabled ? '' : 'no'}harpoon`);
    });
    vim.defineOption('dial', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('enableDial', enabled, `set ${enabled ? '' : 'no'}dial`);
    });
    vim.defineOption('subword', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableSubwordMotions',
            enabled,
            `set ${enabled ? '' : 'no'}subword`,
        );
    });
    vim.defineOption('picker', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('picker', enabled, `set ${enabled ? '' : 'no'}picker`);
    });
    vim.defineOption('pickerleadermappings', true, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'pickerLeaderMappings',
            enabled,
            `set ${enabled ? '' : 'no'}pickerleadermappings`,
        );
    });
    vim.defineOption('pickermatcher', 'ufuzzy', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'ufuzzy' || str === 'obsidian') {
            notify('pickerMatcherEngine', str, `set pickermatcher=${str}`);
        }
    });
    vim.defineOption('pickeromnisearch', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'pickerOmnisearch',
            enabled,
            `set ${enabled ? '' : 'no'}pickeromnisearch`,
        );
    });
    vim.defineOption('pickertasks', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('pickerTasks', enabled, `set ${enabled ? '' : 'no'}pickertasks`);
    });
    vim.defineOption('pickerdataview', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'pickerDataview',
            enabled,
            `set ${enabled ? '' : 'no'}pickerdataview`,
        );
    });
    vim.defineOption('ripgrep', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('ripgrepEnabled', enabled, `set ${enabled ? '' : 'no'}ripgrep`);
    });
    vim.defineOption('ripgreppath', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('ripgrepBinaryPath', str, `set ripgreppath=${str}`);
    });
    vim.defineOption('ripgrepargs', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('ripgrepArgs', str, `set ripgrepargs=${str}`);
    });
    vim.defineOption('grepmode', 'ripgrep', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'ripgrep' || str === 'grep') {
            notify('grepMode', str, `set grepmode=${str}`);
        }
    });
    vim.defineOption('oil', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('oilExplorer', enabled, `set ${enabled ? '' : 'no'}oil`);
    });
    vim.defineOption('oilhiddenfiles', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'oilShowHiddenFiles',
            enabled,
            `set ${enabled ? '' : 'no'}oilhiddenfiles`,
        );
    });
    vim.defineOption('oilconfirmdeletethreshold', 5, 'number', [], (value) => {
        if (value === undefined) return;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n >= 0 && n <= 100) {
            notify(
                'oilConfirmDeleteThreshold',
                n,
                `set oilconfirmdeletethreshold=${n}`,
            );
        }
    });
    vim.defineOption('oilsort', 'name', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'name' || str === 'mtime' || str === 'size') {
            notify('oilDefaultSort', str, `set oilsort=${str}`);
        }
    });
    vim.defineOption('hinthotkey', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('hintModeHotkey', str, `set hinthotkey=${str}`);
    });
    vim.defineOption('undotreeposition', 'right', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'left' || str === 'right') {
            notify('undoTreePosition', str, `set undotreeposition=${str}`);
        }
    });
    vim.defineOption('undotreeautoopen', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'undoTreeAutoOpen',
            enabled,
            `set ${enabled ? '' : 'no'}undotreeautoopen`,
        );
    });
    vim.defineOption('imswitching', false, 'boolean', [], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify('imEnabled', enabled, `set ${enabled ? '' : 'no'}imswitching`);
    });
    vim.defineOption('impreset', 'custom', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (
            str === 'custom' ||
            str === 'macism' ||
            str === 'im-select' ||
            str === 'fcitx5-remote' ||
            str === 'ibus'
        ) {
            notify('imPreset', str, `set impreset=${str}`);
        }
    });
    vim.defineOption('imbinarypath', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('imBinaryPath', str, `set imbinarypath=${str}`);
    });
    vim.defineOption('imobtainargs', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('imObtainArgs', str, `set imobtainargs=${str}`);
    });
    vim.defineOption('imswitchargs', '{im}', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('imSwitchArgs', str, `set imswitchargs=${str}`);
    });
    vim.defineOption('imdefaultnormal', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('imDefaultNormalIm', str, `set imdefaultnormal=${str}`);
    });
    vim.defineOption('imrestorebehavior', 'restore', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'restore' || str === 'default') {
            notify('imRestoreBehavior', str, `set imrestorebehavior=${str}`);
        }
    });
    vim.defineOption('imdefaultinsert', '', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        notify('imDefaultInsertIm', str, `set imdefaultinsert=${str}`);
    });
    return () => {
        registered = true;
    };
}

const VALID_SHAPES: ReadonlySet<string> = new Set([
    'block',
    'bar',
    'underline',
    'hollow',
]);

const MODE_ALIASES: Record<string, keyof CursorShapes> = {
    n: 'normal',
    i: 'insert',
    v: 'visual',
    r: 'replace',
    o: 'operatorPending',
};

export function parseGuicursor(value: string): Partial<CursorShapes> {
    const result: Partial<CursorShapes> = {};
    for (const segment of value.split(',')) {
        const parts = segment.trim().split(':');
        if (parts.length !== 2) continue;
        const modeStr = parts[0];
        const shapeStr = parts[1];
        if (!modeStr || !shapeStr || !VALID_SHAPES.has(shapeStr)) continue;
        const shape = shapeStr as CursorShape;
        if (modeStr === 'a') {
            result.normal = shape;
            result.insert = shape;
            result.visual = shape;
            result.replace = shape;
            result.operatorPending = shape;
        } else {
            for (const m of modeStr.split('-')) {
                const key = MODE_ALIASES[m.trim()];
                if (key) result[key] = shape;
            }
        }
    }
    return result;
}
