import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getCursorPos,
    getEditorValue,
    handleEx,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';

// Obsidian 1.13's image selection and :image, under the plugin's engine
// (#218). The image is drawn at runtime, so no binary is committed.

const IMAGE = 'image-embed-pic.png';
const EMBED = `![[${IMAGE}]]`;
const DOC = `alpha\n${EMBED}\nomega`;

interface ImageState {
    selected: boolean;
    cursor: { line: number; ch: number };
    line: string;
}

async function imageState(): Promise<ImageState> {
    const state = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const embed = view?.containerEl.querySelector(
            '.cm-content .image-embed',
        );
        return {
            selected: embed?.classList.contains('is-selected') ?? false,
            line: view?.editor.getLine(1) ?? '',
        };
    })) as Omit<ImageState, 'cursor'>;
    return { ...state, cursor: await getCursorPos() };
}

async function press(...keys: string[]): Promise<void> {
    for (const key of keys) {
        await browser.keys([key]);
        await browser.pause(60);
    }
    await browser.pause(120);
}

async function openImageNote(cursor: { line: number; ch: number }) {
    await setupEditor(DOC, cursor);
    await ensureLivePreview();
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                return !!view?.containerEl.querySelector(
                    '.cm-content .image-embed.is-loaded img',
                );
            })) as boolean,
        { timeout: 5000, interval: 100 },
    );
}

// What :image edit and the Edit this block button both leave: the source
// revealed, the file name inside `![[...]]` selected, Obsidian's preview up.
const REVEALED = {
    selection: {
        anchor: { line: 1, ch: 3 },
        head: { line: 1, ch: 3 + IMAGE.length },
    },
    tooltip: true,
};

async function revealState(): Promise<typeof REVEALED> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const selection = view?.editor.listSelections()[0];
        return {
            selection: selection
                ? { anchor: selection.anchor, head: selection.head }
                : null,
            tooltip: !!activeDocument.querySelector('.cm-image-reveal-tooltip'),
        };
    })) as typeof REVEALED;
}

/** The hint label drawn at each of the image's buttons, or null. */
async function buttonLabels(): Promise<Record<string, string | null>> {
    await browser.pause(250);
    return (await browser.executeObsidian(() => {
        const labels = Array.from(
            activeDocument.querySelectorAll(
                '.vim-motions-hint-overlay .vim-motions-hint-label',
            ),
        ) as HTMLElement[];
        const result: Record<string, string | null> = {};
        for (const name of ['Zoom in', 'Edit this block']) {
            const button = Array.from(
                activeDocument.querySelectorAll('.cm-content .embed-action'),
            ).find((el) => el.getAttribute('aria-label') === name);
            const rect = button?.getBoundingClientRect();
            const label = labels.find((el) => {
                const left = Number.parseFloat(
                    el.style.getPropertyValue('--vim-motions-hint-left'),
                );
                const top = Number.parseFloat(
                    el.style.getPropertyValue('--vim-motions-hint-top'),
                );
                return (
                    !!rect &&
                    Math.abs(left - rect.left) < 2 &&
                    Math.abs(top - rect.top) < 2
                );
            });
            result[name] = label?.textContent ?? null;
        }
        return result;
    })) as Record<string, string | null>;
}

describe('Image embeds (#218)', function () {
    before(async function () {
        await browser.executeObsidian(async ({ app }, path: string) => {
            if (app.vault.getAbstractFileByPath(path)) return;
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 150;
            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = '#c33';
                context.fillRect(0, 0, 300, 150);
            }
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/png'),
            );
            if (!blob) throw new Error('Could not draw the test image');
            await app.vault.createBinary(path, await blob.arrayBuffer());
        }, IMAGE);
        await loadSingleFileWorkspace();
    });

    describe('h and l', function () {
        it('l selects an image the cursor reaches, and l again leaves it', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l');
            const entered = await imageState();
            await press('l');
            const left = await imageState();
            expect({ entered, left }).toEqual({
                entered: {
                    selected: true,
                    cursor: { line: 1, ch: 0 },
                    line: EMBED,
                },
                left: {
                    selected: false,
                    cursor: { line: 1, ch: EMBED.length },
                    line: EMBED,
                },
            });
        });

        it('h selects the image from its end, and h again leaves it at its start', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l', 'l', 'h');
            const entered = await imageState();
            await press('h');
            const left = await imageState();
            expect({ entered, left }).toEqual({
                entered: {
                    selected: true,
                    cursor: { line: 1, ch: EMBED.length },
                    line: EMBED,
                },
                left: {
                    selected: false,
                    cursor: { line: 1, ch: 0 },
                    line: EMBED,
                },
            });
        });

        it('a count moves past the image as before', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('2', 'l');
            expect(await imageState()).toEqual({
                selected: false,
                cursor: { line: 1, ch: 2 },
                line: EMBED,
            });
        });

        it('j moves off a selected image and clears the selection', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l', 'j');
            const state = await imageState();
            expect({
                selected: state.selected,
                line: state.cursor.line,
            }).toEqual({ selected: false, line: 2 });
        });
    });

    describe(':image', function () {
        it('grows, shrinks and resets the selected image', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l');
            const lines: string[] = [];
            for (const action of ['grow', 'shrink', 'reset']) {
                const result = await handleEx(`image ${action}`);
                expect(result.unknownCommand).toBe(false);
                lines.push((await imageState()).line);
            }
            expect(lines).toEqual([
                `![[${IMAGE}|325]]`,
                `![[${IMAGE}|300]]`,
                EMBED,
            ]);
        });

        it('takes a count from the address, as Obsidian does, or from an argument', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l');
            await handleEx('3image grow');
            const address = (await imageState()).line;
            await handleEx('image reset');
            await handleEx('image grow 2');
            const argument = (await imageState()).line;
            expect({ address, argument }).toEqual({
                address: `![[${IMAGE}|375]]`,
                argument: `![[${IMAGE}|350]]`,
            });
        });

        it('selects the image under the cursor when none is selected', async function () {
            await openImageNote({ line: 1, ch: 0 });
            const before = await imageState();
            await handleEx('image grow');
            const after = await imageState();
            expect({ before: before.selected, after }).toEqual({
                before: false,
                after: {
                    selected: true,
                    cursor: { line: 1, ch: 0 },
                    line: `![[${IMAGE}|325]]`,
                },
            });
        });

        it('names what it needs instead of doing nothing', async function () {
            await openImageNote({ line: 0, ch: 0 });
            const noImage = await handleEx('image grow');
            const usage = await handleEx('image bigger');
            expect({
                noImage: noImage.messages.some((m) =>
                    m.includes('No image at the cursor'),
                ),
                usage: usage.messages.some((m) =>
                    m.includes('Usage: :image grow|shrink|reset|edit'),
                ),
                unknown: noImage.unknownCommand || usage.unknownCommand,
                doc: await getEditorValue(),
            }).toEqual({
                noImage: true,
                usage: true,
                unknown: false,
                doc: DOC,
            });
        });

        it('edit reveals the image source with its file name selected', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l');
            await handleEx('image edit');
            await browser.pause(200);
            expect(await revealState()).toEqual(REVEALED);
        });
    });

    describe('hint mode', function () {
        it("labels a selected image's buttons, and not the hidden ones of an unselected image", async function () {
            await openImageNote({ line: 0, ch: 0 });
            await handleEx('hintactivate');
            const unselected = await buttonLabels();
            await browser.keys(['Escape']);
            await browser.pause(150);
            await press('j', 'l');
            await handleEx('hintactivate');
            const selected = await buttonLabels();
            await browser.keys(['Escape']);
            expect({
                unselected,
                selected: {
                    zoom: typeof selected['Zoom in'],
                    edit: typeof selected['Edit this block'],
                },
            }).toEqual({
                unselected: { 'Zoom in': null, 'Edit this block': null },
                selected: { zoom: 'string', edit: 'string' },
            });
        });

        it('a hint on Edit this block reveals the image source', async function () {
            await openImageNote({ line: 1, ch: 0 });
            await press('l');
            await handleEx('hintactivate');
            const label = (await buttonLabels())['Edit this block'];
            expect(typeof label).toBe('string');
            await press(...(label ?? '').split(''));
            await browser.pause(300);
            expect(await revealState()).toEqual(REVEALED);
        });
    });
});
