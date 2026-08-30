import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getNotices, dismissNotices, PAUSE } from '../helpers';

type ExecResult = { success: true } | { error: string };

async function handleEx(command: string): Promise<ExecResult> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as ExecResult;
}

describe('Oil ex commands outside Oil buffer (#152)', function () {
    before(async function () {
        await obsidianPage.openFile('Welcome.md');
    });

    beforeEach(async function () {
        await setupEditor('hello world', { line: 0, ch: 0 });
        await dismissNotices();
    });

    const oilExCommands = [
        { full: 'oilopen', short: 'oilo' },
        { full: 'oilparent', short: 'oilp' },
        { full: 'oilroot', short: 'oilro' },
        { full: 'oilclose', short: 'oilcl' },
        { full: 'oilrefresh', short: 'oilref' },
        { full: 'oilopentab', short: 'oilopent' },
        { full: 'oiltogglehidden', short: 'oilt' },
        { full: 'oilcyclesort', short: 'oilcy' },
        { full: 'oilyankpath', short: 'oily' },
        { full: 'oilreveal', short: 'oilrev' },
        { full: 'oilhelp', short: 'oilh' },
    ];

    for (const cmd of oilExCommands) {
        it(`should show notice when :${cmd.short} is used outside Oil`, async function () {
            const result = await handleEx(cmd.short);
            expect(result).toHaveProperty('success', true);

            await browser.pause(PAUSE.EDITOR_SETTLE);
            const notices = await getNotices();
            const oilNotice = notices.find((n) =>
                n.includes('only works inside an Oil buffer'),
            );
            expect(oilNotice).toBeDefined();
        });
    }

    it('should not error with "not an editor command" for :oilo', async function () {
        const result = await handleEx('oilo');
        expect(result).toHaveProperty('success', true);
    });
});
