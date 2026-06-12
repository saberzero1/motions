import type { VimApi } from '../types/vim-api';

export function registerVimOptions(vim: VimApi): void {
    vim.defineOption('clipboard', '', 'string', ['clip']);
    vim.defineOption('tabstop', 4, 'number', ['ts']);
    vim.defineOption('shiftwidth', 4, 'number', ['sw']);
    vim.defineOption('expandtab', true, 'boolean', ['et']);
    vim.defineOption('insertmodeescape', '', 'string', ['ime']);
}
