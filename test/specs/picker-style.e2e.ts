import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { handleEx, PAUSE } from '../helpers';

/**
 * The picker's fonts, sizes and layout follow CSS variables that the Style
 * Settings plugin or a snippet can set, and its first result clears the
 * floating "Results" title (#171).
 *
 * Measured before the change: the first result's text overlapped the title.
 * Unset, every variable leaves the picker as it was, which the first
 * scenario checks against the previous values.
 */

const VARIABLES = [
    '--vim-motions-picker-font',
    '--vim-motions-picker-font-size',
    '--vim-motions-picker-preview-font-size',
    '--vim-motions-picker-width',
    '--vim-motions-picker-height',
    '--vim-motions-picker-results-width',
];

interface Measured {
    labelSize: string;
    labelFont: string;
    monoFont: string;
    descriptionSize: string;
    modalWidth: number;
    defaultModalWidth: number;
    resultsMaxHeight: number;
    viewportHeight: number;
    viewportWidth: number;
    titleBottom: number;
    firstItemTop: number;
    labelWhiteSpace: string;
    labelOverflow: string;
}

async function openFiles(): Promise<void> {
    await browser.keys(['Escape']);
    const result = await handleEx('files');
    expect(result.unknownCommand).toBe(false);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                () =>
                    document.querySelectorAll('.vim-motions-picker-item-label')
                        .length > 0,
            )) as boolean,
        { timeout: 3000, interval: 100, timeoutMsg: ':files did not open' },
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function measure(): Promise<Measured> {
    return (await browser.executeObsidian(() => {
        const modal = document.querySelector<HTMLElement>(
            '.vim-motions-picker.modal',
        )!;
        const label = document.querySelector<HTMLElement>(
            '.vim-motions-picker-item-label',
        )!;
        const description = document.querySelector<HTMLElement>(
            '.vim-motions-picker-item-description',
        );
        const results = document.querySelector<HTMLElement>(
            '.vim-motions-picker-results',
        )!;
        const title = results.parentElement!.querySelector<HTMLElement>(
            '.vim-motions-picker-title',
        )!;
        // The width the picker had before the variable existed.
        const probe = modal.parentElement!.createDiv();
        probe.style.setProperty(
            'width',
            'min(var(--dialog-max-width), calc(var(--dialog-width) * 2))',
        );
        probe.style.setProperty('position', 'absolute');
        const defaultModalWidth = probe.getBoundingClientRect().width;
        probe.style.setProperty('font-family', 'var(--font-monospace)');
        const monoFont = getComputedStyle(probe).fontFamily;
        probe.remove();
        const labelStyle = getComputedStyle(label);
        return {
            labelSize: labelStyle.fontSize,
            labelFont: labelStyle.fontFamily,
            monoFont,
            descriptionSize: description
                ? getComputedStyle(description).fontSize
                : '',
            modalWidth: modal.getBoundingClientRect().width,
            defaultModalWidth,
            resultsMaxHeight: parseFloat(getComputedStyle(results).maxHeight),
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            titleBottom: title.getBoundingClientRect().bottom,
            firstItemTop: label.getBoundingClientRect().top,
            labelWhiteSpace: labelStyle.whiteSpace,
            labelOverflow: labelStyle.textOverflow,
        };
    })) as Measured;
}

async function setBody(
    vars: Record<string, string>,
    truncate = false,
): Promise<void> {
    await browser.executeObsidian(
        (_ctx, args: { vars: Record<string, string>; truncate: boolean }) => {
            for (const [name, value] of Object.entries(args.vars)) {
                document.body.style.setProperty(name, value);
            }
            document.body.toggleClass(
                'vim-motions-picker-truncate',
                args.truncate,
            );
        },
        { vars, truncate },
    );
}

describe('picker styling (#171)', function () {
    this.timeout(120000);

    before(async function () {
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.executeObsidian((_ctx, names: string[]) => {
            for (const name of names) document.body.style.removeProperty(name);
            document.body.removeClass('vim-motions-picker-truncate');
        }, VARIABLES);
    });

    it('is unchanged with no variable set, and the first result clears the title', async function () {
        await openFiles();
        const m = await measure();

        expect(m.labelSize).toBe('13px');
        expect(m.descriptionSize).toBe('12px');
        expect(m.labelFont).toBe(m.monoFont);
        expect(Math.abs(m.modalWidth - m.defaultModalWidth)).toBeLessThan(1);
        expect(Math.round(m.resultsMaxHeight)).toBe(
            Math.round(m.viewportHeight * 0.5),
        );
        expect(m.labelWhiteSpace).not.toBe('nowrap');
        expect(m.firstItemTop).toBeGreaterThanOrEqual(m.titleBottom);
    });

    it('follows the variables and the truncation class', async function () {
        await setBody(
            {
                '--vim-motions-picker-font': 'serif',
                '--vim-motions-picker-font-size': '18px',
                '--vim-motions-picker-width': '60vw',
                '--vim-motions-picker-height': '30vh',
            },
            true,
        );
        await openFiles();
        const m = await measure();

        expect(m.labelFont).toBe('serif');
        expect(m.labelSize).toBe('18px');
        expect(m.descriptionSize).toBe('17px');
        expect(Math.round(m.modalWidth)).toBe(
            Math.round(m.viewportWidth * 0.6),
        );
        expect(Math.round(m.resultsMaxHeight)).toBe(
            Math.round(m.viewportHeight * 0.3),
        );
        expect(m.labelWhiteSpace).toBe('nowrap');
        expect(m.labelOverflow).toBe('ellipsis');
    });

    it('sizes the preview text and the results column beside it', async function () {
        await setBody({
            '--vim-motions-picker-preview-font-size': '15px',
            '--vim-motions-picker-results-width': '50%',
        });
        await openFiles();
        const layout = (await browser.executeObsidian(() => {
            const body = document.querySelector<HTMLElement>(
                '.vim-motions-picker-body',
            );
            const first = body?.firstElementChild as HTMLElement | null;
            const preview = document.querySelector<HTMLElement>(
                '.vim-motions-picker-preview pre, .vim-motions-picker-preview-content',
            );
            return {
                hasPreview: !!body && !!first,
                share:
                    body && first
                        ? first.getBoundingClientRect().width /
                          body.getBoundingClientRect().width
                        : 0,
                previewSize: preview ? getComputedStyle(preview).fontSize : '',
            };
        })) as { hasPreview: boolean; share: number; previewSize: string };

        expect(layout.hasPreview).toBe(true);
        expect(layout.share).toBeGreaterThan(0.45);
        expect(layout.previewSize).toBe('15px');
    });
});
