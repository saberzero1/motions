import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
    scanPluginDemand,
    scanPluginClosure,
    compareDemandToInventory,
} from './plugin-demand-scanner';
import { demandProbes } from './plugin-demand-probes';
import {
    createDemandState,
    observeDemand,
    type Category,
} from './plugin-demand-harness';
import { silentProbes } from './plugin-silent-probes';
import {
    collectApiInventory,
    collectFnInventory,
    collectLiveRegistries,
    collectSilentCandidates,
} from './api-inventory';
import { initTreesitterRuntime } from '../../../src/lua/treesitter/api';
import { runLuaString } from './coordinate-harness';
import { COORD_LINE } from '../../fixtures/neovim-coordinate-contract';
import { STRING_COORDINATE_AUDIT_RESULTS } from '../../fixtures/neovim-string-coordinate-contract';

type DemandRow = [
    Category,
    'load' | 'core' | 'optional',
    number[],
    string,
    string,
    string,
];
interface PluginAudit {
    path: string;
    archivePath: string;
    sha256: string;
    requires: string[];
    verdict: 'GO' | 'BLOCKED';
    loadResult: string;
    loadBlockers: string[];
    coreBlockers: string[];
    optionalBlockers: string[];
    demands: Record<string, DemandRow>;
}
interface Artifact {
    repo: string;
    ref: string;
    plugins: Record<string, PluginAudit>;
    blockers: Record<string, { names: string[]; owner: string }>;
    silentInventory: Record<string, [Category, string, number, string]>;
    liveResults: Record<string, string>;
    liveEffects: Record<string, string[]>;
    intentionalConstantCandidates: Record<string, string>;
}
const artifact = JSON.parse(
    readFileSync('test/fixtures/mini-api-demand.json', 'utf8'),
) as Artifact;
const control = process.env.COORD_DEMAND_CONTROL;
const sorted = (values: Iterable<string>) => [...values].sort();
const originalSurroundBlockers = [
    ...artifact.plugins['mini.surround']!.coreBlockers,
];
const stringObservations = new Map<string, ReturnType<typeof observeDemand>>();

vi.mock(
    '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
    async () => {
        const { readFile } = await import('node:fs/promises');
        return {
            default: new Uint8Array(
                await readFile(
                    new URL(
                        '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
                        import.meta.url,
                    ),
                ),
            ),
        };
    },
);
beforeAll(async () => {
    await initTreesitterRuntime();
    // Keep the committed Phase 5 artifact as historical evidence. Project only
    // these five measured promotions into the live audit, and only when the
    // real dispatch agrees with native values AND emits no warning. Neither
    // callable presence nor a manually shortened blocker list can pass this.
    for (const [name, native] of Object.entries(
        STRING_COORDINATE_AUDIT_RESULTS,
    )) {
        const observed = observeDemand(
            name,
            silentProbes[name]!.probe,
            control === 'promotions'
                ? `${name}=function() return 0 end`
                : undefined,
        );
        stringObservations.set(name, observed);
        if (
            observed.category !== 'real' ||
            observed.result !== native ||
            observed.warnings !== 0
        )
            continue;
        const inventory = artifact.silentInventory[name]!;
        inventory[0] = observed.category;
        inventory[1] = observed.result;
        artifact.liveResults[name] = observed.result;
        for (const audit of Object.values(artifact.plugins)) {
            const row = audit.demands[name];
            if (!row) continue;
            const blocker = row[5];
            row[0] = observed.category;
            row[5] = 'allow';
            const stillRequired = Object.values(artifact.plugins).some(
                (plugin) =>
                    Object.values(plugin.demands).some(
                        (demand) => demand[5] === blocker,
                    ),
            );
            if (!stillRequired) {
                delete artifact.blockers[blocker];
                audit.coreBlockers = audit.coreBlockers.filter(
                    (id) => id !== blocker,
                );
            }
        }
    }
});

describe('plugin API-demand audit Phase 5b promotions', () => {
    for (const [name, result] of Object.entries(
        STRING_COORDINATE_AUDIT_RESULTS,
    )) {
        it(name, () => {
            expect(stringObservations.get(name)).toEqual({
                category: 'real',
                result,
                warnings: 0,
            });
        });
    }
    it('removes exactly the two UTF core blockers', () => {
        expect(
            originalSurroundBlockers.filter(
                (id) =>
                    !artifact.plugins['mini.surround']!.coreBlockers.includes(
                        id,
                    ),
            ),
        ).toEqual(['utf-byteindex', 'utf-utfindex']);
    });
});

function requireGo(verdict: string, unresolved: number, blockers: string[]) {
    if (unresolved)
        throw new Error(`${unresolved} unresolved requirement versus 0`);
    if (verdict !== 'GO')
        throw new Error(`gate: ${verdict}; blockers: ${blockers.join(', ')}`);
}

/** Flip the expected category in disposable state: present -> absent, absent
 * -> present. The deliberately fake replacement is sabotage, NEVER evidence
 * of compatibility or an implementation. Every mutation case must fail.
 */
function categoryMutation(
    name: string,
    category: Category,
): string | undefined {
    if (control !== 'categories') return undefined;
    const parts = name.split('.');
    if (category === 'absent') {
        const root = parts.slice(0, -1).join('.');
        return `${root} = {}; ${name} = function() return 17 end`;
    }
    if (parts.length > 2) return `${parts.slice(0, -1).join('.')} = {}`;
    return `${name} = nil`;
}

for (const [plugin, audit] of Object.entries(artifact.plugins)) {
    const present = existsSync(audit.path);
    if (!present)
        console.warn(
            `Skipping ${plugin} demand audit: run bash scripts/fetch-test-plugins.sh`,
        );
    it.skipIf(!present)(`plugin API-demand audit ${plugin}`, () => {
        const original = readFileSync(audit.path, 'utf8');
        const source =
            original +
            (control === 'unresolved'
                ? '\nvim.fn[unknown_name]()'
                : control === 'hash'
                  ? '\n-- hash negative control'
                  : '');
        // Authenticate fetched bytes before executing ANY of them. A changed
        // fixture must not get to execute and only then fail its digest check.
        const trustedHash = createHash('sha256')
            .update(control === 'hash' ? source : original)
            .digest('hex');
        if (trustedHash !== audit.sha256)
            throw new Error(
                `Untrusted fixture ${plugin}: SHA-256 ${trustedHash}, expected ${audit.sha256}`,
            );
        const closure = scanPluginClosure(
            audit.path,
            'test-vault/lua',
            (path) =>
                path === audit.path
                    ? source
                    : existsSync(path)
                      ? readFileSync(path, 'utf8')
                      : null,
        );
        const scans = Object.values(closure.files);
        const scan = {
            sites: scans.flatMap((file) => file.sites),
            unresolved: scans.flatMap((file) => file.unresolved),
            requires: sorted(new Set(scans.flatMap((file) => file.requires))),
        };
        const rows = { ...audit.demands };
        if (control === 'checklist') delete rows['vim.fn.col'];
        const actualSites = Object.fromEntries(
            sorted(new Set(scan.sites.map((site) => site.name))).map((name) => [
                name,
                scan.sites
                    .filter((site) => site.name === name)
                    .map((site) => site.line),
            ]),
        );
        const missing = compareDemandToInventory(scan.sites, Object.keys(rows));
        const invalidRows = Object.entries(rows).filter(
            ([, row]) =>
                !['real', 'stub', 'silent', 'absent'].includes(row[0]) ||
                !['load', 'core', 'optional'].includes(row[1]) ||
                row[2].length === 0 ||
                !row[3] ||
                !row[4] ||
                !row[5] ||
                (row[0] !== 'real' &&
                    row[1] !== 'optional' &&
                    row[5] === 'allow'),
        );
        const dispositions = new Set(
            Object.values(rows)
                .map((row) => row[5])
                .filter((id) => id !== 'allow'),
        );
        const unknownDispositions = [...dispositions].filter(
            (id) => !artifact.blockers[id],
        );
        const wrongBlockerNames = Object.entries(rows)
            .filter(
                ([name, row]) =>
                    row[5] !== 'allow' &&
                    !artifact.blockers[row[5]]?.names.includes(name),
            )
            .map(([name]) => name);
        const activeBlockers = sorted(
            new Set(
                Object.values(rows)
                    .filter(
                        (row) => row[1] !== 'optional' && row[5] !== 'allow',
                    )
                    .map((row) => row[5]),
            ),
        );
        const declaredBlockers = sorted(
            new Set([...audit.loadBlockers, ...audit.coreBlockers]),
        );
        const blockersAt = (tier: string) =>
            sorted(
                new Set(
                    Object.values(rows)
                        .filter((row) => row[1] === tier && row[5] !== 'allow')
                        .map((row) => row[5]),
                ),
            );
        const blockerSplit = {
            load: blockersAt('load'),
            core: blockersAt('core'),
        };
        const installedOptionalModules = Object.keys(closure.files).filter(
            (path) => path !== audit.path,
        );
        const missingModules = closure.missing
            .map((edge) => edge.module)
            .sort();
        const derivedVerdict =
            activeBlockers.length || scan.unresolved.length ? 'BLOCKED' : 'GO';
        const state = createDemandState();
        let loadResult: string;
        try {
            if (control === 'load' && plugin === 'mini.splitjoin')
                runLuaString(
                    state.L,
                    "vim.keymap.set=function() end; return ''",
                );
            loadResult = runLuaString(
                state.L,
                `local module = (function() ${original}\nend)(); local ok,err=pcall(module.setup,{}); return ok and type(module) or ('error:' .. tostring(err))`,
            ).replace(/\[string [\s\S]*?\]:\d+: /g, '');
        } finally {
            state.destroy();
        }
        if (
            control === 'unresolved' &&
            process.env.COORD_DEMAND_REQUIRE_GO === plugin
        )
            requireGo(derivedVerdict, scan.unresolved.length, declaredBlockers);
        expect({
            hash: createHash('sha256').update(source).digest('hex'),
            missing,
            sites: actualSites,
            requires: scan.requires,
            unresolved: scan.unresolved.length,
            invalidRows,
            unknownDispositions,
            wrongBlockerNames,
            activeBlockers,
            blockerSplit,
            installedOptionalModules,
            missingModules,
            verdict: derivedVerdict,
            loadBlocked: loadResult.startsWith('error:'),
            loadResult,
        }).toEqual({
            hash: audit.sha256,
            missing: [],
            sites: Object.fromEntries(
                Object.entries(rows).map(([name, row]) => [name, row[2]]),
            ),
            requires: audit.requires,
            unresolved: 0,
            invalidRows: [],
            unknownDispositions: [],
            wrongBlockerNames: [],
            activeBlockers: declaredBlockers,
            blockerSplit: {
                load: sorted(audit.loadBlockers),
                core: sorted(audit.coreBlockers),
            },
            installedOptionalModules: [],
            missingModules: audit.requires,
            verdict: audit.verdict,
            loadBlocked: audit.loadBlockers.length > 0,
            loadResult: audit.loadResult,
        });
        process.stdout.write(
            `${plugin}: ${Object.keys(rows).length} names, ${scan.sites.length} sites, 0 uncovered, 0 unresolved; load blockers ${audit.loadBlockers.length}; core blockers ${audit.coreBlockers.join(', ')}\n${plugin} gate: ${derivedVerdict}\n`,
        );
        if (process.env.COORD_DEMAND_REQUIRE_GO === plugin)
            requireGo(derivedVerdict, scan.unresolved.length, declaredBlockers);
    });

    describe.skipIf(!present)(
        `plugin API-demand audit category ${plugin}`,
        () => {
            for (const [name, row] of Object.entries(audit.demands)) {
                it(name, () => {
                    const probe = demandProbes[name];
                    if (!probe) throw new Error(`Unprobed demand: ${name}`);
                    const observed = observeDemand(
                        name,
                        probe,
                        categoryMutation(name, row[0]),
                    );
                    expect(observed).toEqual({
                        category: row[0],
                        result: artifact.liveResults[name],
                        warnings: row[0] === 'stub' ? 1 : 0,
                        ...(artifact.liveEffects[name]
                            ? { effect: artifact.liveEffects[name] }
                            : {}),
                    });
                });
            }
        },
    );
}

describe('plugin API-demand audit silent placeholder inventory', () => {
    for (const [name, expected] of Object.entries(artifact.silentInventory)) {
        it(name, () => {
            const entry = silentProbes[name];
            if (!entry)
                throw new Error(`Silent placeholder has no probe: ${name}`);
            const observed = observeDemand(
                name,
                entry.probe,
                categoryMutation(name, expected[0]),
            );
            expect([
                observed.category,
                observed.result,
                observed.warnings,
                entry.owner,
            ]).toEqual(expected);
        });
    }
    it('covers the full discovered silent inventory', () => {
        const names = Object.keys(silentProbes);
        expect(
            sorted(control === 'categories' ? names.slice(1) : names),
        ).toEqual(sorted(Object.keys(artifact.silentInventory)));
    });
});

const scannerCases: Array<[string, string, string[], number]> = [
    [
        'direct Unicode call',
        `vim.fn.col({1,'$'}); local s=${JSON.stringify(COORD_LINE)}`,
        ['vim.fn.col'],
        0,
    ],
    [
        'namespace alias',
        "local api = vim.api; api.nvim_buf_get_mark(0,'a')",
        ['vim.api.nvim_buf_get_mark'],
        0,
    ],
    [
        'bracket namespace and function alias',
        "local fn = vim['fn']; local col = fn.col; col('.')",
        ['vim.fn.col'],
        0,
    ],
    [
        'resolved computed name',
        "local name='col'; vim.fn[name]({1,'$'})",
        ['vim.fn.col'],
        0,
    ],
    [
        'concatenated computed name',
        "local suffix='get_mark'; vim.api['nvim_buf_' .. suffix](0,'a')",
        ['vim.api.nvim_buf_get_mark'],
        0,
    ],
    ['unresolved computed name', 'vim.fn[unknown_name]()', [], 1],
    [
        'optional callback',
        "if config.optional then vim.schedule(function() vim.fn.col('.') end) end",
        ['vim.fn.col', 'vim.schedule'],
        0,
    ],
    [
        'member passed to pcall',
        'pcall(vim.fn.getcharstr)',
        ['vim.fn.getcharstr'],
        0,
    ],
    [
        'ignore documentation and strings',
        '-- vim.fn.fake()\n--[=[vim.api.fake()]=]\nlocal s="vim.fn.fake()"',
        [],
        0,
    ],
    [
        'results are not namespace aliases',
        "local result = vim.fn.col('.')\nreturn result",
        ['vim.fn.col'],
        0,
    ],
    [
        'arithmetic is not a namespace alias',
        'local n=vim.o.columns * 2\nreturn n',
        ['vim.o.columns'],
        0,
    ],
    [
        'shadowed vim is explicitly unresolved',
        "local vim = other; vim.fn.col('.')",
        [],
        1,
    ],
    [
        'non-global require fields are not module loads',
        "local t={require=function() end}; t.require('fake'); t:require('fake')",
        [],
        0,
    ],
    [
        'local require is not the module loader',
        "local require = function() end; require('fake')",
        [],
        0,
    ],
];
describe('plugin API-demand audit discovers aliases and rejects omissions', () => {
    for (const [name, source, names, unresolved] of scannerCases) {
        it(name, () => {
            const mutated =
                name === 'shadowed vim is explicitly unresolved'
                    ? source.replace('local vim = other', 'local alias = other')
                    : source + '\nvim.__negative_control()';
            const scan = scanPluginDemand(
                control === 'scanner' ? mutated : source,
            );
            const result = {
                names: sorted(new Set(scan.sites.map((site) => site.name))),
                unresolved: scan.unresolved.length,
            };
            expect(result).toEqual({ names, unresolved });
        });
    }
    it('omitting col produces its exact missing-demand set', () => {
        const scan = scanPluginDemand(
            control === 'scanner'
                ? 'vim.schedule(function() end)'
                : "local f = vim.fn.col; f({1,'$'})",
        );
        expect(compareDemandToInventory(scan.sites, [])).toEqual([
            'vim.fn.col',
        ]);
    });
    it('strict GO rejects unresolved requirements before checking blockers', () => {
        expect(() =>
            requireGo('GO', control === 'scanner' ? 0 : 1, []),
        ).toThrow('1 unresolved requirement versus 0');
    });
});

it('plugin API-demand audit source closure resolves aliases and cycles', () => {
    const sources: Record<string, string> = {
        'lua/entry.lua':
            "local req = require; req('child'); require('missing')",
        'lua/child/init.lua':
            "local api=vim.api; api.nvim_buf_get_mark(0,'a'); require('entry'); require('grandchild')",
        'lua/grandchild.lua': "local name='col'; vim['fn'][name]({1,'$'})",
    };
    if (control === 'scanner') delete sources['lua/grandchild.lua'];
    const closure = scanPluginClosure(
        'lua/entry.lua',
        'lua',
        (path) => sources[path] ?? null,
    );
    expect({
        files: sorted(Object.keys(closure.files)),
        names: sorted(
            new Set(
                Object.values(closure.files).flatMap((file) =>
                    file.sites.map((site) => site.name),
                ),
            ),
        ),
        missing: closure.missing,
    }).toEqual({
        files: ['lua/child/init.lua', 'lua/entry.lua', 'lua/grandchild.lua'],
        names: ['vim.api.nvim_buf_get_mark', 'vim.fn.col'],
        missing: [{ from: 'lua/entry.lua', module: 'missing' }],
    });
});

it('plugin API-demand audit exact blocker name sets', () => {
    const observed = Object.fromEntries(
        Object.keys(artifact.blockers).map((id) => [
            id,
            sorted(
                new Set(
                    Object.values(artifact.plugins).flatMap((plugin) =>
                        Object.entries(plugin.demands)
                            .filter(([, row]) => row[5] === id)
                            .map(([name]) => name),
                    ),
                ),
            ),
        ]),
    );
    if (control === 'checklist') observed['set-text-bytes'] = [];
    expect(observed).toEqual(
        Object.fromEntries(
            Object.entries(artifact.blockers).map(([id, blocker]) => [
                id,
                sorted(blocker.names),
            ]),
        ),
    );
});

it('plugin API-demand audit effective registry accounting', () => {
    const api = collectApiInventory();
    const originalFnSource = readFileSync('src/lua/fn.ts', 'utf8');
    const fnSource =
        control === 'registry'
            ? originalFnSource.replace(
                  "registry.set('getwininfo'",
                  "retiredRegistry.set('getwininfo'",
              )
            : originalFnSource;
    const fn = collectFnInventory(fnSource);
    const full = createDemandState();
    const sync = createDemandState(false);
    try {
        const live = collectLiveRegistries(full.L);
        const syncLive = collectLiveRegistries(sync.L);
        const declarationNames = new Set([...fn.real, ...fn.declared]);
        const promotions = [
            'line2byte',
            'byte2line',
            'win_getid',
            'winnr',
            'charcol',
            'virtcol',
            'deletebufline',
        ];
        let historical = fnSource;
        for (const name of [...promotions, 'virtcol2col'])
            historical = historical.replace(
                `registry.set('${name}'`,
                `retiredRegistry.set('${name}'`,
            );
        historical = historical.replace(
            "'search',",
            `${promotions.map((name) => `'${name}',`).join('')} 'search',`,
        );
        const duplicate = historical.replace(
            'const tableReturnFns = new Set([',
            "const tableReturnFns = new Set(['getwininfo',",
        );
        const lostReal = duplicate.replace(
            "registry.set('getwininfo'",
            "retiredRegistry.set('getwininfo'",
        );
        const counts = (text: string) => {
            const inventory = collectFnInventory(text);
            return [
                inventory.real.size,
                inventory.declared.size,
                inventory.effective.size,
                new Set([...inventory.real, ...inventory.declared]).size,
            ];
        };
        const warningNames: string[] = [];
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation((message: unknown) => {
                const match =
                    /^Vim Motions: (vim\.(?:api|fn)\.\w+) is not implemented/.exec(
                        String(message),
                    );
                if (match?.[1]) warningNames.push(match[1]);
            });
        const apiFallbacks = sorted(
            [...api.known].filter((name) => !api.supported.has(name)),
        );
        let repeatWarnings: number;
        try {
            const calls = [
                ...apiFallbacks.map(
                    (name) => `pcall(vim.api[${JSON.stringify(name)}])`,
                ),
                ...[...fn.effective].map(
                    (name) => `pcall(vim.fn[${JSON.stringify(name)}])`,
                ),
            ].join(';');
            runLuaString(full.L, `${calls}; return ''`);
            const firstCount = warningNames.length;
            runLuaString(full.L, `${calls}; return ''`);
            repeatWarnings = warningNames.length - firstCount;
        } finally {
            warn.mockRestore();
        }
        const expectedWarnings = sorted([
            ...apiFallbacks.map((name) => `vim.api.${name}`),
            ...[...fn.effective]
                .filter((name) => !['system', 'systemlist'].includes(name))
                .map((name) => `vim.fn.${name}`),
        ]);
        // These three warn-once API fallbacks reach the dispatcher's final nil
        // return rather than an explicit return-type set. They are not absent.
        expect({
            live,
            syncFn: syncLive.fn,
            apiRegistered: sorted(api.registered),
            fullCounts: counts(fnSource),
            historical: counts(historical),
            duplicate: counts(duplicate),
            lostReal: counts(lostReal),
            conditions: sorted(fn.conditional.keys()),
            warningNames: sorted(warningNames),
            repeatWarnings,
            implicitNilReturn: sorted(
                [...api.known].filter(
                    (name) =>
                        !api.supported.has(name) &&
                        ![...api.returnTypes.values()].some((names) =>
                            names.has(name),
                        ),
                ),
            ),
        }).toEqual({
            live: {
                supported: sorted(api.supported),
                known: sorted(api.known),
                registered: sorted(api.registered),
                fn: sorted(declarationNames),
            },
            syncFn: sorted(
                [...declarationNames].filter(
                    (name) => !fn.conditional.has(name),
                ),
            ),
            apiRegistered: sorted(api.supported),
            fullCounts: [92, 39, 39, 131],
            historical: [84, 46, 46, 130],
            duplicate: [84, 47, 46, 130],
            lostReal: [83, 47, 47, 130],
            conditions: ['getchar', 'getcharstr', 'input'],
            warningNames: expectedWarnings,
            repeatWarnings: 0,
            implicitNilReturn: [
                'nvim_buf_add_highlight',
                'nvim_del_augroup_by_id',
                'nvim_set_extmark',
            ],
        });
    } finally {
        full.destroy();
        sync.destroy();
    }
});

it('plugin API-demand audit fixture pins and injection order', () => {
    const manifest = JSON.parse(
        readFileSync('test/fixtures/test-plugins.json', 'utf8'),
    ) as Array<{ repo: string; ref: string; files?: string[] }>;
    const fixture = manifest.find((entry) => entry.repo === artifact.repo);
    if (control === 'pins' && fixture) fixture.ref = 'main';
    const loader = readFileSync('src/lua/loader.ts', 'utf8');
    const calls = [
        ...loader.matchAll(
            /\b(inject(?:VimApi|UiApi|NamespaceStubs|IterApi|TextObjectApi|TreesitterApi|VimFn|Stdlib|IoShim|Timers|PackageAndRequire|SnippetApi))\(/g,
        ),
    ].map((match) => match[1]);
    expect({
        fixture,
        pinned: /^[a-f0-9]{40}$/.test(artifact.ref),
        calls,
    }).toEqual({
        fixture: {
            repo: artifact.repo,
            ref: artifact.ref,
            files: Object.values(artifact.plugins).map(
                (plugin) => plugin.archivePath,
            ),
        },
        pinned: true,
        calls: [
            'injectVimApi',
            'injectUiApi',
            'injectNamespaceStubs',
            'injectIterApi',
            'injectTextObjectApi',
            'injectTreesitterApi',
            'injectVimFn',
            'injectStdlib',
            'injectIoShim',
            'injectTimers',
            'injectPackageAndRequire',
            'injectSnippetApi',
        ],
    });
});

it('plugin API-demand audit rejects unrecognized registration syntax', () => {
    const source = readFileSync('src/lua/fn.ts', 'utf8');
    const computed = source.replace(
        "registry.set('has'",
        'registry.set(computed_name',
    );
    expect(() =>
        collectFnInventory(control === 'registry' ? source : computed),
    ).toThrow('Unresolved dynamic fn real registration');
});

it('plugin API-demand audit source-derived silent candidates', () => {
    const candidates = collectSilentCandidates();
    const expected = Object.entries(silentProbes)
        .filter(([name]) => artifact.silentInventory[name]?.[0] === 'silent')
        .map(([name, entry]) => {
            const path = entry.source.split(':')[0];
            const member =
                name === 'vim.treesitter.query.add_directive'
                    ? 'DirectiveHandler'
                    : path === 'src/lua/stdlib.ts'
                      ? name
                      : name.split('.').pop();
            return `${path}#${member}`;
        });
    expected.push(...Object.keys(artifact.intentionalConstantCandidates));
    if (control === 'registry')
        expected.splice(expected.indexOf('src/lua/stdlib.ts#vim.iconv'), 1);
    expect(candidates).toEqual(sorted(expected));
});
