import { browser } from '@wdio/globals';
import { NeovimClient } from './client';
import { setupEditor, vimRawKeys, PAUSE } from '../helpers';
import { compareStates, getObsidianState, getNeovimState } from './compare';
import { findGoldenCase } from './golden';
import { isKnownDeviation } from './deviations';

function findExColonIndex(keys: string): number {
    if (keys.startsWith(':')) return 0;
    const afterNewline = keys.indexOf('\n:');
    return afterNewline !== -1 ? afterNewline + 1 : -1;
}

function findSearchIndex(keys: string): number {
    if (keys.startsWith('/') || keys.startsWith('?')) return 0;
    const afterNewline = keys.indexOf('\n/');
    if (afterNewline !== -1) return afterNewline + 1;
    const afterNewlineQ = keys.indexOf('\n?');
    return afterNewlineQ !== -1 ? afterNewlineQ + 1 : -1;
}

async function dispatchVimKeys(keys: string): Promise<void> {
    const exIdx = findExColonIndex(keys);
    const exMatch =
        exIdx !== -1
            ? keys.substring(exIdx + 1).match(/^([^\n]+)\n(.*)$/s)
            : null;
    if (exMatch && exIdx !== -1) {
        const preKeys = keys.substring(0, exIdx);
        const exCmd = exMatch[1] ?? '';
        const postKeys = exMatch[2] ?? '';
        if (preKeys) {
            await vimRawKeys(preKeys);
        }
        await browser.executeObsidian(({ app, obsidian }, cmdStr: string) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            view.editor.focus();
            Vim.handleEx(adapter, cmdStr);
        }, exCmd);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        if (postKeys) {
            await dispatchVimKeys(postKeys);
        }
        return;
    }

    const searchIdx = findSearchIndex(keys);
    const searchNewline =
        searchIdx !== -1 ? keys.indexOf('\n', searchIdx + 1) : -1;
    if (searchIdx !== -1 && searchNewline !== -1) {
        const preKeys = keys.substring(0, searchIdx);
        const searchKeys = keys.substring(searchIdx, searchNewline + 1);
        const postKeys = keys.substring(searchNewline + 1);
        if (preKeys) {
            await vimRawKeys(preKeys);
        }
        await vimRawKeys(searchKeys);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        if (postKeys) {
            await vimRawKeys(postKeys);
        }
        return;
    }

    await vimRawKeys(keys);
}

let nvimClient: NeovimClient | null = null;

export async function startNvim(): Promise<void> {
    if (process.env.NEOVIM_COMPARE !== '1') return;
    nvimClient = new NeovimClient();
    await nvimClient.start();
}

export async function stopNvim(): Promise<void> {
    if (nvimClient) {
        await nvimClient.stop();
        nvimClient = null;
    }
}

export function testWithNeovim(
    suiteName: string,
    name: string,
    config: {
        content: string;
        cursor: { line: number; ch: number };
        keys: string[];
    },
): void {
    it(`[nvim] ${name}`, async function () {
        await setupEditor(config.content, config.cursor);
        for (const segment of config.keys) {
            await dispatchVimKeys(segment);
            await browser.pause(PAUSE.KEY_GAP);
        }

        if (process.env.NEOVIM_COMPARE === '1' && nvimClient) {
            await nvimClient.setContent(config.content);
            await nvimClient.setCursor(config.cursor.line, config.cursor.ch);
            for (const key of config.keys) {
                await nvimClient.input(key);
            }

            const obsState = await getObsidianState();
            const nvimState = await getNeovimState(nvimClient);
            const result = compareStates(obsState, nvimState);

            if (!result.match && !isKnownDeviation(name)) {
                throw new Error(
                    `Neovim mismatch:\n` +
                        `  Obsidian: ${JSON.stringify(result.obsidian)}\n` +
                        `  Neovim:   ${JSON.stringify(result.neovim)}\n` +
                        `  Diffs:    ${result.diffs.join(', ')}`,
                );
            }
        } else if (!isKnownDeviation(name)) {
            const golden = findGoldenCase(suiteName, name);
            if (golden) {
                const obsState = await getObsidianState();
                if (obsState.content !== golden.result.content) {
                    throw new Error(
                        `Golden mismatch (content):\n` +
                            `  Obsidian: ${JSON.stringify(obsState.content)}\n` +
                            `  Golden:   ${JSON.stringify(golden.result.content)}`,
                    );
                }
                if (
                    obsState.cursor.line !== golden.result.cursor.line ||
                    obsState.cursor.ch !== golden.result.cursor.ch
                ) {
                    throw new Error(
                        `Golden mismatch (cursor):\n` +
                            `  Obsidian: ${JSON.stringify(obsState.cursor)}\n` +
                            `  Golden:   ${JSON.stringify(golden.result.cursor)}`,
                    );
                }
            }
        }
    });
}
