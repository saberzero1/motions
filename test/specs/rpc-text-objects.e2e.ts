import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getCursorPos,
    getEditorValue,
    getNotices,
    getRegisterContent,
    getSelection,
    ensureSourceMode,
    loadSingleFileWorkspace,
    setupEditor,
    vimHandleKeysSync,
} from '../helpers';

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: Record<string, unknown>;
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

interface TextObjectCase {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    keys: string;
    operator: boolean;
    register: boolean;
    visual: boolean;
}

interface Snapshot {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    register?: string | null;
    selection?: string;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const spawnedPids = new Set<number>();

const objects = [
    {
        name: 'asterisk emphasis',
        inner: 'i*',
        around: 'a*',
        content: 'before **outer *inner* end** adjacent **next** after',
        cursor: { line: 0, ch: 18 },
    },
    {
        name: 'underscore emphasis',
        inner: 'i_',
        around: 'a_',
        content: 'before _one_ adjacent _two_ after',
        cursor: { line: 0, ch: 24 },
    },
    {
        name: 'inline code',
        inner: 'i`',
        around: 'a`',
        content: 'before `one` adjacent `two` after',
        cursor: { line: 0, ch: 24 },
    },
    {
        name: 'math',
        inner: 'i$',
        around: 'a$',
        content: 'before $one$ adjacent $$two + three$$ after',
        cursor: { line: 0, ch: 29 },
    },
    {
        name: 'strikethrough',
        inner: 'i~',
        around: 'a~',
        content: 'before ~~one~~ adjacent ~~two~~ after',
        cursor: { line: 0, ch: 27 },
    },
    {
        name: 'Markdown link',
        inner: 'il',
        around: 'al',
        content: 'before [one](first) adjacent [two](second) after',
        cursor: { line: 0, ch: 31 },
    },
    {
        name: 'wikilink through link object',
        inner: 'il',
        around: 'al',
        content: 'before [[one]] adjacent [[two|alias]] after',
        cursor: { line: 0, ch: 29 },
    },
    {
        name: 'code fence',
        inner: 'iC',
        around: 'aC',
        content: 'before\n```ts\nconst one = 1;\nconst two = 2;\n```\nafter',
        cursor: { line: 2, ch: 8 },
    },
    {
        name: 'nested blockquote',
        inner: 'iB',
        around: 'aB',
        content: '> outer\n>> nested one\n>> nested two\n> outer after',
        cursor: { line: 1, ch: 5 },
    },
    {
        name: 'callout',
        inner: 'io',
        around: 'ao',
        content: 'before\n> [!note] Title\n> first line\n> second line\nafter',
        cursor: { line: 2, ch: 5 },
    },
    {
        name: 'HTML tag',
        inner: 'it',
        around: 'at',
        content: 'before <div>outer <span>inner</span> end</div> after',
        cursor: { line: 0, ch: 25 },
    },
    {
        name: 'table cell',
        inner: 'i|',
        around: 'a|',
        content: '| one | two | three |\n| --- | --- | --- |\n| a | b | c |',
        cursor: { line: 0, ch: 9 },
    },
    {
        name: 'table row',
        inner: 'ir',
        around: 'ar',
        content: '| one | two | three |\n| --- | --- | --- |\n| a | b | c |',
        cursor: { line: 2, ch: 7 },
    },
] as const;

const cases: TextObjectCase[] = objects.flatMap((object) => [
    {
        ...object,
        name: `${object.name}: delete inner`,
        keys: `d${object.inner}`,
        operator: true,
        register: false,
        visual: false,
    },
    {
        ...object,
        name: `${object.name}: change around`,
        keys: `c${object.around}`,
        operator: true,
        register: false,
        visual: false,
    },
    {
        ...object,
        name: `${object.name}: yank inner`,
        keys: `y${object.inner}`,
        operator: true,
        register: true,
        visual: false,
    },
    {
        ...object,
        name: `${object.name}: visual around`,
        keys: `v${object.around}`,
        operator: false,
        register: false,
        visual: true,
    },
    {
        ...object,
        name: `${object.name}: counted delete inner`,
        keys: `d2${object.inner}`,
        operator: true,
        register: false,
        visual: false,
    },
]);

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
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

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, next: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            Object.assign(plugin.settings, {
                enableTableNav: false,
                neovimBinaryPath: '',
                neovimConfigPath: configPath,
                neovimRpcEnabled: next,
                tableWidgetMode: 'raw',
            });
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function waitForRpc(connected: boolean): Promise<void> {
    try {
        await browser.waitUntil(
            async () => (await getRpcState()).connected === connected,
            {
                timeout: 10000,
                interval: 100,
                timeoutMsg: `Neovim RPC did not become ${connected ? 'connected' : 'disconnected'}`,
            },
        );
    } catch {
        throw new Error(
            `Neovim RPC did not become ${connected ? 'connected' : 'disconnected'}: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getRpcState()).pid;
    if (connected && pid !== null) spawnedPids.add(pid);
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

async function forkSnapshot(testCase: TextObjectCase): Promise<Snapshot> {
    await setupEditor(testCase.content, testCase.cursor);
    await vimHandleKeysSync(testCase.keys);
    return {
        name: testCase.name,
        content: await getEditorValue(),
        cursor: await getCursorPos(),
        register: testCase.register
            ? ((await getRegisterContent('"'))?.text ?? null)
            : undefined,
        selection: testCase.visual ? await getSelection() : undefined,
    };
}

async function rpcSnapshot(testCase: TextObjectCase): Promise<Snapshot> {
    await request('nvim_input', ['<Esc>']);
    await request('nvim_buf_set_lines', [
        0,
        0,
        -1,
        false,
        testCase.content.split('\n'),
    ]);
    const positionKeys = `zR${testCase.cursor.line + 1}G0${testCase.cursor.ch > 0 ? `${testCase.cursor.ch}l` : ''}`;
    await request('nvim_input', [`<Esc>${positionKeys}${testCase.keys}`]);
    const mode = (await request('nvim_get_mode', [])) as { mode: string };
    const lines = (await request('nvim_buf_get_lines', [
        0,
        0,
        -1,
        false,
    ])) as string[];
    const cursor = (await request('nvim_win_get_cursor', [0])) as [
        number,
        number,
    ];
    let selection: string | undefined;
    if (testCase.visual) {
        selection = (await request('nvim_exec_lua', [
            `local lines = vim.fn.getregion(vim.fn.getpos('v'), vim.fn.getpos('.'), { type = vim.fn.mode() })
             return table.concat(lines, '\\n')`,
            [],
        ])) as string;
        const line = lines[cursor[0] - 1] ?? '';
        const byte = line.charCodeAt(cursor[1]);
        cursor[1] += Number.isNaN(byte)
            ? 0
            : byte < 0x80
              ? 1
              : byte < 0xe0
                ? 2
                : byte < 0xf0
                  ? 3
                  : 4;
    } else if (mode.mode.startsWith('i')) {
        const hostCursor = await getCursorPos();
        cursor[0] = hostCursor.line + 1;
        cursor[1] = hostCursor.ch;
    }
    return {
        name: testCase.name,
        content: lines.join('\n'),
        cursor: { line: cursor[0] - 1, ch: cursor[1] },
        register: testCase.register
            ? ((await request('nvim_exec_lua', [
                  `return vim.fn.getreg('"')`,
                  [],
              ])) as string)
            : undefined,
        selection,
    };
}

async function readActiveFile(): Promise<string> {
    return browser.executeObsidian(async ({ app }) => {
        const file = app.workspace.getActiveFile();
        if (!file) throw new Error('No active file');
        app.commands.executeCommandById('editor:save-file');
        return app.vault.adapter.read(file.path);
    });
}

describe('Neovim RPC Markdown text objects', function () {
    this.timeout(900000);

    before(async () => {
        await loadSingleFileWorkspace();
        await ensureSourceMode();
        await setRpcEnabled(false);
        await waitForRpc(false);
    });

    after(async () => {
        await setRpcEnabled(false);
        await waitForRpc(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('matches the fork for operators, visual selections, registers, and counts', async () => {
        const fork: Snapshot[] = [];
        for (const testCase of cases) fork.push(await forkSnapshot(testCase));

        await setupEditor(cases[0]!.content, cases[0]!.cursor);
        await setRpcEnabled(true);
        await waitForRpc(true);
        const rpc: Snapshot[] = [];
        for (const testCase of cases) rpc.push(await rpcSnapshot(testCase));

        expect(rpc).toEqual(fork);
        expect(
            cases
                .map((testCase, index) => ({ testCase, index }))
                .filter(({ testCase }) => testCase.operator)
                .map(({ index }) => ({
                    name: cases[index]!.name,
                    forkEmpty: fork[index]!.content === '',
                    rpcEmpty: rpc[index]!.content === '',
                })),
        ).toEqual(
            cases
                .map((testCase, index) => ({ testCase, index }))
                .filter(({ testCase }) => testCase.operator)
                .map(({ index }) => ({
                    name: cases[index]!.name,
                    forkEmpty: fork[index]!.content === '',
                    rpcEmpty: fork[index]!.content === '',
                })),
        );

        const diskCase = cases.find(
            (testCase) => testCase.name === 'code fence: delete inner',
        )!;
        const diskResult = await rpcSnapshot(diskCase);
        await browser.waitUntil(
            async () => (await readActiveFile()) === diskResult.content,
            { timeout: 30000, interval: 100 },
        );
        expect(await readActiveFile()).toBe(diskResult.content);
    });
});
