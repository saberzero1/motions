import { writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { NeovimClient } from './client.js';
import { COORD_LINE } from '../fixtures/neovim-coordinate-contract.js';

const VERSION = '0.12.5';
const profiles = [
    {
        name: 'base',
        tabstop: 8,
        list: false,
        listchars: 'tab:>-',
        wrap: true,
        width: 80,
        showbreak: '',
        repeat: 1,
    },
    {
        name: 'tabstop-2',
        tabstop: 2,
        list: false,
        listchars: 'tab:>-',
        wrap: true,
        width: 80,
        showbreak: '',
        repeat: 1,
    },
    {
        name: 'list-tab-glyph',
        tabstop: 8,
        list: true,
        listchars: 'tab:>-',
        wrap: true,
        width: 80,
        showbreak: '',
        repeat: 1,
    },
    {
        name: 'list-no-tab-glyph',
        tabstop: 8,
        list: true,
        listchars: 'trail:-',
        wrap: true,
        width: 80,
        showbreak: '',
        repeat: 1,
    },
    {
        name: 'nowrap',
        tabstop: 8,
        list: false,
        listchars: 'tab:>-',
        wrap: false,
        width: 80,
        showbreak: '',
        repeat: 1,
    },
    {
        name: 'narrow-showbreak',
        tabstop: 8,
        list: false,
        listchars: 'tab:>-',
        wrap: true,
        width: 8,
        showbreak: '>>',
        repeat: 4,
    },
];

// Lua table iteration order is not stable between native processes.
function sortedKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entry]) => [key, sortedKeys(entry)]),
        );
    }
    return value;
}

async function main(): Promise<void> {
    if (
        !process.argv.includes('--check-version') ||
        !process.argv.includes('--record')
    ) {
        throw new Error('Usage: coordinate-oracle.ts --check-version --record');
    }
    const client = new NeovimClient();
    const results: unknown[] = [];
    try {
        await client.start();
        const version = await client.getVersion();
        if (version !== VERSION)
            throw new Error(
                `coordinate oracle: expected Neovim ${VERSION}, got ${version}`,
            );
        for (const profile of profiles) {
            // A real nonfloating split permits a content width below Neovim's
            // minimum global 'columns'. Close it before the next profile.
            await client.executeCommand('only!');
            await client.executeCommand(
                'set columns=80 lines=24 laststatus=0 showtabline=0 cmdheight=1',
            );
            if (profile.width === 8)
                await client.executeCommand('vsplit | vertical resize 8');
            await client.executeLua(`
                local p = vim.json.decode(${JSON.stringify(JSON.stringify(profile))})
                vim.bo.tabstop = p.tabstop
                vim.bo.fileformat = 'unix'
                vim.wo.list = p.list
                vim.wo.listchars = p.listchars
                vim.wo.wrap = p.wrap
                vim.wo.showbreak = p.showbreak
                vim.wo.breakindent = false
                vim.wo.linebreak = false
                vim.wo.number = false
                vim.wo.relativenumber = false
                vim.wo.signcolumn = 'no'
                vim.wo.foldcolumn = '0'
                vim.o.ambiwidth = 'single'
                vim.o.display = 'lastline'
                vim.o.virtualedit = 'onemore'
                local text = string.rep(${JSON.stringify(COORD_LINE)}, p['repeat'])
                vim.api.nvim_buf_set_lines(0, 0, -1, true, {text, '', text})
                local width = vim.api.nvim_win_get_width(0)
                if width ~= p.width then error('content width: expected '..p.width..', got '..width) end
                local boundaries = {}
                -- Explicit byte boundaries from the reviewed canonical table.
                for copy = 0, p['repeat'] - 1 do
                    for _, byte in ipairs({0,2,5,9,12,13}) do
                        table.insert(boundaries, copy * 14 + byte)
                    end
                end
                table.insert(boundaries, p['repeat'] * 14)
                local rows = {}
                for _, byte in ipairs(boundaries) do
                    vim.api.nvim_win_set_cursor(0, {1, byte})
                    local position = {1, byte + 1}
                    local cells = vim.fn.virtcol(position, true)
                    table.insert(rows, {
                        byte = byte,
                        col = vim.fn.col(position),
                        charcol = vim.fn.charcol(position),
                        virtcol = vim.fn.virtcol(position),
                        cells = cells,
                        virtcol2col = {vim.fn.virtcol2col(0, 1, cells[1]), vim.fn.virtcol2col(0, 1, cells[2])},
                        expressions = {col = vim.fn.col('.'), charcol = vim.fn.charcol('.'), virtcol = vim.fn.virtcol('.'), cells = vim.fn.virtcol('.', true)},
                    })
                end
                local expressions = {col_eol = vim.fn.col('$'), charcol_eol = vim.fn.charcol('$'), virtcol_eol = vim.fn.virtcol('$'), cells_eol = vim.fn.virtcol('$', true)}
                local occupied = {}
                for cell = 1, rows[#rows].cells[1] - 1 do
                    local byte_col = vim.fn.virtcol2col(0, 1, cell)
                    local position = {1, byte_col}
                    vim.api.nvim_win_set_cursor(0, {1, byte_col - 1})
                    table.insert(occupied, {cell = cell, byte_col = byte_col, col = vim.fn.col(position), charcol = vim.fn.charcol(position), cells = vim.fn.virtcol(position, true), virtcol = vim.fn.virtcol(position), expressions = {col = vim.fn.col('.'), charcol = vim.fn.charcol('.')}})
                end
                local result = {
                    name = p.name, text = text, boundaries = rows, occupied = occupied, expressions = expressions,
                    options = {tabstop = vim.bo.tabstop, fileformat = vim.bo.fileformat, list = vim.wo.list, listchars = vim.wo.listchars, wrap = vim.wo.wrap, showbreak = vim.wo.showbreak, breakindent = vim.wo.breakindent, linebreak = vim.wo.linebreak, width = width, number = vim.wo.number, relativenumber = vim.wo.relativenumber, signcolumn = vim.wo.signcolumn, foldcolumn = vim.wo.foldcolumn, ambiwidth = vim.o.ambiwidth, display = vim.o.display, virtualedit = vim.o.virtualedit},
                }
                -- All expression reads above precede replacing the source.
                vim.api.nvim_buf_set_lines(0, 0, -1, true, {vim.json.encode(result)})
            `);
            results.push(JSON.parse(await client.getContent()));
        }
    } finally {
        await client.stop();
    }
    if (results.length !== 6)
        throw new Error(
            `coordinate oracle: expected 6 profiles, got ${results.length}`,
        );
    const artifact = await format(
        JSON.stringify(sortedKeys({ version: VERSION, profiles: results })),
        { parser: 'json', tabWidth: 4 },
    );
    await writeFile(
        new URL('../fixtures/neovim-coordinate-oracle.json', import.meta.url),
        artifact,
    );
    process.stdout.write(
        `coordinate oracle: Neovim ${VERSION}; 6 profiles recorded\n`,
    );
}

await main();
