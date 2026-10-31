import { browser, expect } from '@wdio/globals';
import { loadSingleFileWorkspace, setupEditor } from '../helpers';

// A window command right after a split, under the bundled engine. The split
// activates its new pane at once and loads the note into it afterwards, and
// the finished load focuses that pane. A move made during the load was undone
// by it: <C-w>v<C-w>h ended in the new pane 4 of 4 times, from keys sent
// together and from a mapping.

interface Outcome {
    original: string;
    active: string;
    panes: number;
}

/** Sends `keys` to the active editor in one task, as a mapping does. */
async function sendTogether(keys: string[]): Promise<string> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, sequence: string[]) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: { handleKey(cm: unknown, key: string): void };
                    };
                }
            ).CodeMirrorAdapter.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const adapter = (view?.editor as unknown as { cm: { cm: unknown } })
                .cm.cm;
            const original = (
                app.workspace.getMostRecentLeaf() as unknown as { id: string }
            ).id;
            for (const key of sequence) Vim.handleKey(adapter, key);
            return original;
        },
        keys,
    )) as string;
}

/** Waits for every pane to finish loading, then reports where focus is. */
async function settle(original: string, panes: number): Promise<Outcome> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }, count: number) => {
                const leaves = app.workspace.getLeavesOfType('markdown');
                return (
                    leaves.length === count &&
                    leaves.every((leaf) => !leaf.working && !leaf.isDeferred)
                );
            }, panes)) as boolean,
        { timeout: 5000, interval: 50 },
    );
    // Past the 25 ms poll that runs a queued action.
    await browser.pause(300);
    return (await browser.executeObsidian(({ app }, originalId: string) => {
        const active = (
            app.workspace.getMostRecentLeaf() as unknown as { id: string }
        ).id;
        return {
            original: originalId,
            active,
            panes: app.workspace.getLeavesOfType('markdown').length,
        };
    }, original)) as Outcome;
}

describe('A window command right after a split', function () {
    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await setupEditor('alpha\nbeta', { line: 0, ch: 0 });
    });

    it('<C-w>v<C-w>h sent together returns to the original pane', async () => {
        const original = await sendTogether(['<C-w>', 'v', '<C-w>', 'h']);
        const outcome = await settle(original, 2);
        expect(outcome.active).toBe(outcome.original);
    });

    it('a mapping that splits and moves returns to the original pane', async () => {
        const original = await browser.executeObsidian(({ app }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: {
                            map(lhs: string, rhs: string, ctx: string): void;
                        };
                    };
                }
            ).CodeMirrorAdapter.Vim;
            Vim.map('<F7>', '<C-w>v<C-w>h', 'normal');
            return (
                app.workspace.getMostRecentLeaf() as unknown as { id: string }
            ).id;
        });
        try {
            await browser.keys(['F7']);
            const outcome = await settle(original as string, 2);
            expect(outcome.active).toBe(outcome.original);
        } finally {
            await browser.executeObsidian(() => {
                (
                    window as unknown as {
                        CodeMirrorAdapter: {
                            Vim: { unmap(lhs: string, ctx: string): void };
                        };
                    }
                ).CodeMirrorAdapter.Vim.unmap('<F7>', 'normal');
            });
        }
    });

    it('<C-w>s<C-w>k sent together returns to the original pane', async () => {
        const original = await sendTogether(['<C-w>', 's', '<C-w>', 'k']);
        const outcome = await settle(original, 2);
        expect(outcome.active).toBe(outcome.original);
    });

    it('keeps the order of the window commands that waited', async () => {
        const original = await sendTogether([
            '<C-w>',
            'v',
            '<C-w>',
            'h',
            '<C-w>',
            'l',
        ]);
        const outcome = await settle(original, 2);
        expect({
            panes: outcome.panes,
            onOriginal: outcome.active === original,
        }).toEqual({ panes: 2, onOriginal: false });
    });

    // With nothing loading, a window command still acts at once.
    it('moves at once when no pane is loading', async () => {
        const original = await sendTogether(['<C-w>', 'v']);
        await settle(original, 2);
        const moved = await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter: {
                        Vim: { handleKey(cm: unknown, key: string): void };
                    };
                }
            ).CodeMirrorAdapter.Vim;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const adapter = (view?.editor as unknown as { cm: { cm: unknown } })
                .cm.cm;
            const before = (
                app.workspace.getMostRecentLeaf() as unknown as { id: string }
            ).id;
            Vim.handleKey(adapter, '<C-w>');
            Vim.handleKey(adapter, 'h');
            const after = (
                app.workspace.getMostRecentLeaf() as unknown as { id: string }
            ).id;
            return { changedInTheSameTask: before !== after };
        });
        expect(moved).toEqual({ changedInTheSameTask: true });
    });
});
