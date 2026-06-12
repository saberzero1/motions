import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 8: Ex command line DOM structure', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should discover the ex command line DOM element when : is pressed', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            view.editor.focus();
            return { focused: true };
        });
        expect(result).toHaveProperty('focused', true);
        await browser.pause(300);

        await browser.keys(['Escape']);
        await browser.pause(100);
        await browser.keys([':']);
        await browser.pause(500);

        const domInfo = await browser.execute(() => {
            const dialog = activeDocument.querySelector('.cm-vim-panel');
            const input = dialog?.querySelector('input');
            const allInputs = Array.from(
                activeDocument.querySelectorAll(
                    '.cm-vim-panel input, .cm-vim-panel textarea',
                ),
            );

            return {
                hasPanel: !!dialog,
                panelClasses: dialog?.className ?? null,
                panelTagName: dialog?.tagName ?? null,
                hasInput: !!input,
                inputType: input?.type ?? null,
                inputTagName: input?.tagName ?? null,
                inputClasses: input?.className ?? null,
                allInputCount: allInputs.length,
                allInputTags: allInputs.map((el) => ({
                    tag: el.tagName,
                    cls: el.className,
                    type: (el as HTMLInputElement).type ?? null,
                })),
                panelHTML: dialog?.innerHTML?.slice(0, 500) ?? null,
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Ex command line DOM:', JSON.stringify(domInfo, null, 2));

        await browser.keys(['Escape']);
        await browser.pause(200);

        expect(typeof domInfo.hasPanel).toBe('boolean');
    });
});
