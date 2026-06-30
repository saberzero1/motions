import type { VimApi } from '../types/vim-api';
import type { CursorShape, CursorShapes } from '../settings';

let textwidthValue = 80;

export function getTextwidth(): number {
    return textwidthValue;
}

export function setTextwidth(value: number): void {
    if (value > 0) {
        textwidthValue = value;
        textwidthSetExplicitly = true;
    }
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
): void {
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
    vim.defineOption('workspacenav', true, 'boolean', ['wn'], (value) => {
        if (value === undefined) return;
        const enabled = !!value;
        notify(
            'enableWorkspaceNav',
            enabled,
            `set ${enabled ? '' : 'no'}workspacenav`,
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
        if (!isNaN(n) && n >= 0 && n <= 20) {
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

    vim.defineOption('tablewidget', 'cursor', 'string', [], (value) => {
        if (value === undefined) return;
        const str = typeof value === 'string' ? value : '';
        if (str === 'off' || str === 'cursor' || str === 'always') {
            notify('tableWidgetMode', str, `set tablewidget=${str}`);
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
    registered = true;
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
