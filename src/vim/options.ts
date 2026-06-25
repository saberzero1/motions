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

export function registerVimOptions(vim: VimApi): void {
    vim.defineOption('clipboard', '', 'string', ['clip']);
    vim.defineOption('tabstop', 4, 'number', ['ts']);
    vim.defineOption('textwidth', 80, 'number', ['tw'], (value) => {
        if (value === undefined) return textwidthValue;
        if (textwidthSetExplicitly) return undefined;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n > 0) textwidthValue = n;
        return undefined;
    });
    vim.defineOption('shiftwidth', 4, 'number', ['sw']);
    vim.defineOption('expandtab', true, 'boolean', ['et']);
    vim.defineOption('insertmodeescape', '', 'string', ['ime']);
    vim.defineOption('guicursor', '', 'string', []);
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
