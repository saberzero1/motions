import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, PAUSE } from '../../helpers';

const REPORTER_CONTENT = [
    '', // 0
    '', // 1
    '', // 2
    '', // 3
    '', // 4
    '', // 5
    '', // 6
    '', // 7
    '', // 8
    '', // 9
    '', // 10
    '## testing', // 11
    '', // 12
    '## testing', // 13
    '## testing', // 14
    'testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting', // 15
    '## testing', // 16
    '## testing', // 17
    '## testing', // 18
    '## testing', // 19
    '', // 20
    '', // 21
    '', // 22
].join('\n');

const LINES = REPORTER_CONTENT.split('\n');

describe('Spike: gk issue #26 reporter reproduction', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('gk from bottom should not skip lines (full document)', async function () {
        const lastLine = LINES.length - 1;
        await setupEditor(REPORTER_CONTENT, { line: lastLine, ch: 0 });
        await vimKeys('l');

        let prevLine = lastLine;
        const visited = new Set<number>([lastLine]);

        for (let i = 0; i < 60; i++) {
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            visited.add(pos.line);

            if (pos.line < prevLine - 1) {
                throw new Error(
                    `gk skipped from line ${prevLine} ("${LINES[prevLine].slice(0, 30)}") to line ${pos.line} ("${LINES[pos.line].slice(0, 30)}")`,
                );
            }

            prevLine = pos.line;
            if (pos.line === 0) break;
        }

        for (let line = 0; line <= lastLine; line++) {
            if (!visited.has(line)) {
                throw new Error(
                    `gk never visited line ${line} ("${LINES[line].slice(0, 30) || '(empty)'}")`,
                );
            }
        }
    });

    it('gk from long line through h2 headings should not skip', async function () {
        await setupEditor(REPORTER_CONTENT, { line: 19, ch: 5 });
        await vimKeys('l');

        let prevLine = 19;
        const visited = new Set<number>([19]);

        for (let i = 0; i < 40; i++) {
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            visited.add(pos.line);

            if (pos.line < prevLine - 1) {
                throw new Error(
                    `gk skipped from line ${prevLine} to line ${pos.line}`,
                );
            }

            if (
                pos.line < prevLine &&
                LINES[pos.line].length > 0 &&
                pos.ch === 0
            ) {
                console.log(
                    `WARN: gk reset to col 0 on line ${pos.line} ("${LINES[pos.line].slice(0, 30)}")`,
                );
            }

            prevLine = pos.line;
            if (pos.line === 11) break;
        }

        for (let line = 11; line <= 19; line++) {
            if (!visited.has(line)) {
                throw new Error(
                    `gk never visited line ${line} ("${LINES[line].slice(0, 30) || '(empty)'}")`,
                );
            }
        }
    });

    it('gk through consecutive h2 headings (lines 16-19)', async function () {
        await setupEditor(REPORTER_CONTENT, { line: 19, ch: 5 });
        await vimKeys('l');

        const positions: Array<{ line: number; ch: number }> = [];
        for (let i = 0; i < 10; i++) {
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            positions.push(pos);
            if (pos.line <= 16) break;
        }

        console.log('Consecutive h2 navigation:');
        for (const p of positions) {
            console.log(
                `  line:${p.line} ch:${p.ch} ("${LINES[p.line].slice(0, 30)}")`,
            );
        }
    });

    it('gk over long wrapped line (line 15) should step through display lines', async function () {
        await setupEditor(REPORTER_CONTENT, { line: 16, ch: 5 });
        await vimKeys('l');

        const positions: Array<{ line: number; ch: number }> = [];
        for (let i = 0; i < 20; i++) {
            await vimKeys('g', 'k');
            const pos = await getCursorPos();
            positions.push(pos);
            if (pos.line <= 13) break;
        }

        console.log('Long line navigation:');
        for (const p of positions) {
            console.log(
                `  line:${p.line} ch:${p.ch} ("${LINES[p.line].slice(0, 30)}")`,
            );
        }

        const visitedLine15 = positions.some((p) => p.line === 15);
        expect(visitedLine15).toBe(true);
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
                `  line:${p.line} ch:${p.ch} ("${LINES[p.line].slice(0, 30)}")`,
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
                    `gj never visited line ${line} ("${LINES[line].slice(0, 30) || '(empty)'}")`,
                );
            }
        }
    });
});
