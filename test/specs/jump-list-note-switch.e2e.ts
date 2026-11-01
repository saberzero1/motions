import { browser, expect } from '@wdio/globals';
import { handleEx, loadSingleFileWorkspace, PAUSE } from '../helpers';

// A change of the active note is a jump (#206). Neovim records a buffer
// switch: with `a`, `b` and `c` visited by `:b`, `<C-o>` lands on `b`, again
// on `a`, and `<C-i>` back on `b`; `:b b` from line 4 of `a`, then `<C-o>`,
// lands on line 4 of `a` (measured, 0.12.5). Tabs here are the buffers `:b`
// and `]b` move between, but a tab clicked or reached with Ctrl+Tab recorded
// nothing, so `<C-o>` went to an older entry instead.

const NOTES: Record<string, string> = {
    'JumpA.md': 'a1\na2\na3\na4\nsee [[JumpC]]',
    'JumpB.md': 'b1\nb2\n## Bee heading',
    'JumpC.md': 'c1\nc2',
};

interface Where {
    file: string | null;
    line: number;
    leaf: string | null;
    leaves: number;
}

/** Three tabs, one note each, and an empty jump list. */
async function openThreeTabs(): Promise<void> {
    await loadSingleFileWorkspace();
    await browser.executeObsidian(async ({ app }, paths: string[]) => {
        const first = app.vault.getFileByPath(paths[0] as string);
        if (first) await app.workspace.getLeaf(false).openFile(first);
        for (const path of paths.slice(1)) {
            const file = app.vault.getFileByPath(path);
            if (file) await app.workspace.getLeaf('tab').openFile(file);
        }
    }, Object.keys(NOTES));
    await switchTo('JumpA.md');
    await browser.executeObsidian(({ app }) => {
        (
            app as unknown as {
                plugins: {
                    plugins: Record<string, { jumpList: { clear(): void } }>;
                };
            }
        ).plugins.plugins['vim-motions']?.jumpList.clear();
    });
}

/** What a click on the note's tab does. */
async function switchTo(path: string): Promise<void> {
    await browser.executeObsidian(({ app }, target: string) => {
        app.workspace.iterateAllLeaves((leaf) => {
            const file = (leaf.view as { file?: { path: string } }).file;
            if (file?.path === target) {
                app.workspace.setActiveLeaf(leaf, { focus: true });
            }
        });
    }, path);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function setLine(line: number): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, target: number) => {
        app.workspace
            .getActiveViewOfType(obsidian.MarkdownView)
            ?.editor.setCursor({ line: target, ch: 0 });
    }, line);
    await browser.pause(100);
}

async function sendKeys(...keys: string[]): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, sequence: string[]) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: { handleKey(cm: unknown, key: string): void };
                };
            }
        ).CodeMirrorAdapter.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const adapter = (view?.editor as unknown as { cm: { cm: unknown } }).cm
            .cm;
        for (const key of sequence) Vim.handleKey(adapter, key);
    }, keys);
    await browser.pause(PAUSE.EDITOR_SETTLE * 2);
}

async function where(): Promise<Where> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return {
            file: view?.file?.path ?? null,
            line: view?.editor.getCursor().line ?? -1,
            leaf:
                (view?.leaf as unknown as { id?: string } | undefined)?.id ??
                null,
            leaves: app.workspace.getLeavesOfType('markdown').length,
        };
    })) as Where;
}

async function jumpFiles(): Promise<string[]> {
    return (await browser.executeObsidian(({ app }) =>
        (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            jumpList: {
                                getEntries(): Array<{ filePath: string }>;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions']?.jumpList
            .getEntries()
            .map((entry) => entry.filePath),
    )) as string[];
}

describe('Switching notes is a jump (#206)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(
            async ({ app }, notes: Record<string, string>) => {
                for (const [path, text] of Object.entries(notes)) {
                    await app.vault.adapter.write(path, text);
                }
            },
            NOTES,
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    beforeEach(async function () {
        await openThreeTabs();
    });

    it('tabs a, b, c, then <C-o>, <C-o>, <C-i> walk them like Neovim buffers', async function () {
        await switchTo('JumpB.md');
        await switchTo('JumpC.md');
        await sendKeys('<C-o>');
        const back = (await where()).file;
        await sendKeys('<C-o>');
        const backAgain = (await where()).file;
        await sendKeys('<C-i>');
        const forward = (await where()).file;
        expect({ back, backAgain, forward }).toEqual({
            back: 'JumpB.md',
            backAgain: 'JumpA.md',
            forward: 'JumpB.md',
        });
    });

    it('<C-o> returns to the line the cursor left the note at', async function () {
        await setLine(3);
        await switchTo('JumpB.md');
        await sendKeys('<C-o>');
        const at = await where();
        expect({ file: at.file, line: at.line }).toEqual({
            file: 'JumpA.md',
            line: 3,
        });
    });

    it('<C-o> focuses the previous tab rather than opening its note in this one', async function () {
        await switchTo('JumpB.md');
        const bLeaf = (await where()).leaf;
        await switchTo('JumpC.md');
        await sendKeys('<C-o>');
        const at = await where();
        expect({ leaf: at.leaf, leaves: at.leaves }).toEqual({
            leaf: bLeaf,
            leaves: 3,
        });
    });

    it('a note Obsidian opens in the same tab is a jump too', async function () {
        await setLine(2);
        await browser.executeObsidian(async ({ app }) => {
            const file = app.vault.getFileByPath('JumpC.md');
            if (file) await app.workspace.getLeaf(false).openFile(file);
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendKeys('<C-o>');
        const at = await where();
        expect({ file: at.file, line: at.line }).toEqual({
            file: 'JumpA.md',
            line: 2,
        });
    });

    // `gd` records its jump once Obsidian has opened the note, and Obsidian
    // reports the switch while it is still opening it.
    it('a link followed with gd is recorded once', async function () {
        await setLine(4);
        await sendKeys('w', 'w', 'g', 'd');
        expect({ at: (await where()).file, jumps: await jumpFiles() }).toEqual({
            at: 'JumpC.md',
            jumps: ['JumpA.md', 'JumpC.md'],
        });
    });

    // A picked heading's line is placed, and its jump recorded, 50 ms after
    // the note opens; Obsidian can report the switch in between.
    it('a heading picked in :headings is recorded once', async function () {
        await handleEx('headings');
        await browser.pause(300);
        await browser.keys('Bee heading');
        await browser.pause(300);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
        const at = await where();
        expect({
            at: [at.file, at.line],
            jumps: await jumpFiles(),
        }).toEqual({
            at: ['JumpB.md', 2],
            jumps: ['JumpA.md', 'JumpB.md'],
        });
    });

    it(']b, which records its own jump, is recorded once', async function () {
        await sendKeys(']', 'b');
        expect({ at: (await where()).file, jumps: await jumpFiles() }).toEqual({
            at: 'JumpB.md',
            jumps: ['JumpA.md', 'JumpB.md'],
        });
    });
});
