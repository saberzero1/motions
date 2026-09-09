import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { collectApiInventory, collectFnInventory } from './api-inventory';

const symbols = ['✅', '⚠️', '🔲', '❌', '🚫', '🔇'] as const;
type Status = (typeof symbols)[number];
const sorted = (names: Iterable<string>) => [...names].sort();
const apiPromotions = [
    'nvim_buf_get_offset',
    'nvim_win_is_valid',
    'nvim_win_get_width',
    'nvim_win_get_height',
    'nvim_win_get_position',
    'nvim_win_get_number',
];
const fnPromotions = [
    'line2byte',
    'byte2line',
    'win_getid',
    'winnr',
    'charcol',
    'virtcol',
    'deletebufline',
];
const control = process.env.COORD_DOC_CONTROL;
let apiSource = readFileSync('src/lua/api.ts', 'utf8');
const fnSource = readFileSync('src/lua/fn.ts', 'utf8');
let document = readFileSync('NEOVIM_API_STATUS.md', 'utf8');
let changelog = readFileSync('CHANGELOG.md', 'utf8');

function mutateCell(text: string, label: string, index: number, value: string) {
    return text
        .split('\n')
        .map((line) => {
            const cells = line.split('|').map((cell) => cell.trim());
            if (cells[1] !== label) return line;
            cells[index + 1] = value;
            return `| ${cells.slice(1, -1).join(' | ')} |`;
        })
        .join('\n');
}

// Disposable in-memory mutations: no working-tree sabotage to restore.
if (control === 'total')
    document = document.replace('holds 157 names', 'holds 158 names');
if (control === 'dispatch')
    document = document.replace(
        /^(\|\s*2\s*\|[^\n]*?\|\s*)88(\s*\|)/m,
        (_match, before: string, after: string) => `${before}97${after}`,
    );
if (control === 'authoritative')
    document = mutateCell(document, '`vim.api` (`api.ts`)', 3, '158');
if (control === 'summary')
    document = mutateCell(document, '`vim.api.nvim_*` (public)', 1, '46');
if (control === 'historical-summary') {
    document = mutateCell(document, '`vim.api.nvim_*` (public)', 1, '46');
    document = mutateCell(document, '`vim.api.nvim_*` (public)', 2, '14');
}
if (control === 'missing-handler')
    apiSource = apiSource.replace(
        "lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_offset'));",
        "lua.lua_setfield(L, apiIndex, to_luastring('nvim_guard_fake'));",
    );
if (control === 'missing-row')
    document = document.replace(/^\| `nvim_buf_get_offset\([^\n]+\n/m, '');
if (control === 'conflict')
    document = document.replace(
        '### Buffer operations',
        '| `nvim_get_current_buf()` | 🔲 | conflicting duplicate |\n\n### Buffer operations',
    );
if (control === 'misclassified')
    document = document.replace(/(\| `getwininfo\([^\n]+?\| )✅/, '$1🔲');
if (control === 'unknown')
    document = document.replace(
        '### Buffer operations',
        '| `nvim_guard_unknown()` | 🚫 | absent public entry |\n\n### Buffer operations',
    );
if (control === 'historical')
    changelog = changelog.replace(
        '63/94/157 and 84/46/130',
        '60/97/157 and 84/46/130',
    );
if (control === 'status-historical')
    document = document.replace(
        '63/94/157 and 84/46/130',
        '63/97/157 and 84/46/130',
    );

function parseStatusTables(text: string) {
    const api = new Map<string, Status>();
    const fn = new Map<string, Status>();
    const conflicts: string[] = [];
    const tables = new Map<string, number[]>();
    let section = '';
    for (const line of text.split('\n')) {
        if (line.startsWith('## ')) section = line;
        if (!line.startsWith('|')) continue;
        const cells = line
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());
        const label = cells[0] ?? '';
        const status = symbols.find((symbol) => symbol === cells[1]);
        const normalized = label.replaceAll('`', '').replaceAll('\\_', '_');
        const name = /^(?:vim\.(?:api|fn)\.)?([\w]+)\(/.exec(normalized)?.[1];
        const target = name?.startsWith('nvim_')
            ? api
            : normalized.startsWith('vim.fn.') ||
                section.startsWith('## vim.fn ')
              ? fn
              : undefined;
        if (name && status && target) {
            const previous = target.get(name);
            if (previous && previous !== status)
                conflicts.push(`${name}: ${previous} / ${status}`);
            target.set(name, status);
        }
        if (section === '## Summary')
            tables.set(label, cells.slice(1).map(Number));
    }
    const dispatch = [
        ...text.matchAll(/^\|\s*[12]\s*\|[^\n]*?\|\s*(\d+)\s*\|/gm),
    ].map((match) => Number(match[1]));
    const unknown =
        /Public names outside the registry: ([^\n]+)/
            .exec(text)?.[1]
            ?.match(/nvim_\w+/g) ?? [];
    return {
        api,
        fn,
        conflicts,
        tables,
        dispatch,
        unknown,
        apiTotal: Number(/holds (\d+) names total/.exec(text)?.[1]),
        fnTotal: Number(
            /(\d+) `vim.fn` names are registered in total/.exec(text)?.[1],
        ),
        noRunner: /Without the runner: (\d+) real \/ (\d+) stubs \/ (\d+) total/
            .exec(text)
            ?.slice(1)
            .map(Number),
        fnHeading: Number(
            /### Implemented \((\d+) functions\)/.exec(text)?.[1],
        ),
    };
}

const api = collectApiInventory(apiSource);
const fn = collectFnInventory(fnSource);
const doc = parseStatusTables(document);
const apiCounts = [
    api.supported.size,
    api.known.size - api.supported.size,
    api.known.size,
];
const fnCounts = [
    fn.real.size,
    fn.effective.size,
    new Set([...fn.real, ...fn.declared]).size,
];
const noRunnerReal = new Set(
    [...fn.real].filter((name) => !fn.conditional.has(name)),
);
const noRunnerCounts = [
    noRunnerReal.size,
    fn.effective.size,
    new Set([...noRunnerReal, ...fn.declared]).size,
];

it('API status guard registration totals match source', () => {
    expect({
        dispatch: doc.dispatch,
        authoritativeApi: doc.tables.get('`vim.api` (`api.ts`)')?.slice(0, 3),
        authoritativeFn: doc.tables.get('`vim.fn` (`fn.ts`)')?.slice(0, 3),
        apiTotal: doc.apiTotal,
        fnTotal: doc.fnTotal,
        fnHeading: doc.fnHeading,
        noRunner: doc.noRunner,
    }).toEqual({
        dispatch: [apiCounts[0], apiCounts[1], fnCounts[0], fnCounts[1]],
        authoritativeApi: apiCounts,
        authoritativeFn: fnCounts,
        apiTotal: api.known.size,
        fnTotal: fnCounts[2],
        fnHeading: fn.real.size,
        noRunner: noRunnerCounts,
    });
});

function membershipErrors() {
    const errors = [...doc.conflicts];
    for (const name of new Set([...api.supported, ...api.registered])) {
        if (!api.registered.has(name)) errors.push(`${name}: missing handler`);
        if (!api.supported.has(name))
            errors.push(`${name}: handler missing supported declaration`);
        if (!api.known.has(name))
            errors.push(`${name}: missing known declaration`);
    }
    for (const [rows, real, registered] of [
        [doc.api, api.supported, api.known],
        [doc.fn, fn.real, new Set([...fn.real, ...fn.declared])],
    ] as const) {
        for (const name of registered) {
            const status = rows.get(name);
            if (!status) errors.push(`${name}: missing documented row`);
            else if (real.has(name) !== (status === '✅' || status === '⚠️'))
                errors.push(
                    `${name}: documented ${status}, source ${real.has(name) ? 'real' : 'stub'}`,
                );
            else if (
                !real.has(name) &&
                status !== '🔲' &&
                !(['system', 'systemlist'].includes(name) && status === '🚫')
            )
                errors.push(
                    `${name}: registered placeholder misclassified ${status}`,
                );
        }
        for (const [name, status] of rows) {
            if (!registered.has(name) && status !== '🚫' && status !== '❌')
                errors.push(`${name}: documented ${status}, not registered`);
        }
    }
    return errors.sort();
}

function subtotal(rows: Map<string, Status>, publicOnly = false) {
    return symbols
        .slice(0, 5)
        .map(
            (status) =>
                [...rows].filter(
                    ([name, value]) =>
                        value === status &&
                        (!publicOnly || !name.startsWith('nvim__')),
                ).length,
        );
}

it('API status guard per-name rows and summary agree', () => {
    expect({
        errors: membershipErrors(),
        publicApi: doc.tables.get('`vim.api.nvim_*` (public)')?.slice(0, 5),
        fn: doc.tables.get('`vim.fn.*`')?.slice(0, 5),
        unknown: sorted(doc.unknown),
    }).toEqual({
        errors: [],
        publicApi: subtotal(doc.api, true),
        fn: subtotal(doc.fn),
        unknown: sorted(
            [...doc.api.keys()].filter((name) => !api.known.has(name)),
        ),
    });
});

function historicalFnSource() {
    let source = fnSource;
    for (const name of [...fnPromotions, 'virtcol2col'])
        source = source.replace(
            `registry.set('${name}'`,
            `retiredRegistry.set('${name}'`,
        );
    return source.replace(
        "'search',",
        `${fnPromotions.map((name) => `'${name}',`).join('')} 'search',`,
    );
}

it('API status guard duplicate declarations do not inflate effective stubs', () => {
    let source = historicalFnSource().replace(
        'const tableReturnFns = new Set([',
        "const tableReturnFns = new Set(['getwininfo',",
    );
    if (control === 'duplicate')
        source = source.replace(
            "registry.set('getwininfo'",
            "retiredRegistry.set('getwininfo'",
        );
    if (control === 'duplicate-declaration')
        source = source.replace("new Set(['getwininfo',", 'new Set([');
    if (control === 'duplicate-total')
        source = source.replace(
            "new Set(['getwininfo',",
            "new Set(['guard_fake', 'getwininfo',",
        );
    const inventory = collectFnInventory(source);
    expect({
        declared: inventory.declared.size,
        effective: inventory.effective.size,
        total: new Set([...inventory.real, ...inventory.declared]).size,
        getwininfo: inventory.real.has('getwininfo') ? 'real' : 'stub',
    }).toEqual({ declared: 47, effective: 46, total: 130, getwininfo: 'real' });
});

it('API status guard historical baseline is explicit', () => {
    // Reverse only the named promotions in disposable source, preserving the
    // historical baseline without confusing it with today's guarded totals.
    const historicalApi = collectApiInventory(
        apiSource.replace(
            /const SUPPORTED_NVIM_API_FUNCTIONS = new Set<string>\(\[([\s\S]*?)\]\);/,
            (block: string) =>
                apiPromotions
                    .filter(
                        (name) =>
                            control !== 'baseline' ||
                            name !== 'nvim_buf_get_offset',
                    )
                    .reduce(
                        (text, name) => text.replace(`'${name}',`, ''),
                        block,
                    ),
        ),
    );
    const historicalFn = collectFnInventory(historicalFnSource());
    const baseline = [
        historicalApi.supported.size,
        historicalApi.known.size - historicalApi.supported.size,
        historicalApi.known.size,
        historicalFn.real.size,
        historicalFn.effective.size,
        new Set([...historicalFn.real, ...historicalFn.declared]).size,
    ];
    const historicalSentence =
        /audited historical baseline[^\n]*?(\d+)\/(\d+)\/(\d+) and (\d+)\/(\d+)\/(\d+)/;
    expect({
        baseline,
        statusProvenance: historicalSentence
            .exec(document)
            ?.slice(1)
            .map(Number),
        changelogProvenance: historicalSentence
            .exec(changelog)
            ?.slice(1)
            .map(Number),
    }).toEqual({
        baseline: [63, 94, 157, 84, 46, 130],
        statusProvenance: baseline,
        changelogProvenance: baseline,
    });
});
