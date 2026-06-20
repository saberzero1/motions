import { NeovimClient } from './client';
import { setupEditor, vimRawKeys } from '../helpers';
import { compareStates, getObsidianState, getNeovimState } from './compare';
import { findGoldenCase } from './golden';
import { isKnownDeviation } from './deviations';

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
        await vimRawKeys(config.keys.join(''));

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
