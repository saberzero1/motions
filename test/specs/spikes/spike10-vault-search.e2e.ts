import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Spike 10: Vault search performance', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should measure prepareSimpleSearch performance', async function () {
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const prepareSimpleSearch = (
                obsidian as unknown as {
                    prepareSimpleSearch: (
                        query: string,
                    ) => (text: string) => { score: number } | null;
                }
            ).prepareSimpleSearch;

            if (!prepareSimpleSearch) {
                return {
                    error: 'prepareSimpleSearch not found in obsidian module',
                };
            }

            const files = app.vault.getMarkdownFiles();
            const search = prepareSimpleSearch('test');

            const startTime = performance.now();
            let matchCount = 0;

            const fileResults: { path: string; score: number }[] = [];
            for (const file of files) {
                const result = search(file.basename);
                if (result) {
                    matchCount++;
                    fileResults.push({ path: file.path, score: result.score });
                }
            }
            const filenameSearchTime = performance.now() - startTime;

            return {
                totalFiles: files.length,
                matchCount,
                filenameSearchTimeMs:
                    Math.round(filenameSearchTime * 100) / 100,
                hasPrepareSimpleSearch: true,
                sampleResults: fileResults.slice(0, 5),
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Vault search performance:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('totalFiles');
    });

    it('should check if cachedRead is available for content search', async function () {
        const result = await browser.executeObsidian(({ app }) => {
            const files = app.vault.getMarkdownFiles();
            if (files.length === 0) return { error: 'No files in vault' };

            const firstFile = files[0];
            if (!firstFile) return { error: 'No first file' };

            const hasCachedRead = typeof app.vault.cachedRead === 'function';
            const hasRead = typeof app.vault.read === 'function';

            return {
                hasCachedRead,
                hasRead,
                firstFilePath: firstFile.path,
                vaultMethodNames: Object.getOwnPropertyNames(
                    Object.getPrototypeOf(app.vault),
                )
                    .filter(
                        (n) =>
                            n.includes('read') ||
                            n.includes('Read') ||
                            n.includes('search') ||
                            n.includes('Search'),
                    )
                    .sort(),
            };
        });

        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log(
            'Vault read capabilities:',
            JSON.stringify(result, null, 2),
        );

        expect(result).toHaveProperty('hasCachedRead');
    });
});
