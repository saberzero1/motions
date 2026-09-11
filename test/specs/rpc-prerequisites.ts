import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const MIN_API_LEVEL = 12;

interface SuiteContext {
    skip(): void;
}

interface RpcPrerequisiteOptions {
    fixtures?: string[];
}

function prerequisiteFailure(fixtures: string[]): string | null {
    const missingFixture = fixtures.find((fixture) => !fs.existsSync(fixture));
    if (missingFixture) {
        return `${missingFixture} is absent. Run \`bash scripts/fetch-test-plugins.sh\`.`;
    }

    const binary = process.env.NVIM_TEST_BINARY?.trim() || 'nvim';
    const probe = spawnSync(
        binary,
        [
            '--clean',
            '--headless',
            '-u',
            'NONE',
            '-c',
            'lua io.write(vim.version().api_level)',
            '-c',
            'qa',
        ],
        { encoding: 'utf8', timeout: 10000 },
    );
    if (probe.error) {
        return `Neovim is unavailable at ${binary}: ${probe.error.message}`;
    }
    if (probe.status !== 0) {
        const detail = (probe.stderr || probe.stdout).trim();
        return `Neovim probe failed at ${binary} (exit ${probe.status})${detail ? `: ${detail}` : ''}`;
    }

    const apiLevel = Number.parseInt(probe.stdout.trim(), 10);
    if (!Number.isInteger(apiLevel) || apiLevel < MIN_API_LEVEL) {
        return `Neovim at ${binary} has API level ${Number.isInteger(apiLevel) ? apiLevel : 'unknown'}; API level ${MIN_API_LEVEL} (Neovim 0.12+) is required.`;
    }
    return null;
}

export function requireRpcPrerequisites(
    context: SuiteContext,
    options: RpcPrerequisiteOptions = {},
): void {
    const failure = prerequisiteFailure(options.fixtures ?? []);
    if (!failure) return;
    console.warn(`SKIP: ${failure}`);
    context.skip();
}
