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
    'JumpFold.md': '## One\n\none body\n\n## Two\n\ntwo body',
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
    await browser.executeObsidian(
        async ({ app }, paths: string[]) => {
            const first = app.vault.getFileByPath(paths[0] as string);
            if (first) await app.workspace.getLeaf(false).openFile(first);
            for (const path of paths.slice(1)) {
                const file = app.vault.getFileByPath(path);
                if (file) await app.workspace.getLeaf('tab').openFile(file);
            }
        },
        ['JumpA.md', 'JumpB.md', 'JumpC.md'],
    );
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

/** The jump list's entries, as `:jumps` lists them. */
async function jumpEntries(): Promise<
    Array<{ filePath: string; line: number }>
> {
    return (await browser.executeObsidian(({ app }) =>
        (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            jumpList: {
                                getEntries(): Array<{
                                    filePath: string;
                                    line: number;
                                }>;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions']?.jumpList
            .getEntries()
            .map(({ filePath, line }) => ({ filePath, line })),
    )) as Array<{ filePath: string; line: number }>;
}

async function jumpFiles(): Promise<string[]> {
    return (await jumpEntries()).map((entry) => entry.filePath);
}

/** Where each key of `keys` leaves the cursor, as `file:line`. */
async function walk(...keys: string[]): Promise<string[]> {
    const trace: string[] = [];
    for (const key of keys) {
        await sendKeys(key);
        const at = await where();
        trace.push(`${at.file}:${at.line}`);
    }
    return trace;
}

/** Opens `path` in the active tab, in place of the note it shows. */
async function openHere(path: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, target: string) => {
        const file = app.vault.getFileByPath(target);
        if (file) await app.workspace.getLeaf(false).openFile(file);
    }, path);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

/** Edits the active note without Vim: `text` replaces `from`..`to`. */
async function replaceLines(text: string, from: number, to: number) {
    await browser.executeObsidian(
        ({ app, obsidian }, insert: string, start: number, end: number) => {
            app.workspace
                .getActiveViewOfType(obsidian.MarkdownView)
                ?.editor.replaceRange(
                    insert,
                    { line: start, ch: 0 },
                    { line: end, ch: 0 },
                );
        },
        text,
        from,
        to,
    );
    await browser.pause(100);
}

async function isFoldedAt(line: number): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app, obsidian, require: req }, target: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: {
                          doc: {
                              line(n: number): { from: number; to: number };
                          };
                      };
                  }
                | undefined;
            if (!cm) return false;
            const lang = req('@codemirror/language') as {
                foldedRanges(state: unknown): {
                    between(
                        from: number,
                        to: number,
                        f: (from: number, to: number) => void,
                    ): void;
                };
            };
            const docLine = cm.state.doc.line(target + 1);
            let folded = false;
            lang.foldedRanges(cm.state).between(
                docLine.from,
                docLine.to,
                () => {
                    folded = true;
                },
            );
            return folded;
        },
        line,
    )) as boolean;
}

async function setFlashJump(enabled: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, on: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            reloadFeatures(): void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        Object.assign(plugin.settings, {
            enableFlash: true,
            flashJumpEnabled: on,
            flashJumpKey: 's',
        });
        plugin.reloadFeatures();
    }, enabled);
    await browser.pause(PAUSE.EDITOR_SETTLE);
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

// The jumps made within a note sit among the note switches, in the order they
// happened, as in Neovim's one list. Measured on Neovim 0.12.5 with `:b`
// between buffers, in its 1-based lines: `a`, then `G` in `b`, walked
// `b:1, a:1, b:1, b:4`; `G` in `a`, then `b`, walked back `a:5, a:1, a:1`;
// `a`, then `jj` in `b`, `<C-o>` went to `a:1`; and a line put above a jump
// moved it with the text.
describe('Jumps within a note keep their place among switches (#206)', function () {
    this.timeout(120000);

    beforeEach(async function () {
        await openThreeTabs();
    });

    it('a, then G in b: <C-o>, <C-o>, <C-i>, <C-i> walk b, a, b, b', async function () {
        await switchTo('JumpB.md');
        await sendKeys('G');
        expect(await walk('<C-o>', '<C-o>', '<C-i>', '<C-i>')).toEqual([
            'JumpB.md:0',
            'JumpA.md:0',
            'JumpB.md:0',
            'JumpB.md:2',
        ]);
    });

    it('G in a, then b: <C-o> visits a where it was left, then where G started', async function () {
        await sendKeys('G');
        await switchTo('JumpB.md');
        expect(await walk('<C-o>', '<C-o>', '<C-o>')).toEqual([
            'JumpA.md:4',
            'JumpA.md:0',
            'JumpA.md:0',
        ]);
    });

    // Neovim stays put at the oldest entry. The editor's own list still holds
    // `b`'s jumps there, and walking it would put `b`'s line 1 in `a`.
    it('at the oldest jump, <C-o> stays put', async function () {
        await switchTo('JumpB.md');
        await setLine(1);
        await sendKeys('G');
        expect(await walk('<C-o>', '<C-o>', '<C-o>')).toEqual([
            'JumpB.md:1',
            'JumpA.md:0',
            'JumpA.md:0',
        ]);
    });

    // A move that is not a jump leaves no entry, and `<C-i>` comes back to
    // where `<C-o>` was pressed rather than where `b` was entered.
    it('jj in b is not a jump: <C-o> goes straight to a, and <C-i> back to it', async function () {
        await switchTo('JumpB.md');
        await sendKeys('j', 'j');
        expect(await walk('<C-o>', '<C-i>')).toEqual([
            'JumpA.md:0',
            'JumpB.md:2',
        ]);
    });

    // Neovim: `G`, `k`, `<C-o>`, `<C-i>` lands on the line `k` left, and
    // `G`, `<C-o>`, `<C-i>`, `k`, `<C-o>`, `<C-i>` back where `G` landed.
    it('G and k: <C-o>, <C-i> come back to where <C-o> was pressed', async function () {
        await sendKeys('G');
        await sendKeys('k');
        expect(await walk('<C-o>', '<C-i>')).toEqual([
            'JumpA.md:0',
            'JumpA.md:3',
        ]);
    });

    it('once walked past, where G landed stays put', async function () {
        await sendKeys('G');
        const there = await walk('<C-o>', '<C-i>');
        await sendKeys('k');
        expect([...there, ...(await walk('<C-o>', '<C-i>'))]).toEqual([
            'JumpA.md:0',
            'JumpA.md:4',
            'JumpA.md:0',
            'JumpA.md:4',
        ]);
    });

    it('a line put above a jump moves it along', async function () {
        await switchTo('JumpB.md');
        await sendKeys('j');
        await sendKeys('G');
        await sendKeys('k', 'k');
        await replaceLines('new\n', 0, 0);
        try {
            expect(await walk('<C-o>', '<C-o>')).toEqual([
                'JumpB.md:2',
                'JumpA.md:0',
            ]);
        } finally {
            await switchTo('JumpB.md');
            await replaceLines('', 0, 1);
        }
    });

    // Obsidian gives a tab a new editor when it opens another note in it, and
    // the old editor's positions mean nothing in the note shown now: read
    // there, `:jumps` would list `a`'s jumps at lines of `b`.
    it('a note replaced in its tab keeps where its jumps were', async function () {
        await setLine(3);
        await sendKeys('G');
        await openHere('JumpB.md');
        const listed = (await jumpEntries()).map(
            (entry) => `${entry.filePath}:${entry.line}`,
        );
        expect({ listed, walked: await walk('<C-o>', '<C-o>') }).toEqual({
            listed: ['JumpA.md:3', 'JumpA.md:4', 'JumpB.md:0'],
            walked: ['JumpA.md:4', 'JumpA.md:3'],
        });
    });

    // To the heading line of a closed fold, which CodeMirror leaves closed
    // on its own; `foldopen`'s `mark` is what opens it, as in Neovim.
    it('<C-o> to a closed fold opens it', async function () {
        await openHere('JumpFold.md');
        await setLine(0);
        await sendKeys('G');
        await sendKeys('z', 'M');
        const closed = await isFoldedAt(2);
        await sendKeys('<C-o>');
        expect({
            closed,
            line: (await where()).line,
            open: !(await isFoldedAt(2)),
        }).toEqual({ closed: true, line: 0, open: true });
    });

    it('a Flash jump is walked back and forth like any other', async function () {
        await setFlashJump(true);
        try {
            await browser.executeObsidian(({ app, obsidian }) => {
                app.workspace
                    .getActiveViewOfType(obsidian.MarkdownView)
                    ?.editor.focus();
            });
            await browser.keys(['s', 'J']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const landed = await where();
            expect({
                landed: `${landed.file}:${landed.line}`,
                walked: await walk('<C-o>', '<C-i>'),
            }).toEqual({
                landed: 'JumpA.md:4',
                walked: ['JumpA.md:0', 'JumpA.md:4'],
            });
        } finally {
            await setFlashJump(false);
        }
    });
});
