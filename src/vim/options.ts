import type { VimApi } from '../types/vim-api';

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
}
