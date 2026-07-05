import { NeovimClient } from './client.js';
import { saveGoldenFile, type GoldenCase } from './golden.js';
import { SUITES, type TestCaseDefinition } from './test-definitions.js';

async function recordSuite(
    nvim: NeovimClient,
    suiteName: string,
    cases: TestCaseDefinition[],
    nvimVersion: string,
): Promise<void> {
    const goldenCases: GoldenCase[] = [];

    for (const tc of cases) {
        process.stderr.write(`  ${tc.name}...`);
        await nvim.input('\x1b\x1b');
        await nvim.setContent(tc.content);
        await nvim.setCursor(tc.cursor.line, tc.cursor.ch);
        if (tc.luaSetup) {
            await nvim.executeLua(tc.luaSetup);
        }
        await nvim.input(tc.keys);

        process.stderr.write(' ok\n');
        goldenCases.push({
            name: tc.name,
            initial: { content: tc.content, cursor: tc.cursor },
            keys: tc.keys,
            result: {
                content: await nvim.getContent(),
                cursor: await nvim.getCursor(),
                mode: await nvim.getMode(),
            },
        });
    }

    saveGoldenFile({
        suite: suiteName,
        neovim_version: nvimVersion,
        recorded_at: new Date().toISOString(),
        cases: goldenCases,
    });

    process.stderr.write(
        `Recorded ${goldenCases.length} cases for ${suiteName}\n`,
    );
}

async function main() {
    const filterSuite = process.argv
        .find((a) => a.startsWith('--suite='))
        ?.split('=')[1];

    const nvim = new NeovimClient();
    await nvim.start();
    const nvimVersion = await nvim.getVersion();
    process.stderr.write(`Neovim ${nvimVersion}\n\n`);

    for (const suite of SUITES) {
        if (filterSuite && suite.name !== filterSuite) continue;
        await recordSuite(nvim, suite.name, suite.cases, nvimVersion);
    }

    await nvim.stop();
    process.stderr.write('\nDone.\n');
}

main().catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
});
