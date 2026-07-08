import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, PAUSE } from '../../helpers';

describe('Spike: gk column drift on headings (#26)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should measure column drift across heading levels', async function () {
        const headings = [
            '# Heading One Level',
            '## Heading Two Level',
            '### Heading Three Level',
            '#### Heading Four Level',
            '##### Heading Five Level',
            '###### Heading Six Level',
        ];

        for (const heading of headings) {
            const content = [
                'abcdefghijklmnopqrstuvwxyz0123456789',
                heading,
                'abcdefghijklmnopqrstuvwxyz0123456789',
            ].join('\n');

            await setupEditor(content, { line: 2, ch: 15 });
            await vimKeys('l');

            const startPos = await getCursorPos();

            await vimKeys('g', 'k');
            const onHeading = await getCursorPos();

            await vimKeys('g', 'k');
            const aboveHeading = await getCursorPos();

            console.log(
                `${heading.split(' ')[0]} | ` +
                    `start ch:${startPos.ch} → ` +
                    `heading ch:${onHeading.ch} (Δ${startPos.ch - onHeading.ch}) → ` +
                    `above ch:${aboveHeading.ch} (Δ${startPos.ch - aboveHeading.ch})`,
            );
        }
    });

    it('should measure column drift with charCoords comparison', async function () {
        const content = [
            'abcdefghijklmnopqrstuvwxyz0123456789',
            '### Heading Three Level',
            'abcdefghijklmnopqrstuvwxyz0123456789',
        ].join('\n');

        await setupEditor(content, { line: 2, ch: 15 });
        await vimKeys('l');

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return null;
            const cm6 =
                (view.editor as any).cm?.cm6 || (view.editor as any).cm?.editor;
            if (!cm6) return null;

            const doc = cm6.state.doc;

            const line3 = doc.line(3);
            const line2 = doc.line(2);
            const line1 = doc.line(1);

            const ch16OffsetLine3 = line3.from + 16;
            const ch16OffsetLine2 = line2.from + 16;
            const ch16OffsetLine1 = line1.from + 16;

            const coords3 = cm6.coordsAtPos(ch16OffsetLine3);
            const coords2 = cm6.coordsAtPos(ch16OffsetLine2);
            const coords1 = cm6.coordsAtPos(ch16OffsetLine1);

            const rect = cm6.contentDOM.getBoundingClientRect();

            return {
                line3_ch16_x: coords3
                    ? Math.round(coords3.left - rect.left)
                    : null,
                line2_ch16_x: coords2
                    ? Math.round(coords2.left - rect.left)
                    : null,
                line1_ch16_x: coords1
                    ? Math.round(coords1.left - rect.left)
                    : null,
                defaultLineHeight: Math.round(cm6.defaultLineHeight),
                line1Height: Math.round(cm6.lineBlockAt(line1.from).height),
                line2Height: Math.round(cm6.lineBlockAt(line2.from).height),
                line3Height: Math.round(cm6.lineBlockAt(line3.from).height),
            };
        });

        console.log('Coordinate analysis:', JSON.stringify(result, null, 2));
    });

    it('should quantify drift: gk preserves pixel X, not character index', async function () {
        const content = [
            'abcdefghijklmnopqrstuvwxyz0123456789',
            '### Heading Three Level',
            'abcdefghijklmnopqrstuvwxyz0123456789',
        ].join('\n');

        for (const startCh of [5, 10, 15, 20, 25, 30]) {
            await setupEditor(content, { line: 2, ch: startCh });
            await vimKeys('l');

            const start = await getCursorPos();
            await vimKeys('g', 'k');
            const onHeading = await getCursorPos();
            await vimKeys('g', 'k');
            const above = await getCursorPos();

            console.log(
                `startCh:${start.ch} → heading ch:${onHeading.ch} (Δ${start.ch - onHeading.ch}) → above ch:${above.ch} (Δ${start.ch - above.ch})`,
            );
        }
    });

    it('should verify: gk then gj returns to same column (round-trip)', async function () {
        const content = [
            'abcdefghijklmnopqrstuvwxyz0123456789',
            '### Heading Three Level',
            'abcdefghijklmnopqrstuvwxyz0123456789',
        ].join('\n');

        for (const startCh of [5, 10, 15, 20]) {
            await setupEditor(content, { line: 2, ch: startCh });
            await vimKeys('l');
            const start = await getCursorPos();

            await vimKeys('g', 'k');
            await vimKeys('g', 'k');
            const above = await getCursorPos();

            await vimKeys('g', 'j');
            await vimKeys('g', 'j');
            const roundTrip = await getCursorPos();

            console.log(
                `ch:${start.ch} → up2 ch:${above.ch} → down2 ch:${roundTrip.ch} | ` +
                    `round-trip Δ:${start.ch - roundTrip.ch}`,
            );
        }
    });
});
