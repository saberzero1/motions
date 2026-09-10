import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../helpers';

const REPORTER_CONTENT = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
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
    '',
    '',
].join('\n');

const LINES = REPORTER_CONTENT.split('\n');

describe('gk column drift regression (#26)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('gk from line 15 (long) through h2 (line 14) to h2 (line 13)', async function () {
        await setupEditor(REPORTER_CONTENT, { line: 15, ch: 10 });
        await vimKeys('l');

        const positions: Array<{ line: number; ch: number }> = [];
        for (let i = 0; i < 15; i++) {
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            positions.push(pos);
            if (pos.line <= 11) break;
        }

        console.log('h2-longline-h2 navigation:');
        for (const p of positions) {
            console.log(
                `  line:${p.line} ch:${p.ch} ("${LINES[p.line]!.slice(0, 30)}")`,
            );
        }

        const visited13 = positions.some((p) => p.line === 13);
        const visited14 = positions.some((p) => p.line === 14);
        expect(visited13).toBe(true);
        expect(visited14).toBe(true);
    });

    it('gj from top should not skip lines (full document)', async function () {
        await setupEditor(REPORTER_CONTENT, { line: 0, ch: 0 });
        await vimKeys('l');

        let prevLine = 0;
        const visited = new Set<number>([0]);
        const lastLine = LINES.length - 1;

        for (let i = 0; i < 60; i++) {
            await vimKeys('g', 'j');
            const pos = await getCursorPos();
            visited.add(pos.line);

            if (pos.line > prevLine + 1) {
                throw new Error(
                    `gj skipped from line ${prevLine} to line ${pos.line}`,
                );
            }

            prevLine = pos.line;
            if (pos.line === lastLine) break;
        }

        for (let line = 0; line <= lastLine; line++) {
            if (!visited.has(line)) {
                throw new Error(
                    `gj never visited line ${line} ("${LINES[line]!.slice(0, 30) || '(empty)'}")`,
                );
            }
        }
    });
});
