import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    getVimMode,
    handleEx,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.7: a realign is refused at an unsafe moment.
 *
 * Realignment replaces the **whole** table, and three facts make that
 * dangerous rather than untidy during insert mode: the fork's adapter exposes
 * changed regions with no meaningful origin, insert recording accepts
 * `origin === undefined`, and a table-spanning replacement is therefore
 * eligible to enter `lastInsertModeChanges` — after which `.` replays a
 * formatter edit. That is the defect Plan B Step 5 fixed for `sync-up`.
 *
 * The realign must be **requested** in every scenario. Nothing realigns on its
 * own, so a sequence that merely types and exits never exercises the guard and
 * the control for it could not fail.
 */

const MISALIGNED = [
    'Line above',
    '',
    '|h|x|',
    '|---|---|',
    '|aa|11|',
    '',
    'Line below',
].join('\n');

async function enterCell(line = 5, ch = 1): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, target: number, col: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: { doc: { line: (n: number) => { from: number } } };
                      dispatch: (s: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(target).from + col },
            });
        },
        line,
        ch,
    );
    await browser.pause(800);
}

async function requestRealign(): Promise<void> {
    const ex = await handleEx('tablerealign');
    // The command stays recognised even when the guard refuses it; a typo
    // would otherwise read as a successful block.
    expect(ex.unknownCommand).toBe(false);
    await browser.pause(700);
}

async function openOwned(doc = MISALIGNED): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(doc, { line: 0, ch: 0 });
    await browser.pause(800);
}

describe('Table realign guard (Plan E1.7)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await openOwned();
    });

    it('refuses a realign requested from insert mode', async () => {
        await enterCell();
        await browser.keys(['i']);
        await browser.pause(300);
        await browser.keys(['Z']);
        await browser.pause(700);
        expect(await getVimMode()).toBe('insert');

        const typed = await getEditorValue();
        expect(typed).toContain('|Zaa|11|');
        // Still misaligned: the table has not been formatted.
        expect(typed).toContain('|h|x|');

        await requestRealign();

        // Byte-identical. This is the assertion the guard control breaks.
        expect(await getEditorValue()).toBe(typed);
        expect(await getVimMode()).toBe('insert');
    });

    it('allows a realign from normal mode and matches the formatter', async () => {
        await enterCell();
        await browser.keys(['i', 'Z']);
        await browser.pause(600);
        await browser.keys(['Escape']);
        await browser.pause(600);
        expect(await getVimMode()).toBe('normal');

        const before = await getEditorValue();
        expect(before).toContain('|Zaa|11|');

        await requestRealign();
        const after = await getEditorValue();

        expect(after).not.toBe(before);
        // Derived from the formatter's own contract rather than hand-counted:
        // every column is padded to at least three, and the typed Z survives.
        expect(after).toContain('| Zaa | 11  |');
        expect(after).toContain('| h   | x   |');
        expect(after).toContain('| --- | --- |');
        expect(after.split('\n').length).toBe(MISALIGNED.split('\n').length);
    });

    it('measures undo granularity rather than assuming it', async () => {
        await enterCell();
        await browser.keys(['i', 'Z']);
        await browser.pause(600);
        await browser.keys(['Escape']);
        await browser.pause(600);
        const typed = await getEditorValue();

        await requestRealign();
        const realigned = await getEditorValue();
        expect(realigned).not.toBe(typed);

        // Plan E1.7 wanted `isolateHistory` for this. That annotation is an
        // `AnnotationType` instance from `@codemirror/commands`, which is not
        // a declared dependency here and is not the copy the host's history
        // reads — so the mechanism is unavailable and the behaviour is
        // measured instead of asserted from a mechanism that may no-op.
        await browser.keys(['u']);
        await browser.pause(700);
        const once = await getEditorValue();

        // One undo must not take the typed Z with it, whatever groups it.
        expect(once).not.toBe(realigned);
        expect(once).toContain('Zaa');

        await browser.keys(['u']);
        await browser.pause(700);
        const twice = await getEditorValue();
        expect(twice).not.toContain('Zaa');
    });

    it('a realign does not leak into dot-repeat', async () => {
        await enterCell();
        await browser.keys(['i', 'Z']);
        await browser.pause(600);
        await browser.keys(['Escape']);
        await browser.pause(600);

        await requestRealign();
        const realigned = await getEditorValue();
        expect(realigned).toContain('| Zaa | 11  |');

        await browser.keys(['.']);
        await browser.pause(800);
        const repeated = await getEditorValue();

        // Exactly one more Z, and the table's alignment unchanged. The second
        // clause is the one that matters: it rejects a formatter edit entering
        // lastInsertModeChanges without rejecting the legitimate insert.
        expect((repeated.match(/Z/g) ?? []).length).toBe(2);
        expect(repeated).toContain('| --- | --- |');
        expect(repeated.split('\n').length).toBe(MISALIGNED.split('\n').length);
    });

    it('realigns from outside the table too, where no cell editor exists', async () => {
        // The guard reads the parent's vim state and the nested editor's
        // composition; with the cursor outside the table neither is engaged,
        // so a request must still be honoured.
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: { doc: { line: (n: number) => { from: number } } };
                      dispatch: (s: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({ selection: { anchor: cm.state.doc.line(5).from } });
        });
        await browser.pause(800);
        await requestRealign();
        expect(await getEditorValue()).toContain('| aa  | 11  |');
    });
});
