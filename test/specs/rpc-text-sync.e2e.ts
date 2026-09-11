import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getNotices,
    loadSingleFileWorkspace,
    loadTwoFileWorkspace,
    setupEditor,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

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

interface ByteComparison {
    cm: number[];
    raw: number[];
}

interface BufferIdentity {
    filetype: string;
    buftype: string;
    name: string;
}

interface ActiveDocumentSnapshot {
    path: string | null;
    cm: string | null;
    nvim: string;
}

const spawnedPids = new Set<number>();
const encoder = new TextEncoder();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function byteBoundaries(text: string): number[] {
    const result = [0];
    let offset = 0;
    for (const character of text) {
        offset += encoder.encode(character).length;
        result.push(offset);
    }
    return result;
}

function requireByteBoundary(text: string, offset: number): void {
    if (!byteBoundaries(text).includes(offset))
        throw new Error(
            `Interior UTF-8 endpoint ${offset} in ${JSON.stringify(text)}`,
        );
}

function byteOffsetToUtf16(text: string, offset: number): number {
    requireByteBoundary(text, offset);
    let bytes = 0;
    let utf16 = 0;
    for (const character of text) {
        if (bytes === offset) return utf16;
        bytes += encoder.encode(character).length;
        utf16 += character.length;
    }
    return utf16;
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, nextConfigPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = nextConfigPath;
            plugin.settings.neovimRpcEnabled = nextEnabled;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function ensureVimEnabled(): Promise<void> {
    const enabled = await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { settings: { vimEnabled: boolean } }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.settings.vimEnabled ?? false;
    });
    if (enabled) return;
    await browser.executeObsidian(({ app }) => {
        const commands = app as unknown as {
            commands: { executeCommandById(commandId: string): boolean };
        };
        if (
            !commands.commands.executeCommandById('vim-motions:enable-vim-mode')
        )
            throw new Error('Enable Vim command not found');
    });
    await browser.waitUntil(
        async () =>
            browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: { vimEnabled: boolean } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.settings.vimEnabled ?? false;
            }),
        { timeout: 5000, interval: 100 },
    );
}

async function getRpcState(): Promise<RpcState> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.getNeovimConnectionState();
    })) as RpcState;
}

async function waitForConnected(): Promise<void> {
    try {
        await browser.waitUntil(async () => (await getRpcState()).connected, {
            timeout: 10000,
            interval: 100,
            timeoutMsg: 'Neovim RPC did not connect',
        });
    } catch {
        const state = await getRpcState();
        throw new Error(
            `Neovim RPC did not connect: ${JSON.stringify(state)} ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getRpcState()).pid;
    if (pid !== null) spawnedPids.add(pid);
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

async function compareBytes(): Promise<ByteComparison> {
    await request('nvim_get_mode', []);
    return (await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
                workspace: {
                    activeEditor?: { editor?: { getValue(): string } };
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        const rawLines = (await plugin.requestNeovim('nvim_exec_lua', [
            'local out = {}; for _, line in ipairs(vim.api.nvim_buf_get_lines(0, 0, -1, true)) do out[#out + 1] = {string.byte(line, 1, -1)} end; return out',
            [],
        ])) as number[][];
        const value = (
            app as unknown as {
                workspace: {
                    activeEditor?: { editor?: { getValue(): string } };
                };
            }
        ).workspace.activeEditor?.editor?.getValue();
        if (value === undefined) throw new Error('No active editor');
        return {
            cm: Array.from(new TextEncoder().encode(value)),
            raw: rawLines.flatMap((line, index) =>
                index === rawLines.length - 1 ? line : [...line, 0x0a],
            ),
        };
    })) as ByteComparison;
}

async function expectByteExact(): Promise<void> {
    const comparison = await compareBytes();
    expect(comparison.cm).toEqual(comparison.raw);
}

async function replaceBuffer(lines: string[]): Promise<void> {
    await request('nvim_buf_set_lines', [0, 0, -1, true, lines]);
    await expectByteExact();
}

async function getBufferIdentity(): Promise<BufferIdentity> {
    const [filetype, buftype, name] = await Promise.all([
        request('nvim_get_option_value', ['filetype', { buf: 0 }]),
        request('nvim_get_option_value', ['buftype', { buf: 0 }]),
        request('nvim_buf_get_name', [0]),
    ]);
    return {
        filetype: String(filetype),
        buftype: String(buftype),
        name: String(name),
    };
}

async function expectMarkdownBufferIdentity(): Promise<void> {
    const identity = await getBufferIdentity();
    expect({
        filetype: identity.filetype,
        buftype: identity.buftype,
        namedMarkdownFile:
            identity.name.length > 0 && identity.name.endsWith('.md'),
    }).toEqual({
        filetype: 'markdown',
        buftype: 'acwrite',
        namedMarkdownFile: true,
    });
}

async function writeKnownFiles(
    firstPath: string,
    firstContent: string,
    secondPath: string,
    secondContent: string,
): Promise<void> {
    await browser.executeObsidian(
        async (
            { app },
            pathA: string,
            contentA: string,
            pathB: string,
            contentB: string,
        ) => {
            const first = app.vault.getFileByPath(pathA);
            const second = app.vault.getFileByPath(pathB);
            if (first) await app.vault.modify(first, contentA);
            else await app.vault.create(pathA, contentA);
            if (second) await app.vault.modify(second, contentB);
            else await app.vault.create(pathB, contentB);
        },
        firstPath,
        firstContent,
        secondPath,
        secondContent,
    );
}

async function activateFile(path: string): Promise<void> {
    await browser.executeObsidian(({ app }, targetPath: string) => {
        const leaf = app.workspace
            .getLeavesOfType('markdown')
            .find(
                (candidate) => candidate.view.getState()?.file === targetPath,
            );
        if (!leaf) throw new Error(`No Markdown leaf for ${targetPath}`);
        app.workspace.setActiveLeaf(leaf, { focus: true });
    }, path);
    await browser.waitUntil(
        async () => {
            const [activePath, identity] = await Promise.all([
                browser.executeObsidian(
                    ({ app }) => app.workspace.getActiveFile()?.path ?? null,
                ),
                getBufferIdentity(),
            ]);
            return activePath === path && identity.name.endsWith(path);
        },
        {
            timeout: 5000,
            interval: 50,
            timeoutMsg: `Neovim buffer did not activate ${path}`,
        },
    );
    await request('nvim_get_mode', []);
}

async function getActiveDocumentSnapshot(): Promise<ActiveDocumentSnapshot> {
    const nvimLines = (await request('nvim_buf_get_lines', [
        0,
        0,
        -1,
        true,
    ])) as string[];
    const host = (await browser.executeObsidian(({ app }) => ({
        path: app.workspace.getActiveFile()?.path ?? null,
        cm: app.workspace.activeEditor?.editor?.getValue() ?? null,
    }))) as Pick<ActiveDocumentSnapshot, 'path' | 'cm'>;
    return { ...host, nvim: nvimLines.join('\n') };
}

async function readDiskFiles(
    firstPath: string,
    secondPath: string,
): Promise<{ first: string; second: string }> {
    return (await browser.executeObsidian(
        async ({ app }, pathA: string, pathB: string) => ({
            first: await app.vault.adapter.read(pathA),
            second: await app.vault.adapter.read(pathB),
        }),
        firstPath,
        secondPath,
    )) as { first: string; second: string };
}

describe('Neovim RPC text synchronisation', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await ensureVimEnabled();
        await loadSingleFileWorkspace();
        await setupEditor('rpc text sync', { line: 0, ch: 0 });
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        });
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('uses a named acwrite Markdown buffer instead of the intro buffer', async () => {
        await expectMarkdownBufferIdentity();
    });

    it('loads the pinned Neovim test configuration', async () => {
        const marker = await request('nvim_exec_lua', [
            'return vim.g.vim_motions_test_config',
            [],
        ]);
        expect(marker).toBe(true);
    });

    it('seeds every activated note without overwriting another note', async () => {
        const firstPath = 'Welcome.md';
        const secondPath = 'Target.md';
        const firstContent = 'A original\nA second line';
        const secondContent = 'B original\nB second line';
        const editedFirstContent = `rpc-${firstContent}`;

        await setRpcEnabled(false);
        await writeKnownFiles(
            firstPath,
            firstContent,
            secondPath,
            secondContent,
        );
        await loadTwoFileWorkspace(firstPath, secondPath, 'first');
        await setRpcEnabled(true);
        await waitForConnected();
        await activateFile(firstPath);

        await activateFile(secondPath);
        const secondInitial = await getActiveDocumentSnapshot();
        await expectByteExact();

        await activateFile(firstPath);
        const firstReturn = await getActiveDocumentSnapshot();
        await expectByteExact();

        await request('nvim_win_set_cursor', [0, [1, 0]]);
        await browser.keys(['i', 'r', 'p', 'c', '-', 'Escape']);
        await request('nvim_get_mode', []);
        const firstEdited = await getActiveDocumentSnapshot();

        await activateFile(secondPath);
        const secondUntouched = await getActiveDocumentSnapshot();
        await activateFile(firstPath);
        const firstRetained = await getActiveDocumentSnapshot();
        await expectByteExact();

        await browser.pause(2500);
        const disk = await readDiskFiles(firstPath, secondPath);
        expect({
            secondInitial,
            firstReturn,
            firstEdited,
            secondUntouched,
            firstRetained,
            disk,
        }).toEqual({
            secondInitial: {
                path: secondPath,
                cm: secondContent,
                nvim: secondContent,
            },
            firstReturn: {
                path: firstPath,
                cm: firstContent,
                nvim: firstContent,
            },
            firstEdited: {
                path: firstPath,
                cm: editedFirstContent,
                nvim: editedFirstContent,
            },
            secondUntouched: {
                path: secondPath,
                cm: secondContent,
                nvim: secondContent,
            },
            firstRetained: {
                path: firstPath,
                cm: editedFirstContent,
                nvim: editedFirstContent,
            },
            disk: {
                first: editedFirstContent,
                second: secondContent,
            },
        });
    });

    it('stays byte-exact through 210 boundary-valid line and text operations', async () => {
        const variants = [
            'ASCII alpha beta',
            'é→𝄞界\tZ',
            'e\u0301 👩‍❤️‍💋‍👨 combining',
        ];
        const lines = [...variants];
        await replaceBuffer(lines);

        for (let index = 0; index < 210; index++) {
            const lineIndex = index % lines.length;
            if (index % 2 === 0) {
                const replacement = `${variants[index % variants.length]} ${index}`;
                await request('nvim_buf_set_lines', [
                    0,
                    lineIndex,
                    lineIndex + 1,
                    true,
                    [replacement],
                ]);
                lines[lineIndex] = replacement;
            } else {
                const line = lines[lineIndex]!;
                const boundaries = byteBoundaries(line);
                const start = boundaries[1]!;
                const end = boundaries[Math.min(2, boundaries.length - 1)]!;
                requireByteBoundary(line, start);
                requireByteBoundary(line, end);
                const replacement = variants[index % variants.length]![0]!;
                await request('nvim_buf_set_text', [
                    0,
                    lineIndex,
                    start,
                    lineIndex,
                    end,
                    [replacement],
                ]);
                lines[lineIndex] =
                    line.slice(0, byteOffsetToUtf16(line, start)) +
                    replacement +
                    line.slice(byteOffsetToUtf16(line, end));
            }
            await expectByteExact();
        }
    });

    it('applies cross-line collapses with non-empty replacement text byte-exactly', async () => {
        await replaceBuffer(['abc', 'def']);
        requireByteBoundary('abc', 3);
        requireByteBoundary('def', 0);
        await request('nvim_buf_set_text', [0, 0, 3, 1, 0, ['X']]);
        await expectByteExact();

        await replaceBuffer(['éA', '界B']);
        requireByteBoundary('éA', 2);
        requireByteBoundary('界B', 3);
        await request('nvim_buf_set_text', [0, 0, 2, 1, 3, ['𝄞']]);
        await expectByteExact();

        await replaceBuffer(['keep', 'left', 'middle', 'right']);
        requireByteBoundary('left', 1);
        requireByteBoundary('right', 1);
        await request('nvim_buf_set_text', [0, 1, 1, 3, 1, ['界']]);
        await expectByteExact();
    });

    it('handles end deletion, start deletion, and insertion after the last line', async () => {
        await replaceBuffer(['one', 'two', 'three']);
        await request('nvim_buf_set_lines', [0, 2, 3, true, []]);
        await expectByteExact();

        await request('nvim_buf_set_lines', [0, 0, 1, true, []]);
        await expectByteExact();

        await request('nvim_buf_set_lines', [0, 1, 1, true, ['界 tail']]);
        await expectByteExact();
    });

    it('documents divergence for an endpoint inside a UTF-8 sequence', async () => {
        await replaceBuffer(['éX']);
        await request('nvim_buf_set_text', [0, 0, 1, 0, 1, ['q']]);
        const comparison = await compareBytes();
        const decoded = (await request('nvim_buf_get_lines', [
            0,
            0,
            -1,
            true,
        ])) as string[];
        const decodedBytes = Array.from(encoder.encode(decoded.join('\n')));
        expect(comparison.cm).not.toEqual(comparison.raw);
        expect(comparison.cm).toEqual(decodedBytes);
    });
});
