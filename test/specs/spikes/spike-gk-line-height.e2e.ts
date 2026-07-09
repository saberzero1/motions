import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, PAUSE } from '../../helpers';

describe('Spike: gk line height vs font size (#26)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should measure line block heights for headings vs body text', async function () {
        const content = [
            'body text line',
            '## heading two',
            '### heading three',
            '#### heading four',
            'body text line',
        ].join('\n');

        await setupEditor(content, { line: 0, ch: 0 });

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return null;
            const cm6 =
                (view.editor as any).cm?.cm6 || (view.editor as any).cm?.editor;
            if (!cm6) return null;

            const doc = cm6.state.doc;
            const defaultLH = cm6.defaultLineHeight;
            const lines: Array<{
                num: number;
                text: string;
                blockHeight: number;
                blockTop: number;
                blockBottom: number;
                ratio: number;
            }> = [];

            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                const block = cm6.lineBlockAt(line.from);
                lines.push({
                    num: i,
                    text: line.text.slice(0, 30),
                    blockHeight: Math.round(block.height * 100) / 100,
                    blockTop: Math.round(block.top * 100) / 100,
                    blockBottom:
                        Math.round((block.top + block.height) * 100) / 100,
                    ratio: Math.round((block.height / defaultLH) * 100) / 100,
                });
            }

            return {
                defaultLineHeight: Math.round(defaultLH * 100) / 100,
                lines,
            };
        });

        console.log('Line block analysis:', JSON.stringify(result, null, 2));
    });

    it('should trace moveVertically steps on h2 heading', async function () {
        const content = [
            'body text above',
            '## heading two',
            'body text below',
        ].join('\n');

        await setupEditor(content, { line: 2, ch: 5 });
        await vimKeys('l');

        const trace: string[] = [];
        for (let i = 0; i < 6; i++) {
            const before = await getCursorPos();
            await vimKeys('g', 'k');
            const after = await getCursorPos();
            const moved = before.line !== after.line || before.ch !== after.ch;
            trace.push(
                `gk #${i + 1}: (${before.line},${before.ch}) → (${after.line},${after.ch}) ${moved ? '' : 'STUCK'}`,
            );
            if (after.line === 0) break;
        }

        console.log('moveVertically trace on h2:');
        for (const t of trace) console.log('  ' + t);
    });

    it('should measure reporter content line heights', async function () {
        const content = [
            '',
            '',
            '## testing',
            '',
            '## testing',
            '## testing',
            'testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting',
            '## testing',
            '## testing',
            '## testing',
            '## testing',
            '',
        ].join('\n');

        await setupEditor(content, { line: 0, ch: 0 });

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return null;
            const cm6 =
                (view.editor as any).cm?.cm6 || (view.editor as any).cm?.editor;
            if (!cm6) return null;

            const doc = cm6.state.doc;
            const defaultLH = cm6.defaultLineHeight;
            const lines: Array<{
                num: number;
                text: string;
                height: number;
                ratio: string;
            }> = [];

            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                const block = cm6.lineBlockAt(line.from);
                lines.push({
                    num: i,
                    text: line.text.slice(0, 25) || '(empty)',
                    height: Math.round(block.height * 10) / 10,
                    ratio: (block.height / defaultLH).toFixed(2) + 'x',
                });
            }

            return {
                defaultLineHeight: Math.round(defaultLH * 10) / 10,
                lines,
            };
        });

        console.log(
            'Reporter content heights:',
            JSON.stringify(result, null, 2),
        );
    });
});
