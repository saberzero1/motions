import { browser, expect } from '@wdio/globals';

/**
 * The table settings as Obsidian renders them.
 *
 * The table widget dropdown used to carry a full sentence per option — the
 * Reveal one ran to over 250 characters — which does not suit a dropdown. The
 * options are now short labels and the explanation is the setting's
 * description. Obsidian 1.13.7 renders the declarative settings page; the
 * pre-1.13 imperative page reads the same `TABLE_WIDGET_OPTIONS` and
 * `TABLE_WIDGET_DESCRIPTION` constants in `src/settings.ts`.
 */

interface RenderedSetting {
    found: boolean;
    options: [string, string][];
    description: string;
    toggles: number;
}

async function openGeneralSettings(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const setting = (
            app as unknown as {
                setting: { open(): void; openTabById(id: string): unknown };
            }
        ).setting;
        setting.open();
        setting.openTabById('vim-motions');
    });
    await browser.pause(400);
    await browser.executeObsidian(() => {
        const general = Array.from(
            document.querySelectorAll('.setting-item.mod-navigable'),
        ).find(
            (row) =>
                row.querySelector('.setting-item-name')?.textContent ===
                'General',
        );
        (general as HTMLElement | undefined)?.click();
    });
    await browser.pause(400);
}

async function renderedSetting(name: string): Promise<RenderedSetting> {
    return (await browser.executeObsidian((_context, wanted: string) => {
        const item = Array.from(
            document.querySelectorAll('.setting-item'),
        ).find(
            (el) =>
                el.querySelector('.setting-item-name')?.textContent === wanted,
        );
        if (!item) {
            return { found: false, options: [], description: '', toggles: 0 };
        }
        return {
            found: true,
            options: Array.from(
                item.querySelectorAll('select:not(.is-measuring) option'),
            ).map(
                (o) =>
                    [
                        (o as HTMLOptionElement).value,
                        (o.textContent ?? '').trim(),
                    ] as [string, string],
            ),
            description:
                item.querySelector('.setting-item-description')?.textContent ??
                '',
            toggles: item.querySelectorAll('.checkbox-container').length,
        };
    }, name)) as RenderedSetting;
}

describe('Table settings as rendered', function () {
    this.timeout(60000);

    // The suite's afterTest hook closes every modal, the settings included.
    beforeEach(async function () {
        await openGeneralSettings();
    });

    after(async function () {
        await browser.executeObsidian(({ app }) => {
            (app as unknown as { setting: { close(): void } }).setting.close();
        });
    });

    it('lists the table widget modes as short labels', async function () {
        const widget = await renderedSetting('Table widget in live preview');

        expect(widget.found).toBe(true);
        expect(widget.options).toEqual([
            ['native', 'Native'],
            ['reveal', 'Reveal (experimental)'],
            ['raw', 'Raw (deprecated)'],
        ]);
        // What each mode does moved into the description.
        expect(widget.description).toContain('Native:');
        expect(widget.description).toContain('Reveal:');
        expect(widget.description).toContain('Raw: deprecated');
    });

    it('offers the realign setting as a toggle', async function () {
        const realign = await renderedSetting(
            'Realign tables after insert mode',
        );

        expect(realign.found).toBe(true);
        expect(realign.toggles).toBe(1);
        expect(realign.description).toContain('insert mode');
    });
});
