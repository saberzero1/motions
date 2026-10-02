import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    getVimMode,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan B Step 5, composition half.
 *
 * An IME rewrites its preedit repeatedly before committing, and every rewrite
 * is a document change in the nested editor. Forwarding those puts preedit text
 * into the real document and makes one composition cost several undo steps, so
 * the forward is suppressed while composing and flushed on `compositionend`.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '',
    'Line below',
].join('\n');

interface CdpSession {
    send(method: string, params?: unknown): Promise<unknown>;
}

interface ImePlugin {
    getNestedTableStats(): { mounted: number; focused: boolean };
}

async function createCdpSession(): Promise<CdpSession> {
    const puppeteer = await (
        browser as unknown as {
            getPuppeteer(): Promise<{ pages(): Promise<unknown[]> }>;
        }
    ).getPuppeteer();
    const pages = await puppeteer.pages();
    const page = pages[0] as {
        target(): { createCDPSession(): Promise<CdpSession> };
    };
    return page.target().createCDPSession();
}

async function nestedHasFocus(): Promise<boolean> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, ImePlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const stats = plugin?.getNestedTableStats();
        return stats?.mounted === 1 && stats.focused;
    })) as boolean;
}

async function enterInsertInTable(): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(800);

    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  state: { doc: { line: (n: number) => { from: number } } };
                  dispatch: (spec: unknown) => void;
              }
            | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({ selection: { anchor: cm.state.doc.line(5).from + 2 } });
    });
    await browser.pause(700);

    await browser.keys(['i']);
    await browser.pause(400);
}

async function setComposition(
    session: CdpSession,
    preedit: string,
): Promise<void> {
    await session.send('Input.imeSetComposition', {
        text: preedit,
        selectionStart: Array.from(preedit).length,
        selectionEnd: Array.from(preedit).length,
    });
    await browser.pause(300);
}

describe('Table nested editor IME composition (Plan B Step 5)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('commits a composition once, with no preedit residue', async () => {
        const session = await createCdpSession();
        await enterInsertInTable();
        expect(await nestedHasFocus()).toBe(true);
        expect(await getVimMode()).toBe('insert');

        await setComposition(session, 'に');
        const duringPreedit = await getEditorValue();
        // Suppressed: the preedit must not be in the real document yet.
        expect(duringPreedit).toBe(TABLE_DOC);

        await session.send('Input.insertText', { text: '日' });
        await browser.pause(700);

        const committed = await getEditorValue();
        expect(committed).toBe(TABLE_DOC.replace('| aa', '| 日aa'));
        // Exactly one occurrence: a per-rewrite forward leaves the preedit
        // behind alongside the commit.
        expect((committed.match(/[にに日]/g) ?? []).length).toBe(1);
    });

    it('reverses the whole composition with one undo', async () => {
        const session = await createCdpSession();
        await enterInsertInTable();
        await setComposition(session, 'にほ');
        await session.send('Input.insertText', { text: '日本' });
        await browser.pause(700);
        expect(await getEditorValue()).toBe(
            TABLE_DOC.replace('| aa', '| 日本aa'),
        );

        await browser.keys(['Escape']);
        await browser.pause(500);
        expect(await getVimMode()).toBe('normal');

        await browser.keys(['u']);
        await browser.pause(700);

        // One undo, not one per preedit rewrite.
        expect(await getEditorValue()).toBe(TABLE_DOC);
    });

    it('leaves the document byte-identical when a composition is cancelled', async () => {
        const session = await createCdpSession();
        await enterInsertInTable();
        const before = await getEditorValue();
        expect(before).toBe(TABLE_DOC);

        await setComposition(session, 'にほんご');
        await setComposition(session, '');
        await browser.pause(700);

        expect(await getEditorValue()).toBe(before);
    });
});
