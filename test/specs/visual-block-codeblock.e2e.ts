import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    ensureSourceMode,
    loadSingleFileWorkspace,
    setupEditor,
    PAUSE,
} from '../helpers';

/**
 * #249: a visual-block selection inside a code block showed nothing but the
 * cursor. The editor draws a block selection on its selection layer, behind
 * the lines, and Obsidian paints a code block's lines with an opaque
 * background, which covered it.
 *
 * Each check reads what is painted at a character: the background of the
 * nearest element under the glyph that paints one. Before the fix, a selected
 * character in a code block reads the code block's background.
 */

// The issue's note.
const NOTE = 'text\n```\ntext\ntext\n```\ntext\n';

interface Paint {
    /** Background painted under each line's character at `ch`. */
    painted: string[];
    selection: string;
    code: string;
    marks: number;
    layerHiddenByCss: boolean;
    scrollerActive: boolean;
}

async function paint(ch: number): Promise<Paint> {
    return (await browser.executeObsidian(({ app, obsidian }, col: number) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
        const cm = (
            view.editor as unknown as {
                cm: import('@codemirror/view').EditorView;
            }
        ).cm;
        const transparent = (c: string) =>
            c === 'transparent' ||
            /rgba\(.*,\s*0\)$/.test(c) ||
            /\/\s*0\)$/.test(c);
        const paintedAt = (pos: number): string => {
            const a = cm.coordsAtPos(pos, 1);
            if (!a) return 'no-coords';
            const x = (a.left + a.right) / 2 + 2;
            const y = (a.top + a.bottom) / 2;
            let el = document.elementFromPoint(x, y);
            while (el && el !== cm.contentDOM) {
                const bg = getComputedStyle(el).backgroundColor;
                if (!transparent(bg)) return bg;
                el = el.parentElement;
            }
            return 'none';
        };
        const doc = cm.state.doc;
        const painted: string[] = [];
        for (let n = 1; n <= doc.lines - 1; n++) {
            const line = doc.line(n);
            painted.push(
                col < line.length ? paintedAt(line.from + col) : 'short',
            );
        }
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--text-selection)';
        cm.contentDOM.appendChild(probe);
        const selection = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const codeLine = cm.contentDOM.querySelector('.HyperMD-codeblock-bg');
        const layer = cm.scrollDOM.querySelector(':scope > .cm-selectionLayer');
        return {
            painted,
            selection,
            code: codeLine
                ? getComputedStyle(codeLine).backgroundColor
                : 'no-code-line',
            marks: cm.contentDOM.querySelectorAll(
                '.vim-motions-visual-block-selection',
            ).length,
            // Hidden by this plugin's stylesheet rather than by Obsidian,
            // which hides the layer itself while there is one range.
            layerHiddenByCss:
                !!layer &&
                (layer as HTMLElement).style.display !== 'none' &&
                getComputedStyle(layer).display === 'none',
            scrollerActive: cm.scrollDOM.classList.contains(
                'vim-motions-visual-block',
            ),
        };
    }, ch)) as Paint;
}

async function press(keys: string[]): Promise<void> {
    for (const k of keys) {
        if (k === '<C-v>') await browser.keys(['Control', 'v']);
        else await browser.keys([k]);
        await browser.pause(60);
    }
    await browser.pause(PAUSE.MODE_SWITCH);
}

async function start(): Promise<void> {
    await setupEditor(NOTE, { line: 0, ch: 0 });
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
}

describe('Visual block selection in a code block (#249)', () => {
    before(async () => {
        await loadSingleFileWorkspace();
    });

    afterEach(async () => {
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    for (const mode of ['Live Preview', 'source mode'] as const) {
        it(`paints every selected line, code block included, in ${mode}`, async () => {
            if (mode === 'Live Preview') await ensureLivePreview();
            else await ensureSourceMode();
            await start();
            // Two columns, so column 0 is clear of the cursor on the last line.
            await press(['<C-v>', 'l', 'j', 'j', 'j', 'j', 'j']);

            const p = await paint(0);
            expect(p.code).not.toBe(p.selection);
            // Lines 1 to 4 are the code block, fences included.
            expect(p.painted).toEqual(Array(6).fill(p.selection));
            expect(p.marks).toBe(6);

            // Control: column 2 is outside the block and keeps its background.
            const outside = await paint(2);
            expect(outside.painted.slice(1, 5)).toEqual([
                p.code,
                p.code,
                p.code,
                p.code,
            ]);

            // Nothing is painted twice: the layer is hidden meanwhile.
            expect(p.layerHiddenByCss).toBe(true);
        });
    }

    it('clears the highlight and stops hiding the selection layer on <Esc>', async () => {
        await ensureLivePreview();
        await start();
        await press(['<C-v>', 'l', 'j', 'j', 'j']);
        expect((await paint(0)).marks).toBe(4);

        await press(['Escape']);
        const p = await paint(0);
        expect(p.marks).toBe(0);
        expect(p.scrollerActive).toBe(false);
        expect(p.layerHiddenByCss).toBe(false);
        expect(p.painted.slice(1, 5)).toEqual([p.code, p.code, p.code, p.code]);
    });

    it('paints on switching from v to <C-v> without moving', async () => {
        await ensureLivePreview();
        await setupEditor(NOTE, { line: 2, ch: 0 });
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await press(['v', 'l']);
        expect((await paint(0)).marks).toBe(0);

        await press(['<C-v>']);
        const p = await paint(0);
        expect(p.marks).toBe(1);
        expect(p.painted[2]).toBe(p.selection);
    });

    it('stops painting on switching from <C-v> to v', async () => {
        await ensureLivePreview();
        await setupEditor(NOTE, { line: 2, ch: 0 });
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await press(['<C-v>', 'l', 'j']);
        expect((await paint(0)).marks).toBe(2);

        await press(['v']);
        const p = await paint(0);
        expect(p.marks).toBe(0);
        expect(p.scrollerActive).toBe(false);
        expect(p.layerHiddenByCss).toBe(false);
    });
});
