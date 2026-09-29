import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { obsidianPage } from 'wdio-obsidian-service';
import { getNotices, loadSingleFileWorkspace, setupEditor } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

// Fold state as the user meets it: whatever the production activation path
// leaves behind. Nothing here sets `foldlevel`, `foldmethod`, `foldexpr` or
// `foldenable`, and nothing runs `zR` before measuring. `rpc-folds-undo`
// deliberately does all four in its `resetBuffer()` so it can measure the
// mirror in isolation, and that override is exactly what hid #199: the window
// was activated with `foldlevel=0`, every heading fold in the focused pane was
// closed on arrival, and the spec re-opened them before looking.
//
// The other half of the reported symptom needs no separate cause. Folds are
// window-local in CM6 and `NeovimDecorationBridge.clearView()` unfolds the
// pane it is leaving, so moving focus away from an all-closed pane looks like
// `zR` on the pane you left.
//
// Both properties modes matter and only one was covered. Every other RPC spec
// sets `propertiesInDocument` to `source`, which takes the branch that already
// worked; Obsidian's default is `visible`, which is the branch that did not.

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

interface FoldLine {
    level: number;
    closed: number;
    closedEnd: number;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const spawnedPids = new Set<number>();

// Two top-level headings so "one fold closed" and "every fold closed" are
// different measurements, and a nested heading so the level ladder is visible.
const HEADING_FIXTURE = [
    '# One',
    'one a',
    'one b',
    '',
    '## Child',
    'child',
    '# Two',
    'two',
].join('\n');

const FRONTMATTER_FIXTURE = [
    '---',
    'tag: alpha',
    '---',
    '# One',
    'one a',
    '## Child',
    'child',
].join('\n');

const SECOND_PANE_FIXTURE = [
    '# Alpha',
    'alpha body',
    '## Beta',
    'beta body',
    '# Gamma',
    'gamma body',
].join('\n');

const SECOND_FRONTMATTER_FIXTURE = [
    '---',
    'tag: beta',
    '---',
    '# Alpha',
    'alpha body',
].join('\n');

// What a user's own Neovim config does. `g:markdown_folding` in the stock
// Markdown ftplugin and a treesitter `foldexpr` in a personal ftplugin both
// reach the window through a `FileType` handler, and `filetype detect` re-fires
// them on every activation. A constant `0` stands in for both so the effect is
// unambiguous and no parser has to be installed on the test machine.
const CLOBBER_FOLDEXPR_LUA = `vim.api.nvim_create_autocmd("FileType", {
    pattern = "markdown",
    callback = function()
        vim.api.nvim_set_option_value("foldmethod", "expr", { win = 0 })
        vim.api.nvim_set_option_value("foldexpr", "0", { win = 0 })
    end,
})`;

const FOLD_LINES_LUA = `local out = {}
for lnum = 1, vim.api.nvim_buf_line_count(0) do
    out[#out + 1] = {
        level = vim.fn.foldlevel(lnum),
        closed = vim.fn.foldclosed(lnum),
        closed_end = vim.fn.foldclosedend(lnum),
    }
end
return out`;

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function request(method: string, args: unknown[]): Promise<unknown> {
    return browser.executeObsidian(
        async ({ app }, rpcMethod: string, rpcArgs: unknown[]) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            return plugin.requestNeovim(rpcMethod, rpcArgs);
        },
        method,
        args,
    );
}

async function setPropertiesMode(mode: 'visible' | 'source'): Promise<void> {
    await browser.executeObsidian(({ app }, value: string) => {
        (
            app.vault as unknown as {
                setConfig(key: string, nextValue: unknown): void;
            }
        ).setConfig('propertiesInDocument', value);
    }, mode);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                ({ app }) =>
                    (
                        app.vault as unknown as {
                            getConfig(key: string): unknown;
                        }
                    ).getConfig('propertiesInDocument') as string,
            )) === mode,
        {
            timeout: 5000,
            interval: 50,
            timeoutMsg: `propertiesInDocument never became "${mode}"`,
        },
    );
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, next: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = configPath;
            plugin.settings.neovimRpcEnabled = next;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function getRpcState(): Promise<RpcState> {
    return browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.getNeovimConnectionState();
    });
}

async function waitForConnected(): Promise<void> {
    try {
        await browser.waitUntil(async () => (await getRpcState()).connected, {
            timeout: 15000,
            interval: 100,
            timeoutMsg: 'Neovim RPC did not connect',
        });
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getRpcState()).pid;
    if (pid !== null) spawnedPids.add(pid);
}

async function waitForMirror(content: string): Promise<void> {
    await browser.waitUntil(
        async () =>
            (
                (await request('nvim_buf_get_lines', [
                    0,
                    0,
                    -1,
                    true,
                ])) as string[]
            ).join('\n') === content,
        {
            timeout: 10000,
            interval: 50,
            timeoutMsg: 'Neovim never mirrored the editor content',
        },
    );
}

async function foldLines(): Promise<FoldLine[]> {
    const raw = (await request('nvim_exec_lua', [FOLD_LINES_LUA, []])) as {
        level: number;
        closed: number;
        closed_end: number;
    }[];
    return raw.map((line) => ({
        level: line.level,
        closed: line.closed,
        closedEnd: line.closed_end,
    }));
}

async function renderedFoldCount(): Promise<number> {
    return browser.executeObsidian(
        () => document.querySelectorAll('.cm-foldPlaceholder').length,
    );
}

async function input(keys: string): Promise<void> {
    await request('nvim_input', [keys]);
    await request('nvim_get_mode', []);
}

// Two visible panes rather than two tabs: an inactive tab renders no editor, so
// only a split can show whether the pane losing focus keeps its fold state.
async function loadTwoPaneWorkspace(): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'fold-main',
            type: 'split',
            children: [
                {
                    id: 'fold-tabs-left',
                    type: 'tabs',
                    children: [
                        {
                            id: 'fold-leaf-left',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: 'Welcome.md', mode: 'source' },
                            },
                        },
                    ],
                },
                {
                    id: 'fold-tabs-right',
                    type: 'tabs',
                    children: [
                        {
                            id: 'fold-leaf-right',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: 'Target.md', mode: 'source' },
                            },
                        },
                    ],
                },
            ],
            direction: 'horizontal',
        },
        active: 'fold-leaf-right',
        lastOpenFiles: [],
    });
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                ({ app }) => app.workspace.getLeavesOfType('markdown').length,
            )) === 2,
        {
            timeout: 10000,
            interval: 100,
            timeoutMsg: 'the two-pane workspace never materialised',
        },
    );
}

async function focusPane(file: 'Welcome.md' | 'Target.md'): Promise<void> {
    await browser.executeObsidian(async ({ app, obsidian }, path: string) => {
        const leaf = app.workspace
            .getLeavesOfType('markdown')
            .find(
                (candidate) =>
                    candidate.view instanceof obsidian.MarkdownView &&
                    candidate.view.file?.path === path,
            );
        if (!leaf) throw new Error(`No markdown leaf for ${path}`);
        await app.workspace.setActiveLeaf(leaf, { focus: true });
        (
            leaf.view as InstanceType<typeof obsidian.MarkdownView>
        ).editor.focus();
    }, file);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                ({ app, obsidian }) =>
                    app.workspace.getActiveViewOfType(obsidian.MarkdownView)
                        ?.file?.path ?? null,
            )) === file,
        {
            timeout: 10000,
            interval: 100,
            timeoutMsg: `${file} never became the active pane`,
        },
    );
}

// Addresses a named leaf rather than the active one: `setupEditor` re-focuses
// until it sees any focused CM6 editor, which with two visible panes can already
// be the other one, so seeding through it left the mirror on the wrong pane.
async function setPaneContent(
    file: 'Welcome.md' | 'Target.md',
    content: string,
): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, path: string, text: string) => {
            const leaf = app.workspace
                .getLeavesOfType('markdown')
                .find(
                    (candidate) =>
                        candidate.view instanceof obsidian.MarkdownView &&
                        candidate.view.file?.path === path,
                );
            if (!leaf) throw new Error(`No markdown leaf for ${path}`);
            (
                leaf.view as InstanceType<typeof obsidian.MarkdownView>
            ).editor.setValue(text);
        },
        file,
        content,
    );
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                ({ app, obsidian }, path: string) =>
                    app.workspace
                        .getLeavesOfType('markdown')
                        .map((candidate) => candidate.view)
                        .find(
                            (
                                view,
                            ): view is InstanceType<
                                typeof obsidian.MarkdownView
                            > =>
                                view instanceof obsidian.MarkdownView &&
                                view.file?.path === path,
                        )
                        ?.editor.getValue() ?? null,
                file,
            )) === content,
        {
            timeout: 5000,
            interval: 50,
            timeoutMsg: `${file} never took the fixture content`,
        },
    );
}

async function waitForPaneMirror(
    file: 'Welcome.md' | 'Target.md',
    content: string,
): Promise<void> {
    await browser.waitUntil(
        async () =>
            ((await request('nvim_buf_get_name', [0])) as string).endsWith(
                file,
            ) &&
            (
                (await request('nvim_buf_get_lines', [
                    0,
                    0,
                    -1,
                    true,
                ])) as string[]
            ).join('\n') === content,
        {
            timeout: 10000,
            interval: 50,
            timeoutMsg: `Neovim never settled on ${file}`,
        },
    );
}

// Neovim owns the text while connected, so a CM6 `setValue` does not travel
// upstream: the mirror is only reseeded by an activation. Every fixture is
// therefore placed in the editor before the connection opens, which is also the
// order a user meets -- the note is already open when Neovim starts.
async function connectWith(content: string, line: number): Promise<void> {
    await setupEditor(content, { line, ch: 0 });
    await setRpcEnabled(true);
    await waitForConnected();
    await waitForMirror(content);
}

describe('Neovim RPC fold state on pane focus', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        // NeovimFrontmatterFold caches the resolved mode and reapplies nothing
        // once it matches, so the mode has to be in place for the activation
        // that installs the window's fold options.
        await setPropertiesMode('visible');
        await setRpcEnabled(false);
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('activates a focused pane with every heading fold open (#199)', async () => {
        await connectWith(HEADING_FIXTURE, 0);
        const lines = await foldLines();
        // Folds have to exist for "nothing is closed" to mean anything: an
        // unset foldexpr reports level 0 everywhere and closes nothing either.
        expect(lines.map((line) => line.level)).toEqual([
            1, 1, 1, 1, 2, 2, 1, 1,
        ]);
        expect(lines.map((line) => line.closed)).toEqual([
            -1, -1, -1, -1, -1, -1, -1, -1,
        ]);
        expect(await renderedFoldCount()).toBe(0);
    });

    it('still closes the rendered frontmatter fold (#199)', async () => {
        await connectWith(FRONTMATTER_FIXTURE, 3);
        const lines = await foldLines();
        // Raising `foldlevel` far enough to open the headings would open this
        // too: Vim caps an expression fold at level 20, so the sentinel written
        // as 100 resolves to 20 and `foldlevel=99` unfolds the frontmatter,
        // handing Neovim's cursor the properties widget again.
        expect(lines[0]).toEqual({ level: 20, closed: 1, closedEnd: 3 });
        expect(lines.slice(3).map((line) => line.closed)).toEqual([
            -1, -1, -1, -1,
        ]);
    });

    it('closes only the fold the user asks for (#199)', async () => {
        await connectWith(HEADING_FIXTURE, 0);
        await input('zc');
        await browser.waitUntil(async () => (await renderedFoldCount()) === 1, {
            timeout: 10000,
            interval: 50,
            timeoutMsg: 'CM6 never rendered the single closed fold',
        });
        expect((await foldLines()).map((line) => line.closed)).toEqual([
            1, 1, 1, 1, 1, 1, -1, -1,
        ]);
    });

    it('leaves every pane unfolded as focus moves between them (#199)', async () => {
        await loadTwoPaneWorkspace();
        await setPaneContent('Welcome.md', HEADING_FIXTURE);
        await setPaneContent('Target.md', SECOND_PANE_FIXTURE);
        await focusPane('Welcome.md');
        await setRpcEnabled(true);
        await waitForConnected();

        await waitForPaneMirror('Welcome.md', HEADING_FIXTURE);
        expect((await foldLines()).map((line) => line.closed)).toEqual([
            -1, -1, -1, -1, -1, -1, -1, -1,
        ]);
        // Counts both panes: the one gaining focus must not arrive collapsed,
        // and the one losing it must not be left showing folds either.
        expect(await renderedFoldCount()).toBe(0);

        await focusPane('Target.md');
        await waitForPaneMirror('Target.md', SECOND_PANE_FIXTURE);
        expect((await foldLines()).map((line) => line.closed)).toEqual([
            -1, -1, -1, -1, -1, -1,
        ]);
        expect(await renderedFoldCount()).toBe(0);

        await focusPane('Welcome.md');
        await waitForPaneMirror('Welcome.md', HEADING_FIXTURE);
        expect((await foldLines()).map((line) => line.closed)).toEqual([
            -1, -1, -1, -1, -1, -1, -1, -1,
        ]);
        expect(await renderedFoldCount()).toBe(0);
    });

    it('keeps the frontmatter fold when a FileType handler overwrites the fold expression (#199)', async () => {
        await loadTwoPaneWorkspace();
        await setPaneContent('Welcome.md', FRONTMATTER_FIXTURE);
        await setPaneContent('Target.md', SECOND_FRONTMATTER_FIXTURE);
        await focusPane('Welcome.md');
        await setRpcEnabled(true);
        await waitForConnected();
        await waitForPaneMirror('Welcome.md', FRONTMATTER_FIXTURE);
        expect((await foldLines())[0]).toEqual({
            level: 20,
            closed: 1,
            closedEnd: 3,
        });

        await request('nvim_exec_lua', [CLOBBER_FOLDEXPR_LUA, []]);
        await focusPane('Target.md');
        await waitForPaneMirror('Target.md', SECOND_FRONTMATTER_FIXTURE);

        // `activateDocument()` runs `filetype detect`, which re-fires the
        // handler installed above. The connect-time fold expression is not
        // reinstated by anything else, so without a per-activation reapply the
        // frontmatter stops being folded from the second note onward and
        // Neovim's cursor regains the properties widget.
        const lines = await foldLines();
        expect(lines[0]).toEqual({ level: 20, closed: 1, closedEnd: 3 });
        expect(lines.map((line) => line.level)).toEqual([20, 20, 20, 1, 1]);
    });

    // Must stay green before and after the reapply: it is what stops the fix
    // from over-reaching into `foldlevel`, which no FileType handler touches.
    // Rewriting that one per activation would undo a user's own `zM` every time
    // they changed panes.
    it('leaves a user fold level alone across a pane switch (#199)', async () => {
        await loadTwoPaneWorkspace();
        await setPaneContent('Welcome.md', HEADING_FIXTURE);
        await setPaneContent('Target.md', SECOND_PANE_FIXTURE);
        await focusPane('Welcome.md');
        await setRpcEnabled(true);
        await waitForConnected();
        await waitForPaneMirror('Welcome.md', HEADING_FIXTURE);

        await input('zM');
        expect((await foldLines()).map((line) => line.closed)).toEqual([
            1, 1, 1, 1, 1, 1, 7, 7,
        ]);

        await focusPane('Target.md');
        await waitForPaneMirror('Target.md', SECOND_PANE_FIXTURE);
        await focusPane('Welcome.md');
        await waitForPaneMirror('Welcome.md', HEADING_FIXTURE);
        expect((await foldLines()).map((line) => line.closed)).toEqual([
            1, 1, 1, 1, 1, 1, 7, 7,
        ]);
    });
});
