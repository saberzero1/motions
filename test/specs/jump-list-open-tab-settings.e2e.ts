import { browser, expect } from '@wdio/globals';
import { loadSingleFileWorkspace, PAUSE } from '../helpers';

// #206: with Open Tab Settings, which opens every note in a tab of its own,
// `<C-o>` back to a note whose tab was closed should open it in a new tab, not
// in the current one. Open Tab Settings patches `Workspace.getLeaf` and
// `WorkspaceLeaf.openFile` (3.4.0, `src/main.ts`), so the jump list plays along
// only for as long as it asks `getLeaf(false)` for the leaf rather than opening
// the note in the active leaf directly. Without the plugin, the note opens in
// the current tab, as Vim reuses the current window.

const NOTES = ['OtsA.md', 'OtsB.md', 'OtsC.md'];

interface Tabs {
    active: string | null;
    activeLeaf: string | null;
    tabs: string[];
}

async function tabs(): Promise<Tabs> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const out: string[] = [];
        app.workspace.iterateRootLeaves((leaf) => {
            const file = (leaf.view as { file?: { path: string } }).file;
            if (file) out.push(file.path);
        });
        return {
            active: view?.file?.path ?? null,
            activeLeaf:
                (view?.leaf as unknown as { id?: string } | undefined)?.id ??
                null,
            tabs: out,
        };
    })) as Tabs;
}

async function setOpenTabSettings(on: boolean): Promise<void> {
    await browser.executeObsidian(async ({ app }, enable: boolean) => {
        const plugins = (
            app as unknown as {
                plugins: {
                    enablePlugin(id: string): Promise<void>;
                    disablePlugin(id: string): Promise<void>;
                };
            }
        ).plugins;
        if (enable) await plugins.enablePlugin('open-tab-settings');
        else await plugins.disablePlugin('open-tab-settings');
    }, on);
}

async function switchTo(path: string): Promise<void> {
    await browser.executeObsidian(({ app }, target: string) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (
                (leaf.view as { file?: { path: string } }).file?.path === target
            )
                app.workspace.setActiveLeaf(leaf, { focus: true });
        });
    }, path);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

/** Three tabs, visited A, B, C, then B's tab closed from C. */
async function visitThenCloseB(): Promise<{ before: Tabs; after: Tabs }> {
    await loadSingleFileWorkspace();
    await browser.executeObsidian(async ({ app }, paths: string[]) => {
        for (const path of paths) {
            if (!app.vault.getFileByPath(path))
                await app.vault.create(path, `${path}\nsecond line`);
        }
        const first = app.vault.getFileByPath(paths[0] as string);
        if (first) await app.workspace.getLeaf(false).openFile(first);
        for (const path of paths.slice(1)) {
            const file = app.vault.getFileByPath(path);
            if (file) await app.workspace.getLeaf('tab').openFile(file);
        }
    }, NOTES);
    await switchTo('OtsA.md');
    await browser.executeObsidian(({ app }) => {
        (
            app as unknown as {
                plugins: {
                    plugins: Record<string, { jumpList: { clear(): void } }>;
                };
            }
        ).plugins.plugins['vim-motions']?.jumpList.clear();
    });
    await switchTo('OtsB.md');
    await switchTo('OtsC.md');
    await browser.executeObsidian(({ app }) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (
                (leaf.view as { file?: { path: string } }).file?.path ===
                'OtsB.md'
            )
                leaf.detach();
        });
    });
    await browser.pause(300);
    await switchTo('OtsC.md');
    const before = await tabs();
    await browser.keys(['Control', 'o']);
    await browser.keys(['Control']);
    await browser.pause(800);
    return { before, after: await tabs() };
}

describe('<C-o> to a closed tab under Open Tab Settings (#206)', function () {
    this.timeout(120000);
    let focusNewTab: unknown;

    before(async function () {
        focusNewTab = await browser.executeObsidian(({ app }) =>
            (
                app.vault as unknown as { getConfig(k: string): unknown }
            ).getConfig('focusNewTab'),
        );
    });

    after(async function () {
        await setOpenTabSettings(false);
        await browser.executeObsidian(({ app }, value: unknown) => {
            (
                app.vault as unknown as {
                    setConfig(k: string, v: unknown): void;
                }
            ).setConfig('focusNewTab', value);
        }, focusNewTab);
    });

    it('opens the note in a new tab, leaving the current one alone', async function () {
        await setOpenTabSettings(true);
        const { before, after } = await visitThenCloseB();
        expect({
            active: after.active,
            newLeaf: after.activeLeaf !== before.activeLeaf,
            tabs: [...after.tabs].sort(),
        }).toEqual({
            active: 'OtsB.md',
            newLeaf: true,
            tabs: [...before.tabs, 'OtsB.md'].sort(),
        });
    });

    // The control: without the plugin, Vim's answer — the current window.
    it('without it, opens the note in the current tab', async function () {
        await setOpenTabSettings(false);
        const { before, after } = await visitThenCloseB();
        expect({
            active: after.active,
            newLeaf: after.activeLeaf !== before.activeLeaf,
            hasC: after.tabs.includes('OtsC.md'),
        }).toEqual({ active: 'OtsB.md', newLeaf: false, hasC: false });
    });
});
