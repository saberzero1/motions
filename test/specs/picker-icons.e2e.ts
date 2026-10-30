import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { handleEx, PAUSE } from '../helpers';

/**
 * File pickers draw an icon per file type, from SVG data URIs in
 * `styles.css` used as masks and painted in theme colours (#171).
 *
 * Measured before the change: no picker item carried an icon.
 */

const FILES = [
    'IconPick.md',
    'IconPick.pdf',
    'IconPick.png',
    'IconPick.canvas',
    'IconPick.excalidraw.md',
    'IconPick.xyz',
];

interface Icon {
    ext: string | null;
    mask: string;
    color: string;
    width: number;
    display: string;
}

async function icons(): Promise<Record<string, Icon>> {
    return (await browser.executeObsidian(() => {
        const out: Record<string, Icon> = {};
        for (const item of Array.from(
            document.querySelectorAll('.vim-motions-picker-item'),
        )) {
            const label = item.querySelector('.vim-motions-picker-item-label');
            const icon = label?.querySelector<HTMLElement>(
                '.vim-motions-picker-file-icon',
            );
            if (!label || !icon) continue;
            const style = getComputedStyle(icon);
            out[label.textContent ?? ''] = {
                ext: icon.getAttribute('data-ext'),
                mask: style.maskImage || style.webkitMaskImage,
                color: style.backgroundColor,
                width: icon.getBoundingClientRect().width,
                display: style.display,
            };
        }
        return out;
    })) as Record<string, Icon>;
}

async function themeColor(variable: string): Promise<string> {
    return (await browser.executeObsidian((_ctx, v: string) => {
        const probe = document.body.createDiv();
        probe.style.setProperty('background-color', `var(${v})`);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
    }, variable)) as string;
}

async function openFiles(): Promise<void> {
    await browser.keys(['Escape']);
    const result = await handleEx('files');
    expect(result.unknownCommand).toBe(false);
    await $('.vim-motions-picker-input').setValue('IconPick');
    await browser.waitUntil(
        async () => Object.keys(await icons()).length >= FILES.length,
        { timeout: 3000, interval: 100, timeoutMsg: 'icons not shown' },
    );
}

describe('picker file icons (#171)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.executeObsidian(async ({ app }, files: string[]) => {
            for (const f of files) {
                if (f.endsWith('.md')) await app.vault.adapter.write(f, 'x\n');
                else await app.vault.adapter.writeBinary(f, new ArrayBuffer(8));
            }
        }, FILES);
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.executeObsidian(() => {
            document.body.style.removeProperty('--vim-motions-icon-pdf-color');
            document.body.removeClass(
                'vim-motions-picker-no-icons',
                'vim-motions-picker-mono-icons',
            );
        });
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }, files: string[]) => {
            for (const f of files) {
                if (await app.vault.adapter.exists(f)) {
                    await app.vault.adapter.remove(f);
                }
            }
        }, FILES);
    });

    it('draws an icon per file type, each in its own colour', async function () {
        await openFiles();
        const shown = await icons();
        const red = await themeColor('--color-red');
        const muted = await themeColor('--text-muted');

        expect(shown['IconPick']?.ext).toBe('md');
        expect(shown['IconPick.excalidraw']?.ext).toBe('excalidraw');
        expect(shown['IconPick.pdf']?.color).toBe(red);
        expect(shown['IconPick.xyz']?.color).toBe(muted);
        for (const icon of Object.values(shown)) {
            expect(icon.mask).toContain('data:image/svg+xml');
            expect(icon.width).toBeGreaterThan(0);
        }
        const masks = new Set(Object.values(shown).map((i) => i.mask));
        expect(masks.size).toBe(FILES.length);
    });

    it('takes a colour from its override variable', async function () {
        await browser.executeObsidian(() => {
            document.body.style.setProperty(
                '--vim-motions-icon-pdf-color',
                'rgb(1, 2, 3)',
            );
        });
        await openFiles();

        expect((await icons())['IconPick.pdf']?.color).toBe('rgb(1, 2, 3)');
    });

    it('follows the Style Settings toggles', async function () {
        await browser.executeObsidian(() => {
            document.body.addClass('vim-motions-picker-mono-icons');
        });
        await openFiles();
        const mono = await icons();
        const muted = await themeColor('--text-muted');
        await browser.executeObsidian(() => {
            document.body.addClass('vim-motions-picker-no-icons');
        });
        const hidden = await icons();

        expect(mono['IconPick.pdf']?.color).toBe(muted);
        expect(hidden['IconPick.pdf']?.display).toBe('none');
    });
});
