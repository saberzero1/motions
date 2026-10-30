import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import { handleEx } from '../helpers';

/**
 * A line-bearing picker result opened in a new tab or a split lands on its
 * line (#201).
 *
 * The split and tab paths started the open without waiting for it, then set
 * the cursor on whichever view was active 100 ms later. An open that took
 * longer lost the race: the cursor went to the note the picker was opened
 * from, or to nothing, and the new tab showed the top of the note. On a fast
 * machine the open wins, which is why the reporter saw it and this test
 * vault did not. Each scenario therefore slows `WorkspaceLeaf.openFile` by
 * 300 ms. Opening in the current tab already awaited the open and always
 * worked; it is the control.
 */

const TARGET = 'PickerSplitTarget.md';
const TOKEN = 'zebrafinch';
const TOKEN_LINE = 150;
const HEADING_LINE = 170;

interface LeafState {
    path: string | null;
    line: number | null;
    active: boolean;
}

async function leaves(): Promise<LeafState[]> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const out: LeafState[] = [];
        const active = app.workspace.getMostRecentLeaf();
        app.workspace.iterateRootLeaves((leaf) => {
            const view = leaf.view;
            const md = view instanceof obsidian.MarkdownView ? view : null;
            out.push({
                path: md?.file?.path ?? null,
                line: md ? md.editor.getCursor().line : null,
                active: leaf === active,
            });
        });
        return out;
    })) as LeafState[];
}

/** Delays every `WorkspaceLeaf.openFile` by `ms`, or restores it for 0. */
async function slowOpenFile(ms: number): Promise<void> {
    await browser.executeObsidian(({ app }, delay: number) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (!leaf) return;
        const proto = Object.getPrototypeOf(leaf) as {
            openFile: (...args: unknown[]) => Promise<void>;
            __realOpenFile?: (...args: unknown[]) => Promise<void>;
        };
        proto.__realOpenFile ??= proto.openFile;
        const real = proto.__realOpenFile;
        if (delay === 0) {
            proto.openFile = real;
            delete proto.__realOpenFile;
            return;
        }
        proto.openFile = async function (this: unknown, ...args: unknown[]) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
            return real.apply(this, args);
        };
    }, ms);
}

/** Closes every leaf; the next `openPicker` reopens Welcome.md. */
async function closeAllLeaves(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const doomed: { detach(): void }[] = [];
        app.workspace.iterateRootLeaves((leaf) => {
            doomed.push(leaf);
        });
        doomed.forEach((leaf) => leaf.detach());
    });
    await browser.pause(300);
}

async function openPicker(command: string, query?: string): Promise<void> {
    await obsidianPage.openFile('Welcome.md');
    await browser.pause(500);
    const result = await handleEx(command);
    expect(result.unknownCommand).toBe(false);
    if (query !== undefined) {
        await $('.vim-motions-picker-input').setValue(query);
    }
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                (_ctx, q: string) =>
                    Array.from(
                        document.querySelectorAll('.vim-motions-picker-item'),
                    ).some((el) => el.textContent?.includes(q)),
                query ?? TOKEN,
            )) as boolean,
        { timeout: 5000, interval: 100, timeoutMsg: `no ${command} result` },
    );
}

/** Presses `keys`, then waits for the target note to be the active leaf. */
async function confirmWith(keys: string[]): Promise<LeafState> {
    await browser.keys(keys);
    await browser.keys([Key.Ctrl]);
    let active: LeafState | undefined;
    await browser.waitUntil(
        async () => {
            active = (await leaves()).find((l) => l.active);
            return active?.path === TARGET;
        },
        { timeout: 5000, interval: 100, timeoutMsg: `${TARGET} never opened` },
    );
    // Long enough for any late cursor placement to land.
    await browser.pause(600);
    return (await leaves()).find((l) => l.active)!;
}

describe('picker results opened in a tab or split keep their line (#201)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(
            async (
                { app },
                args: {
                    target: string;
                    token: string;
                    tokenLine: number;
                    headingLine: number;
                },
            ) => {
                const lines = Array.from(
                    { length: 200 },
                    (_, i) => `line ${i}`,
                );
                lines[args.tokenLine] = `the ${args.token} sings`;
                lines[args.headingLine] = `## Finch heading`;
                await app.vault.adapter.write(args.target, lines.join('\n'));
            },
            {
                target: TARGET,
                token: TOKEN,
                tokenLine: TOKEN_LINE,
                headingLine: HEADING_LINE,
            },
        );
        await browser.pause(1500);
    });

    beforeEach(async function () {
        await slowOpenFile(300);
    });

    afterEach(async function () {
        await slowOpenFile(0);
        await browser.keys(['Escape']);
        await closeAllLeaves();
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }, target: string) => {
            if (await app.vault.adapter.exists(target)) {
                await app.vault.adapter.remove(target);
            }
        }, TARGET);
    });

    it(':livegrep result in a new tab', async function () {
        await openPicker('livegrep', TOKEN);
        const active = await confirmWith([Key.Ctrl, 't']);
        expect(active.line).toBe(TOKEN_LINE);
    });

    it(':livegrep result in a vertical split', async function () {
        await openPicker('livegrep', TOKEN);
        const active = await confirmWith([Key.Ctrl, 'v']);
        expect(active.line).toBe(TOKEN_LINE);
    });

    it(':grep result in a new tab', async function () {
        await openPicker(`grep ${TOKEN}`);
        const active = await confirmWith([Key.Ctrl, 't']);
        expect(active.line).toBe(TOKEN_LINE);
    });

    it(':headings result in a new tab', async function () {
        await openPicker('headings', 'Finch heading');
        const active = await confirmWith([Key.Ctrl, 't']);
        expect(active.line).toBe(HEADING_LINE);
    });

    // With **Always focus new tabs** off the new tab stays in the background,
    // so the view active after the open is still the note the picker was
    // opened from. Placing the cursor there instead of in the opened leaf
    // moved that note to line 13 and left the new tab on line 0.
    it(':livegrep result in a background tab moves neither note to the wrong line', async function () {
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('focusNewTab', false);
        });
        try {
            await openPicker('livegrep', TOKEN);
            const before = (await leaves()).find((l) => l.active);
            await browser.keys([Key.Ctrl, 't']);
            await browser.keys([Key.Ctrl]);
            await browser.waitUntil(
                async () => (await leaves()).some((l) => l.path === TARGET),
                {
                    timeout: 5000,
                    interval: 100,
                    timeoutMsg: `${TARGET} never opened`,
                },
            );
            await browser.pause(600);
            const after = await leaves();
            expect(after.find((l) => l.path === TARGET)?.line).toBe(TOKEN_LINE);
            expect(after.find((l) => l.path === 'Welcome.md')?.line).toBe(
                before?.line,
            );
        } finally {
            await browser.executeObsidian(({ app }) => {
                (
                    app.vault as unknown as {
                        setConfig(key: string, value: unknown): void;
                    }
                ).setConfig('focusNewTab', true);
            });
        }
    });

    it(':livegrep result in the current tab (control)', async function () {
        await openPicker('livegrep', TOKEN);
        const active = await confirmWith(['Enter']);
        expect(active.line).toBe(TOKEN_LINE);
    });
});
