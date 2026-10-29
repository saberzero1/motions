import { browser, expect } from '@wdio/globals';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getNotices, loadSingleFileWorkspace, setupEditor } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';
import { killIfAlive } from './rpc-process';

// The generated file is only useful if Neovim can actually require it, which
// depends on it landing under lua/ on the runtimepath. That is asserted here
// against a live Neovim rather than by inspecting the path we chose.

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface ExportOutcome {
    status: string;
    path?: string;
    reason?: string;
}

interface RpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
        neovimConfigExportFingerprint: string;
        neovimConfigExportAutoRefresh: boolean;
        enableFlash: boolean;
        enableSnippets: boolean;
        snippetBundled: boolean;
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
    exportNeovimConfigFile(): Promise<ExportOutcome>;
    generateNeovimConfigText(): string;
    isNeovimConfigExportStale(): boolean;
}

const spawnedPids = new Set<number>();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const GENERATED_PATH = resolve('test/fixtures/nvim/lua/vim_motions.lua');
const LUASNIP_FIXTURE = 'test-vault/lua/luasnip/init.lua';

async function plugin<T>(
    fn: (plugin: RpcPlugin) => T | Promise<T>,
): Promise<T> {
    return (await browser.executeObsidian(async ({ app }, body: string) => {
        const target = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!target) throw new Error('Vim Motions is not loaded');
        return await (
            new Function(`return (${body})`)() as (p: RpcPlugin) => unknown
        )(target);
    }, fn.toString())) as T;
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, nextConfigPath: string) => {
            const target = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!target) throw new Error('Vim Motions is not loaded');
            target.settings.neovimBinaryPath = '';
            target.settings.neovimConfigPath = nextConfigPath;
            target.settings.neovimRpcEnabled = nextEnabled;
            await target.saveSettings();
            target.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function waitForConnected(): Promise<void> {
    try {
        await browser.waitUntil(
            async () =>
                (await plugin((p) => p.getNeovimConnectionState())).connected,
            { timeout: 10000, interval: 100 },
        );
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await plugin((p) => p.getNeovimConnectionState())).pid;
    if (pid !== null) spawnedPids.add(pid);
}

function luaStringLiterals(source: string): string[] {
    return [...source.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((match) =>
        (match[1] ?? '').replace(/\\(.)/g, '$1'),
    );
}

async function openVimEngineSettings(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const setting = (
            app as unknown as {
                setting: { open(): void; openTabById(id: string): unknown };
            }
        ).setting;
        setting.open();
        setting.openTabById('vim-motions');
    });
    // Post-1.13 renders the seven setting pages as navigable rows; the export
    // controls live inside General and are not in the DOM until it is opened.
    await browser.executeObsidian(() => {
        const rows = Array.from(
            document.querySelectorAll('.setting-item.mod-navigable'),
        );
        const general = rows.find(
            (row) =>
                row.querySelector('.setting-item-name')?.textContent ===
                'General',
        );
        (general as HTMLElement | undefined)?.click();
    });
}

async function clickButton(label: string): Promise<boolean> {
    return (await browser.executeObsidian((_context, text: string) => {
        const button = Array.from(document.querySelectorAll('button')).find(
            (candidate) => (candidate.textContent ?? '').trim() === text,
        );
        if (!button) return false;
        (button as HTMLButtonElement).click();
        return true;
    }, label)) as boolean;
}

// Scoped by the setup modal's own classes: the settings tab is itself a
// modal, so taking "the first .modal" finds the settings pane instead.
async function modalSnapshot(): Promise<{
    repos: string[];
    preview: string;
    buttons: string[];
}> {
    return (await browser.executeObsidian(() => {
        const preview = document.querySelector(
            '.vim-motions-setup-preview',
        ) as HTMLElement | null;
        const modal = preview?.closest('.modal') ?? null;
        return {
            repos: Array.from(
                document.querySelectorAll('.vim-motions-setup-repo'),
            ).map((element) => element.textContent ?? ''),
            preview: preview?.textContent ?? '',
            buttons: Array.from(modal?.querySelectorAll('button') ?? []).map(
                (element) => (element.textContent ?? '').trim(),
            ),
        };
    })) as { repos: string[]; preview: string; buttons: string[] };
}

describe('Neovim RPC configuration export', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        rmSync(GENERATED_PATH, { force: true });
        rmSync(resolve('test/fixtures/nvim/lua/vim-motions-snippets'), {
            force: true,
            recursive: true,
        });
        await loadSingleFileWorkspace();
        await setupEditor('export', { line: 0, ch: 0 });
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();
    });

    afterEach(async () => {
        await browser.executeObsidian(({ app }) => {
            (app as unknown as { setting: { close(): void } }).setting.close();
        });
        await plugin(async (p) => {
            p.settings.neovimConfigExportAutoRefresh = false;
            await p.saveSettings();
        });
        await setRpcEnabled(false);
        rmSync(GENERATED_PATH, { force: true });
        for (const pid of spawnedPids) {
            killIfAlive(pid);
            spawnedPids.delete(pid);
        }
    });

    it('writes a file the live Neovim can require', async () => {
        const outcome = await plugin((p) => p.exportNeovimConfigFile());
        expect(outcome.status).toBe('written');
        expect(outcome.path).toBe(GENERATED_PATH);
        expect(existsSync(GENERATED_PATH)).toBe(true);

        // Restarted first: Neovim scans runtimepath for lua/ when it starts,
        // so a directory created afterwards is invisible to require until the
        // next launch. A user has to restart anyway to add the require line.
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();

        const required = await plugin((p) =>
            p.requestNeovim('nvim_exec_lua', [
                "package.loaded['vim_motions'] = nil\nreturn (pcall(require, 'vim_motions'))",
                [],
            ]),
        );
        expect(required).toBe(true);
    });

    it('produces a file that loads with none of the plugins installed', async () => {
        await plugin((p) => p.exportNeovimConfigFile());
        const body = readFileSync(GENERATED_PATH, 'utf8');
        expect(body).toContain('nvim-surround');
        const errors = await plugin((p) =>
            p.requestNeovim('nvim_exec_lua', [
                `package.loaded['vim_motions'] = nil
local ok, err = pcall(require, 'vim_motions')
return ok and '' or tostring(err)`,
                [],
            ]),
        );
        expect(errors).toBe('');
    });

    it('refuses to overwrite a file the user has taken over', async () => {
        await plugin((p) => p.exportNeovimConfigFile());
        writeFileSync(GENERATED_PATH, 'return { mine = true }\n', 'utf8');
        const outcome = await plugin((p) => p.exportNeovimConfigFile());
        expect(outcome.status).toBe('foreign');
        expect(readFileSync(GENERATED_PATH, 'utf8')).toBe(
            'return { mine = true }\n',
        );
    });

    // The spec fixture spawns with --clean, which strips the user packpath and
    // makes vim.pack install to disk without ever activating the plugin. That
    // failure looks like success, so it is asserted against the real spawn
    // rather than against a hand-built command line.
    it('spawns Neovim able to activate a packaged plugin', async () => {
        const packpath = await plugin((p) =>
            p.requestNeovim('nvim_exec_lua', [
                "return vim.o.packpath:find(vim.fs.joinpath(vim.fn.stdpath('data'), 'site'), 1, true) ~= nil",
                [],
            ]),
        );
        expect(packpath).toBe(true);

        const packApi = await plugin((p) =>
            p.requestNeovim('nvim_exec_lua', [
                "return type(vim.pack) == 'table' and type(vim.pack.add) == 'function'",
                [],
            ]),
        );
        expect(packApi).toBe(true);
    });

    // The bundled snippets live inside main.js, so unless they are written out
    // the generated config references files Neovim cannot open.
    it('writes the bundled snippet files it tells Neovim to load', async () => {
        await plugin(async (p) => {
            p.settings.enableSnippets = true;
            p.settings.snippetBundled = true;
            await p.saveSettings();
        });
        const outcome = await plugin((p) => p.exportNeovimConfigFile());
        expect(outcome.status).toBe('written');

        const snippetFile = resolve(
            'test/fixtures/nvim/lua/vim-motions-snippets/global.json',
        );
        expect(existsSync(snippetFile)).toBe(true);
        expect(JSON.parse(readFileSync(snippetFile, 'utf8'))).toHaveProperty(
            'Date ISO',
        );
        // Compared after unescaping rather than as a raw substring: the path
        // is embedded in a Lua string literal, so on Windows every separator
        // is doubled and `D:\a\…` never appears verbatim in the file.
        expect(
            luaStringLiterals(readFileSync(GENERATED_PATH, 'utf8')),
        ).toContain(snippetFile);
    });

    // The preview is what makes the install an explicit, informed request, so
    // the load-bearing assertion is the last one: cancelling must leave the
    // filesystem untouched. It covers the write rather than the install,
    // because an install that a sabotaged Cancel had started would land long
    // after any window a test can reasonably wait.
    it('previews what will happen and writes nothing when cancelled', async () => {
        await openVimEngineSettings();
        expect(await clickButton('Set up Neovim')).toBe(true);
        // The handler probes Neovim for which plugins are loadable before it
        // can say what the install will do, so the modal is one round trip
        // behind the click.
        await browser.waitUntil(
            async () => (await modalSnapshot()).repos.length > 0,
            {
                timeout: 5000,
                interval: 100,
                timeoutMsg: 'the setup preview never appeared',
            },
        );
        const modal = await modalSnapshot();
        expect(modal.repos.length).toBeGreaterThan(0);
        for (const repo of modal.repos)
            expect(repo).toContain('https://github.com/');
        expect(modal.preview).toContain('vim.g.mapleader');
        expect(modal.buttons).toContain('Cancel');
        expect(modal.buttons).toContain('Install and write');

        expect(await clickButton('Cancel')).toBe(true);
        await browser.pause(500);
        expect(existsSync(GENERATED_PATH)).toBe(false);
    });

    it('regenerates on a covered change only when auto-refresh is on', async () => {
        await plugin((p) => p.exportNeovimConfigFile());
        const before = readFileSync(GENERATED_PATH, 'utf8');

        await plugin(async (p) => {
            p.settings.neovimConfigExportAutoRefresh = false;
            p.settings.enableFlash = !p.settings.enableFlash;
            await p.saveSettings();
            p.reloadFeatures();
        });
        await browser.pause(1000);
        expect(readFileSync(GENERATED_PATH, 'utf8')).toBe(before);

        await plugin(async (p) => {
            p.settings.neovimConfigExportAutoRefresh = true;
            await p.saveSettings();
            p.reloadFeatures();
        });
        await browser.waitUntil(
            async () => readFileSync(GENERATED_PATH, 'utf8') !== before,
            {
                timeout: 5000,
                interval: 100,
                timeoutMsg: 'auto-refresh never rewrote the configuration',
            },
        );
        expect(readFileSync(GENERATED_PATH, 'utf8')).not.toBe(before);
    });

    it('leaves a hand-edited file alone even with auto-refresh on', async () => {
        await plugin((p) => p.exportNeovimConfigFile());
        writeFileSync(GENERATED_PATH, 'return { mine = true }\n', 'utf8');
        await plugin(async (p) => {
            p.settings.neovimConfigExportAutoRefresh = true;
            p.settings.enableFlash = !p.settings.enableFlash;
            await p.saveSettings();
            p.reloadFeatures();
        });
        await browser.pause(1500);
        expect(readFileSync(GENERATED_PATH, 'utf8')).toBe(
            'return { mine = true }\n',
        );
    });

    // The generated snippet block is only worth anything if a snippet actually
    // expands, so this drives the production path end to end: real keys into
    // the Obsidian editor, forwarded to Neovim, expanded by LuaSnip, and
    // mirrored back through the line-event bridge.
    it('expands a bundled snippet through LuaSnip under RPC', async function () {
        if (!existsSync(LUASNIP_FIXTURE)) {
            console.log(`SKIP: ${LUASNIP_FIXTURE} is absent.`);
            this.skip();
        }
        await plugin(async (p) => {
            p.settings.enableSnippets = true;
            p.settings.snippetBundled = true;
            await p.saveSettings();
        });
        expect((await plugin((p) => p.exportNeovimConfigFile())).status).toBe(
            'written',
        );

        // The lua/ directory has to exist before Neovim scans runtimepath.
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();

        const loaded = await plugin((p) =>
            p.requestNeovim('nvim_exec_lua', [
                `package.loaded['vim_motions'] = nil
local ok, err = pcall(require, 'vim_motions')
return ok and '' or tostring(err)`,
                [],
            ]),
        );
        expect(loaded).toBe('');

        await plugin((p) =>
            p.requestNeovim('nvim_buf_set_lines', [0, 0, -1, true, ['']]),
        );
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const contentDOM = (
                view?.editor as unknown as { cm?: { contentDOM?: HTMLElement } }
            )?.cm?.contentDOM;
            contentDOM?.focus();
        });
        await browser.keys(['i', 'd', 'a', 't', 'e', 'Tab']);
        await browser.waitUntil(
            async () =>
                /^\d{4}-\d{2}-\d{2}$/.test(
                    (
                        (await plugin((p) =>
                            p.requestNeovim('nvim_buf_get_lines', [
                                0,
                                0,
                                -1,
                                true,
                            ]),
                        )) as string[]
                    )[0] ?? '',
                ),
            {
                timeout: 8000,
                interval: 200,
                timeoutMsg: 'the snippet never expanded in Neovim',
            },
        );
        const lines = (await plugin((p) =>
            p.requestNeovim('nvim_buf_get_lines', [0, 0, -1, true]),
        )) as string[];
        expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(lines[0]).not.toContain('CURRENT_YEAR');
    });

    it('reports staleness only after a covered setting changes', async () => {
        await plugin((p) => p.exportNeovimConfigFile());
        expect(await plugin((p) => p.isNeovimConfigExportStale())).toBe(false);
        await plugin(async (p) => {
            p.settings.enableFlash = !p.settings.enableFlash;
            await p.saveSettings();
        });
        expect(await plugin((p) => p.isNeovimConfigExportStale())).toBe(true);
    });
});
