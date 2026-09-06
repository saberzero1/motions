import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { lua, to_luastring } from '../../../src/lib/fengari';
import {
    createSandboxedState,
    destroyState,
    evalLua,
} from '../../../src/lua/engine';
import {
    initTreesitterRuntime,
    injectTreesitterApi,
} from '../../../src/lua/treesitter/api';
import {
    clearQueryFiles,
    getQueryDiagnostics,
    getQueryFiles,
    preloadQueryFiles,
    type QueryFileAdapter,
    MAX_QUERY_FILE_BYTES,
    MAX_QUERY_BYTES,
} from '../../../src/treesitter/query-files';
import {
    BUNDLED_TEXTOBJECTS,
    MARKDOWN_TEXTOBJECTS,
} from '../../../src/treesitter/bundled-queries';
import { QueryWrapper } from '../../../src/treesitter/query';
import { NamedQueries } from '../../../src/treesitter/named-queries';
import * as runtime from '../../../src/treesitter/runtime';
import {
    writePluginFiles,
    type PluginLock,
    type VaultAdapter,
} from '../../../src/lua/plugin-store';

// Vite externalizes node_modules WASM; supply the actual bytes instead of
// allowing Node to interpret the Emscripten module as a standalone WASI module.
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

function vault(files: Record<string, string>): QueryFileAdapter {
    return {
        exists: vi.fn(
            async (path: string) =>
                path in files ||
                Object.keys(files).some((p) => p.startsWith(`${path}/`)),
        ),
        read: vi.fn(async (path: string) => {
            const text = files[path];
            if (text === undefined) throw new Error(`Missing file: ${path}`);
            return text;
        }),
        list: vi.fn(async (path: string) => {
            const children = Object.keys(files).filter((p) =>
                p.startsWith(`${path}/`),
            );
            const folders = new Set<string>();
            const direct: string[] = [];
            for (const child of children) {
                const slash = child.indexOf('/', path.length + 1);
                if (slash < 0) direct.push(child);
                else folders.add(child.slice(0, slash));
            }
            return { files: direct, folders: [...folders] };
        }),
    };
}

const markdown =
    '# Heading\n\n- first item\n- second item\n\n```js\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| C | D |\n\n[ref]: https://example.com\n';

describe('treesitter named queries (real bundled grammars)', () => {
    let L: ReturnType<typeof createSandboxedState>;

    beforeAll(async () => {
        await initTreesitterRuntime();
    });

    beforeEach(() => {
        clearQueryFiles();
        L = createSandboxedState();
        lua.lua_newtable(L);
        lua.lua_setglobal(L, to_luastring('vim'));
        injectTreesitterApi(L, undefined, () => markdown);
    });

    afterEach(() => {
        destroyState(L);
        clearQueryFiles();
        vi.restoreAllMocks();
    });

    function run(code: string): void {
        expect(evalLua(L, code)).toEqual({ ok: true });
    }

    it('resolves a vault .scm synchronously after startup, even on re-initialization', async () => {
        const adapter = vault({
            'lua/queries/markdown/custom.scm': '(paragraph) @file',
        });
        await initTreesitterRuntime(adapter);
        vi.mocked(adapter.read).mockClear();
        run(`
            local q = vim.treesitter.query.get('markdown', 'custom')
            assert(q.captures[1] == 'file')
            assert(vim.treesitter.query.get_files('markdown', 'custom')[1] == 'lua/queries/markdown/custom.scm')
        `);
        expect(adapter.read).not.toHaveBeenCalled();
    });

    it('query.set takes precedence over both files and bundled queries', async () => {
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/textobjects.scm': '(paragraph) @file',
            }),
        );
        run(`
            assert(vim.treesitter.query.get('markdown', 'textobjects').captures[1] == 'file')
            vim.treesitter.query.set('markdown', 'textobjects', '(section) @override')
            local q = vim.treesitter.query.get('markdown', 'textobjects')
            assert(#q.captures == 1 and q.captures[1] == 'override')
            assert(#vim.treesitter.query.get_files('markdown', 'textobjects') == 1)
            vim.treesitter.query.set('markdown', 'textobjects', '')
            assert(vim.treesitter.query.get('markdown', 'textobjects') == nil)
        `);
    });

    it('returns nil for missing queries and unloaded/unknown languages', () => {
        run(`
            assert(vim.treesitter.query.get('markdown', 'absent') == nil)
            assert(vim.treesitter.query.get('unknown', 'textobjects') == nil)
            assert(#vim.treesitter.query.get_files('markdown', 'absent') == 0)
        `);
    });

    it('logs malformed files once, retains diagnostics and skips them without crashing Lua', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/bad.scm': '(nonexistent_node) @broken',
                'lua/queries/markdown/mixed.scm': '(paragraph) @valid',
                'lua/plugin/queries/markdown/mixed.scm':
                    ';; extends\n(paragraph',
            }),
        );
        run(`
            assert(vim.treesitter.query.get('markdown', 'bad') == nil)
            assert(vim.treesitter.query.get('markdown', 'bad') == nil)
            assert(vim.treesitter.query.get('markdown', 'mixed').captures[1] == 'valid')
        `);
        expect(warning).toHaveBeenCalledTimes(2);
        expect(getQueryDiagnostics().map((d) => d.path)).toEqual([
            'lua/queries/markdown/bad.scm',
            'lua/plugin/queries/markdown/mixed.scm',
        ]);
    });

    it('orders inherited files, first base, then extensions; ignores later bases', async () => {
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/custom.scm':
                    ';; inherits: base\n;; extends\n(section) @user',
                'lua/queries/base/custom.scm': '(paragraph) @inherited',
                'lua/alpha/queries/markdown/custom.scm': '(paragraph) @plugin',
                'lua/beta/queries/markdown/custom.scm': '(paragraph) @ignored',
                'lua/gamma/queries/markdown/custom.scm':
                    ';; inherits: markdown\n(list_item) @extension',
            }),
        );
        expect(getQueryFiles('markdown', 'custom')).toEqual([
            'lua/queries/base/custom.scm',
            'lua/alpha/queries/markdown/custom.scm',
            'lua/queries/markdown/custom.scm',
            'lua/gamma/queries/markdown/custom.scm',
        ]);
        run(`
            local q = vim.treesitter.query.get('markdown', 'custom')
            assert(table.concat(q.captures, ',') == 'inherited,plugin,user,extension')
        `);
    });

    it('honors optional inheritance and get_files is_included', async () => {
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/custom.scm':
                    ';; inherits: (optional),base\n(section) @own',
                'lua/queries/optional/custom.scm': '(paragraph) @optional',
                'lua/queries/base/custom.scm':
                    ';; inherits: (ignored)\n(paragraph) @base',
                'lua/queries/ignored/custom.scm': '(paragraph) @ignored',
            }),
        );
        run(`
            assert(#vim.treesitter.query.get_files('markdown', 'custom') == 3)
            local files = vim.treesitter.query.get_files('markdown', 'custom', true)
            assert(#files == 2 and files[1] == 'lua/queries/base/custom.scm')
            assert(table.concat(vim.treesitter.query.get('markdown', 'custom').captures, ',') == 'optional,base,own')
        `);
    });

    it('supports explicit extends/inherits without losing override precedence', async () => {
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/custom.scm': '(paragraph) @file',
                'lua/queries/base/custom.scm': '(paragraph) @base',
            }),
        );
        run(`
            vim.treesitter.query.set('markdown', 'custom', [[;; extends\n(section) @explicit]])
            assert(table.concat(vim.treesitter.query.get('markdown', 'custom').captures, ',') == 'file,explicit')
            vim.treesitter.query.set('markdown', 'custom', [[;; inherits: (base),markdown\n(section) @explicit]])
            assert(table.concat(vim.treesitter.query.get('markdown', 'custom').captures, ',') == 'base,explicit')
        `);
    });

    it('stops reading modelines at the first non-comment line and protects against cycles', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/custom.scm':
                    ';; inherits: base\n(section) @own',
                'lua/queries/base/custom.scm':
                    ';; inherits: markdown\n(paragraph) @base',
                'lua/plugin/queries/markdown/custom.scm':
                    '\n;; extends\n(list_item) @ignored',
            }),
        );
        run(
            `assert(table.concat(vim.treesitter.query.get('markdown', 'custom').captures, ',') == 'base,own')`,
        );
        expect(getQueryDiagnostics()[0]?.message).toContain('Cyclic');
    });

    it('refreshes cached hits and misses while retaining explicit overrides and old query objects', async () => {
        await preloadQueryFiles(
            vault({ 'lua/queries/markdown/custom.scm': '(paragraph) @old' }),
        );
        run(`
            old = vim.treesitter.query.get('markdown', 'custom')
            assert(vim.treesitter.query.get('markdown', 'new') == nil)
            vim.treesitter.query.set('markdown', 'override', '(section) @explicit')
        `);
        await preloadQueryFiles(
            vault({ 'lua/queries/markdown/new.scm': '(paragraph) @new' }),
        );
        run(`
            assert(vim.treesitter.query.get('markdown', 'custom') == nil)
            assert(vim.treesitter.query.get('markdown', 'new').captures[1] == 'new')
            assert(vim.treesitter.query.get('markdown', 'override').captures[1] == 'explicit')
            local tree = vim.treesitter.get_string_parser('text', 'markdown')
            assert(old:iter_captures(tree:root())() ~= nil)
        `);
    });

    it('isolates overrides between Lua states and disposes owned queries on state destruction', () => {
        run(
            `vim.treesitter.query.set('markdown', 'custom', '(paragraph) @local_query')`,
        );
        run(`assert(vim.treesitter.query.get('markdown', 'custom') ~= nil)`);
        const dispose = vi.spyOn(NamedQueries.prototype, 'dispose');
        destroyState(L);
        expect(dispose).toHaveBeenCalledOnce();
        L = createSandboxedState();
        lua.lua_newtable(L);
        lua.lua_setglobal(L, to_luastring('vim'));
        injectTreesitterApi(L, undefined, () => markdown);
        run(`assert(vim.treesitter.query.get('markdown', 'custom') == nil)`);
    });

    it('keeps empty files empty and rejects path traversal without I/O', async () => {
        await preloadQueryFiles(
            vault({ 'lua/queries/markdown/empty.scm': '' }),
        );
        run(`
            assert(vim.treesitter.query.get('markdown', 'empty') == nil)
            assert(#vim.treesitter.query.get_files('../markdown', 'empty') == 0)
            assert(#vim.treesitter.query.get_files('markdown', '../empty') == 0)
        `);
    });

    it('allows a user extends query to augment the bundled fallback', async () => {
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/textobjects.scm':
                    ';; extends\n(paragraph) @custom',
            }),
        );
        run(`
            local q = vim.treesitter.query.get('markdown', 'textobjects')
            assert(q.captures[1] == 'class.outer')
            assert(q.captures[#q.captures] == 'custom')
        `);
    });

    it('installs plugin queries separately and refreshes them before plugin setup resumes', async () => {
        const files: Record<string, string> = {
            'lua/queries/markdown/textobjects.scm':
                ';; extends\n(paragraph) @user',
        };
        const adapter: VaultAdapter = {
            ...vault(files),
            write: async (path, text) => {
                files[path] = text;
            },
            mkdir: async () => {},
            remove: async (path) => {
                for (const key of Object.keys(files)) {
                    if (key === path || key.startsWith(`${path}/`))
                        delete files[key];
                }
            },
        };
        const lock: PluginLock = {};
        await writePluginFiles(
            adapter,
            'owner/plugin.nvim',
            'main',
            [
                { path: 'lua/plugin/init.lua', data: 'return {}' },
                {
                    path: 'queries/markdown/textobjects.scm',
                    data: '(section) @plugin',
                },
            ],
            lock,
        );
        expect(lock['owner/plugin.nvim']?.files).toContain(
            'lua/owner__plugin.nvim/queries/markdown/textobjects.scm',
        );
        expect(files['lua/queries/markdown/textobjects.scm']).toContain(
            '@user',
        );
        run(
            `assert(table.concat(vim.treesitter.query.get('markdown', 'textobjects').captures, ',') == 'plugin,user')`,
        );
        // An update removing a query must not leave it in the snapshot or vault.
        await writePluginFiles(adapter, 'owner/plugin.nvim', 'next', [], lock);
        expect(getQueryFiles('markdown', 'textobjects')).toEqual([
            'lua/queries/markdown/textobjects.scm',
        ]);
        expect(
            files['lua/owner__plugin.nvim/queries/markdown/textobjects.scm'],
        ).toBeUndefined();
    });

    it('rejects plugin query traversal before any vault write', async () => {
        const write = vi.fn(async () => {});
        const adapter: VaultAdapter = {
            ...vault({}),
            write,
            mkdir: async () => {},
            remove: async () => {},
        };
        await expect(
            writePluginFiles(
                adapter,
                'owner/plugin',
                'main',
                [
                    {
                        path: 'queries/../../escape.scm',
                        data: '(paragraph) @bad',
                    },
                ],
                {},
            ),
        ).rejects.toThrow('Invalid plugin query path');
        await expect(
            writePluginFiles(
                adapter,
                '../plugin',
                'main',
                [
                    {
                        path: 'queries/markdown/custom.scm',
                        data: '(paragraph) @bad',
                    },
                ],
                {},
            ),
        ).rejects.toThrow('Invalid plugin repository');
        // Even an archive with no queries must validate the cleanup namespace.
        await expect(
            writePluginFiles(adapter, '../plugin', 'main', [], {}),
        ).rejects.toThrow('Invalid plugin repository');
        // GitHub owners cannot contain underscores; reject ambiguous a__b/c.
        await expect(
            writePluginFiles(adapter, 'a__b/c', 'main', [], {}),
        ).rejects.toThrow('Invalid plugin repository');
        expect(write).not.toHaveBeenCalled();
    });

    it('uses document text for file-query predicates and Neovim iterator row arguments', async () => {
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/filtered.scm':
                    '((inline) @text (#eq? @text "target"))',
            }),
        );
        run(`
            local source = [[target\n\nother]]
            local root = vim.treesitter.get_string_parser(source, 'markdown'):root()
            local q = vim.treesitter.query.get('markdown', 'filtered')
            assert(q:iter_captures(root, 0, 0, 1)() ~= nil)
            assert(q:iter_captures(root, source, 0, 1)() ~= nil)
            assert(q:iter_captures(root, 0, 2, 3)() == nil)
            assert(q:iter_matches(root, 0, 0, 1)() ~= nil)
            assert(q:iter_matches(root, source, 2, 3)() == nil)
        `);
    });

    it('does not publish stale scan diagnostics after a newer snapshot commits', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let started!: () => void;
        let rejectRead!: (error: Error) => void;
        const reading = new Promise<void>((resolve) => {
            started = resolve;
        });
        const pending = new Promise<string>((_resolve, reject) => {
            rejectRead = reject;
        });
        const old = vault({ 'lua/queries/markdown/old.scm': '' });
        old.read = async () => {
            started();
            return pending;
        };
        const oldScan = preloadQueryFiles(old);
        await reading;
        await preloadQueryFiles(
            vault({ 'lua/queries/markdown/new.scm': '(paragraph) @new' }),
        );
        rejectRead(new Error('Stale read failure'));
        await oldScan;
        expect(getQueryDiagnostics()).toEqual([]);
        expect(warning).not.toHaveBeenCalled();
        expect(getQueryFiles('markdown', 'new')).toHaveLength(1);
        expect(getQueryFiles('markdown', 'old')).toEqual([]);
    });

    it('bounds file size, explicit query size and branching inheritance', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await preloadQueryFiles(
            vault({
                'lua/queries/markdown/large.scm': ';'.repeat(
                    MAX_QUERY_FILE_BYTES + 1,
                ),
                'lua/queries/markdown/branch.scm': `;; inherits: ${Array(100).fill('base').join(',')}\n(paragraph) @own`,
                'lua/queries/base/branch.scm': '(paragraph) @base',
            }),
        );
        expect(getQueryFiles('markdown', 'large')).toEqual([]);
        expect(getQueryFiles('markdown', 'branch').length).toBeLessThanOrEqual(
            64,
        );
        run(`
            vim.treesitter.query.set('markdown', 'huge', string.rep(';', ${MAX_QUERY_BYTES + 1}))
            assert(vim.treesitter.query.get('markdown', 'huge') == nil)
        `);
        expect(getQueryDiagnostics().length).toBeGreaterThanOrEqual(3);
    });

    it('compiles the bundled markdown query and captures meaningful constructs via Lua and WASM', () => {
        const language = runtime.getLanguage('markdown')!;
        const query = new QueryWrapper(language, MARKDOWN_TEXTOBJECTS);
        const tree = runtime.parseString('markdown', markdown);
        try {
            const captures = query.iterCaptures(tree.rootNode, markdown);
            const captured = captures.map(
                (c) => `${c.captureName}:${c.node.type}`,
            );
            expect(captured).toEqual(
                expect.arrayContaining([
                    'class.outer:section',
                    'function.outer:atx_heading',
                    'function.inner:inline',
                    'parameter.outer:list_item',
                    'block.outer:fenced_code_block',
                    'block.inner:code_fence_content',
                    'parameter.outer:pipe_table_row',
                    'parameter.inner:pipe_table_cell',
                    'parameter.outer:link_reference_definition',
                ]),
            );
            console.info(
                `Bundled markdown textobjects: ${captures.length} captures against shipped WASM`,
            );
            run(`
                local q = vim.treesitter.query.get('markdown', 'textobjects')
                local tree = vim.treesitter.get_string_parser([[# Heading\n\nbody]], 'markdown')
                local count = 0
                for id, node in q:iter_captures(tree:root()) do
                    assert(q.captures[id] ~= nil and node:type() ~= nil)
                    count = count + 1
                end
                assert(count > 0)
                assert(#vim.treesitter.query.get_files('markdown', 'textobjects') == 0)
            `);
        } finally {
            query.delete();
            tree.delete();
        }
    });

    it.each([
        ['markdown_inline', '[link](https://example.com)'],
        ['html', '<div title="example">Hello</div><script>let x = 1;</script>'],
    ])(
        'compiles and captures the bundled %s query against its own grammar',
        (lang, source) => {
            const query = new QueryWrapper(
                runtime.getLanguage(lang)!,
                BUNDLED_TEXTOBJECTS.get(lang)!,
            );
            const tree = runtime.parseString(lang, source);
            try {
                expect(
                    query.iterCaptures(tree.rootNode, source).length,
                ).toBeGreaterThan(0);
            } finally {
                query.delete();
                tree.delete();
            }
        },
    );
});
