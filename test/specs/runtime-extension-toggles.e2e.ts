import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    vimKeys,
    sendVimEscape,
    setPluginSettingAndReload,
    PAUSE,
} from '../helpers';

// Follow-up to https://github.com/saberzero1/motions/issues/181
//
// `animatedCursor` is covered by `animated-cursor-runtime-toggle.e2e.ts`. The
// other three settings that gate a CodeMirror extension share that mechanism
// but had only been shown not to disturb each other — never that turning one
// off at runtime actually stops the behaviour. That inference is what this
// spec replaces with evidence.
//
// Discrimination was established by sabotage: `refreshRuntimeExtensionSlots()`
// was reduced to the animated-cursor slot alone, leaving setup intact, which
// reproduces the original defect exactly. Two of the three cases failed —
// `snippetTriggerMode` kept expanding on Tab after switching to completion
// only, and the undo tree recorded 3 more nodes while disabled.
//
// The first case passed under that sabotage and is therefore a control, not a
// reproduction. `createSnippetTabKeymap` receives `() => settings.enableSnippets`
// and re-reads it on every keypress, so the tab trigger already refused to
// expand while its extension was still installed. It is kept because that
// self-guard is worth holding onto, not because it exercises the slot.

async function typePrefixAndTab(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
}

async function getUndoNodeCount(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { undoTree?: { getNodeCount: () => number } }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.undoTree?.getNodeCount() ?? -1;
    })) as number;
}

async function typeSomething(text: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(text));
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await sendVimEscape();
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Runtime extension toggles (#181)', function () {
    before(async function () {
        this.timeout(60000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    after(async function () {
        this.timeout(60000);
        await setPluginSettingAndReload('enableSnippets', true);
        await setPluginSettingAndReload('snippetTriggerMode', 'both');
        await setPluginSettingAndReload('enableUndoTree', true);
    });

    it('control: disabling snippets stops expansion via the keymap self-guard (#181)', async function () {
        this.timeout(90000);

        await setPluginSettingAndReload('enableSnippets', true);
        await setPluginSettingAndReload('snippetTriggerMode', 'both');

        // Control: expansion has to work first, or the disabled assertion
        // below is satisfied by a snippet that never expanded anyway.
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        expect((await getEditorValue()).startsWith('# ')).toBe(true);

        await setPluginSettingAndReload('enableSnippets', false);

        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        const disabled = await getEditorValue();
        expect(disabled.startsWith('# ')).toBe(false);
        expect(disabled).toContain('h1');

        // And it comes back, so the removal is a toggle rather than a
        // one-way trip that only looks correct once.
        await setPluginSettingAndReload('enableSnippets', true);
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        expect((await getEditorValue()).startsWith('# ')).toBe(true);
    });

    it('switching snippetTriggerMode to completion drops the tab trigger (#181)', async function () {
        this.timeout(90000);

        await setPluginSettingAndReload('enableSnippets', true);
        await setPluginSettingAndReload('snippetTriggerMode', 'both');

        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        expect((await getEditorValue()).startsWith('# ')).toBe(true);

        await setPluginSettingAndReload('snippetTriggerMode', 'completion');

        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        expect((await getEditorValue()).startsWith('# ')).toBe(false);

        await setPluginSettingAndReload('snippetTriggerMode', 'both');
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        expect((await getEditorValue()).startsWith('# ')).toBe(true);
    });

    it('disabling the undo tree at runtime stops recording (#181)', async function () {
        this.timeout(90000);

        await setPluginSettingAndReload('enableUndoTree', true);
        await setupEditor('start', { line: 0, ch: 5 });

        // Control: recording has to be happening first.
        const before = await getUndoNodeCount();
        await typeSomething('aaa');
        const afterEnabled = await getUndoNodeCount();
        expect(afterEnabled).toBeGreaterThan(before);

        await setPluginSettingAndReload('enableUndoTree', false);
        await setupEditor('start', { line: 0, ch: 5 });

        const beforeDisabled = await getUndoNodeCount();
        await typeSomething('bbb');
        const afterDisabled = await getUndoNodeCount();
        expect(afterDisabled).toBe(beforeDisabled);

        await setPluginSettingAndReload('enableUndoTree', true);
        await setupEditor('start', { line: 0, ch: 5 });
        const beforeReenabled = await getUndoNodeCount();
        await typeSomething('ccc');
        expect(await getUndoNodeCount()).toBeGreaterThan(beforeReenabled);
    });
});
