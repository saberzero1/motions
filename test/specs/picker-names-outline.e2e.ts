import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { handleEx, PAUSE } from '../helpers';

/**
 * Picker file names keep non-Markdown extensions, and outlines indent
 * headings by level instead of showing `#` marks (#171).
 *
 * Measured before the change: `:files` listed `Pick171.md`, `Pick171.png`
 * and `Pick171.pdf` all as `Pick171`, while Obsidian's quick switcher shows
 * `Pick171`, `Pick171.png`, `Pick171.pdf`. `gO` and `:outline` showed
 * `### Third level`, and `:outline` listed the headings deepest first. Its
 * match highlight was off by the hidden indent: the label carried indent and
 * `#` marks while the matcher scored the bare heading. Neovim 0.12.5's `gO`
 * lists `Top`, `  Second`, `    Third level` in document order.
 */

const NOTE = 'Pick171.md';
const PNG = 'Pick171.png';
const PDF = 'Pick171.pdf';
const ONE_PIXEL_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const NBSP = ' ';

async function pickerLabels(): Promise<string[]> {
    return (await browser.executeObsidian(() =>
        Array.from(
            document.querySelectorAll('.vim-motions-picker-item-label'),
        ).map((el) => el.textContent ?? ''),
    )) as string[];
}

async function openPicker(command: string, query = ''): Promise<void> {
    const result = await handleEx(command);
    expect(result.unknownCommand).toBe(false);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                () => !!document.querySelector('.vim-motions-picker'),
            )) as boolean,
        { timeout: 3000, interval: 100, timeoutMsg: `${command} did not open` },
    );
    if (query) await $('.vim-motions-picker-input').setValue(query);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function closeModals(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('picker file names and outlines (#171)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(
            async (
                { app },
                args: { note: string; png: string; pdf: string; bytes: string },
            ) => {
                await app.vault.adapter.write(
                    args.note,
                    '# Top\n\ntext\n\n## Second\n\n### Third level\n\n## Two again\n',
                );
                const raw = atob(args.bytes);
                const png = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) png[i] = raw.charCodeAt(i);
                await app.vault.adapter.writeBinary(args.png, png.buffer);
                await app.vault.adapter.writeBinary(
                    args.pdf,
                    new ArrayBuffer(8),
                );
            },
            { note: NOTE, png: PNG, pdf: PDF, bytes: ONE_PIXEL_PNG },
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    beforeEach(async function () {
        await obsidianPage.openFile(NOTE);
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    afterEach(async function () {
        await closeModals();
    });

    after(async function () {
        await browser.executeObsidian(
            async ({ app }, files: string[]) => {
                for (const f of files) {
                    if (await app.vault.adapter.exists(f)) {
                        await app.vault.adapter.remove(f);
                    }
                }
            },
            [NOTE, PNG, PDF],
        );
    });

    it(':files keeps the extension of a file that is not a note', async function () {
        await openPicker('files', 'Pick171');

        const labels = await pickerLabels();

        expect(labels).toContain('Pick171');
        expect(labels).toContain('Pick171.png');
        expect(labels).toContain('Pick171.pdf');
        expect(labels).not.toContain('Pick171.md');
    });

    it(':buffers keeps it too', async function () {
        await browser.executeObsidian(async ({ app }, png: string) => {
            const file = app.vault.getFileByPath(png);
            if (file) await app.workspace.getLeaf('tab').openFile(file);
        }, PNG);
        await obsidianPage.openFile(NOTE);
        await openPicker('buffers');

        const labels = await pickerLabels();

        expect(labels).toContain('Pick171.png');
        expect(labels).toContain('Pick171');
    });

    it('gO indents headings by level, in document order, without # marks', async function () {
        await browser.keys(['Escape', 'g', 'O']);
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(
                    () =>
                        document.querySelectorAll(
                            '.vim-motions-prompt-modal-suggestion-label',
                        ).length > 0,
                )) as boolean,
            { timeout: 3000, interval: 100, timeoutMsg: 'gO did not open' },
        );

        const labels = (await browser.executeObsidian(() =>
            Array.from(
                document.querySelectorAll(
                    '.vim-motions-prompt-modal-suggestion-label',
                ),
            ).map((el) => el.textContent ?? ''),
        )) as string[];

        expect(labels).toEqual([
            'Top',
            `${NBSP.repeat(2)}Second`,
            `${NBSP.repeat(4)}Third level`,
            `${NBSP.repeat(2)}Two again`,
        ]);
    });

    it(':outline does the same, two characters per level', async function () {
        await openPicker('outline');

        const rows = (await browser.executeObsidian(() =>
            Array.from(
                document.querySelectorAll<HTMLElement>(
                    '.vim-motions-picker-item-label',
                ),
            ).map((el) => ({
                text: el.textContent ?? '',
                indent: parseFloat(
                    getComputedStyle(el, '::before').marginInlineEnd,
                ),
                ch: (() => {
                    const probe = el.createSpan({ text: '0' });
                    probe.style.setProperty('position', 'absolute');
                    const width = probe.getBoundingClientRect().width;
                    probe.remove();
                    return width;
                })(),
            })),
        )) as { text: string; indent: number; ch: number }[];

        expect(rows.map((r) => r.text)).toEqual([
            'Top',
            'Second',
            'Third level',
            'Two again',
        ]);
        expect(rows.map((r) => Math.round(r.indent / r.ch))).toEqual([
            0, 2, 4, 2,
        ]);
    });

    it(':outline highlights the characters that matched', async function () {
        await openPicker('outline', 'thi');

        const marked = (await browser.executeObsidian(() =>
            Array.from(
                document.querySelectorAll(
                    '.vim-motions-picker-item-label mark',
                ),
            )
                .map((el) => el.textContent ?? '')
                .join(''),
        )) as string;

        expect(marked.toLowerCase()).toBe('thi');
    });
});
