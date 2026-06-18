import type { VimApi } from '../types/vim-api';

let textwidthValue = 80;
let vimApiRef: VimApi | null = null;

export function getTextwidth(): number {
    if (vimApiRef) {
        const val = vimApiRef.getOption('textwidth');
        const n = typeof val === 'number' ? val : Number(val);
        if (!isNaN(n) && n > 0) return n;
    }
    return textwidthValue;
}

export function syncTextwidthFromVim(vim: VimApi): void {
    const val = vim.getOption('textwidth');
    const n = typeof val === 'number' ? val : Number(val);
    if (!isNaN(n) && n > 0) textwidthValue = n;
}

export function setTextwidth(value: number): void {
    if (value > 0) textwidthValue = value;
}

export function registerVimOptions(vim: VimApi): void {
    vimApiRef = vim;
    vim.defineOption('clipboard', '', 'string', ['clip']);
    vim.defineOption('tabstop', 4, 'number', ['ts']);
    vim.defineOption('textwidth', 80, 'number', ['tw'], (value) => {
        if (value === undefined) return textwidthValue;
        const n = typeof value === 'number' ? value : Number(value);
        if (!isNaN(n) && n > 0) textwidthValue = n;
        return undefined;
    });
    vim.defineOption('shiftwidth', 4, 'number', ['sw']);
    vim.defineOption('expandtab', true, 'boolean', ['et']);
    vim.defineOption('insertmodeescape', '', 'string', ['ime']);
}
