import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    REQUIRED_API_LEVEL,
    REQUIRED_VERSION,
    neovimHandshakeFailureNotice,
    neovimStartFailureNotice,
} from '../../../src/rpc/neovim-connection';

// Issue #199. A Windows user got past the version gate on a Neovim that cannot
// run the companion Lua, and the resulting RPC error was reported as
//
//   Vim Motions: could not start Neovim at "C:\Neovim\bin\nvim.exe": Neovim RPC
//   error: [0,"Error executing lua: [string \"<nvim>\"]:867: invalid key:
//   on_range ... in function 'nvim_set_decoration_provider'"]. Check the
//   configured path and permissions.
//
// which describes a path problem that did not exist. Two separate defects meet
// there; this file holds the first. `REQUIRED_VERSION` advertises Neovim 0.12
// and the docs and README say 0.12, but `REQUIRED_API_LEVEL` was 12, which is
// Neovim *0.10*. Every 0.10 and 0.11 was admitted and then crashed on the first
// 0.12-only API the bridge reached.
//
// The fixtures below are measured rather than recalled, because an off-by-two
// in exactly this table is the defect.

const REPO_ROOT = resolve(__dirname, '../../..');
const COMPANION_LUA = join(REPO_ROOT, 'src/rpc/companion.lua');

/**
 * Neovim release line to the `NVIM_API_LEVEL` it ships.
 *
 * Measured two independent ways, which agree:
 *
 *   $ nvim --clean --headless -u NONE \
 *       -c 'lua io.write(vim.version().api_level)' -c 'qa'
 *   v0.11.4 -> 13        v0.12.5 -> 14
 *
 * and `NVIM_API_LEVEL` in neovim's own `CMakeLists.txt` at the release tags:
 *   v0.9.5 -> 11   v0.10.0 -> 12   v0.11.0 -> 13   v0.12.0 -> 14
 */
const NEOVIM_API_LEVEL_BY_RELEASE: Readonly<Record<string, number>> = {
    '0.9': 11,
    '0.10': 12,
    '0.11': 13,
    '0.12': 14,
};

/**
 * The lowest api_level at which each `nvim_set_decoration_provider` key is
 * *proven* to be accepted.
 *
 * Measured one key per call against both real binaries:
 *
 *   nvim --clean --headless -u NONE -c "lua ... pcall(
 *       vim.api.nvim_set_decoration_provider,
 *       vim.api.nvim_create_namespace('p'),
 *       { [key] = function() return true end })"
 *
 *   0.11.4 (13): on_start on_buf on_win on_line on_end accepted,
 *                on_range rejected with `invalid key: on_range`
 *   0.12.5 (14): all six accepted
 *
 * The five classic keys predate 0.11 by several releases, so 13 understates
 * them. That is the safe direction for a gate: a proven-at bound can only ever
 * demand a higher floor than strictly necessary, never a lower one.
 *
 * A key `companion.lua` passes that is absent from this table fails the test
 * rather than defaulting to "old enough" — measure it and add it.
 */
const DECORATION_PROVIDER_KEY_PROVEN_AT: Readonly<Record<string, number>> = {
    on_start: 13,
    on_buf: 13,
    on_win: 13,
    on_line: 13,
    on_end: 13,
    on_range: 14,
};

/**
 * The keys `companion.lua` actually passes, read from the file rather than
 * restated, so adding a seventh key without measuring it fails here.
 */
function decorationProviderKeys(): string[] {
    const lines = readFileSync(COMPANION_LUA, 'utf8').split('\n');
    const start = lines.findIndex((line) =>
        line.includes('nvim_set_decoration_provider('),
    );
    expect(start).toBeGreaterThan(-1);
    const keys: string[] = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (line.startsWith('})')) break;
        const match = /^ {4}(\w+) = /.exec(line);
        if (match?.[1]) keys.push(match[1]);
    }
    expect(keys.length).toBeGreaterThan(0);
    return keys;
}

/** The api-level floor a sibling gate enforces, read from its own source. */
function declaredFloor(relativePath: string, pattern: RegExp): number {
    const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
    const match = pattern.exec(source);
    expect(match?.[1], `${relativePath} declares no API floor`).toBeDefined();
    return Number.parseInt(match?.[1] ?? '', 10);
}

describe('the Neovim api_level floor (#199)', () => {
    it('admits only versions that accept every decoration-provider key companion.lua passes', () => {
        const unmeasured = decorationProviderKeys().filter(
            (key) => DECORATION_PROVIDER_KEY_PROVEN_AT[key] === undefined,
        );
        expect(unmeasured).toEqual([]);

        const required = Object.fromEntries(
            decorationProviderKeys().map((key) => [
                key,
                DECORATION_PROVIDER_KEY_PROVEN_AT[key],
            ]),
        );
        const tooNew = Object.entries(required).filter(
            ([, level]) => (level ?? 0) > REQUIRED_API_LEVEL,
        );
        expect(
            tooNew,
            `floor is api_level ${REQUIRED_API_LEVEL}; these keys need more`,
        ).toEqual([]);
    });

    it('enforces the same version it advertises in its rejection notice', () => {
        expect(NEOVIM_API_LEVEL_BY_RELEASE[REQUIRED_VERSION]).toBe(
            REQUIRED_API_LEVEL,
        );
    });

    it('agrees with the install scripts, the prerequisite probe and the e2e stub', () => {
        expect({
            installSh: declaredFloor(
                'scripts/install-neovim.sh',
                /^MIN_API_LEVEL=(\d+)$/m,
            ),
            installPs1: declaredFloor(
                'scripts/install-neovim.ps1',
                /^\$MinApiLevel = (\d+)$/m,
            ),
            prerequisites: declaredFloor(
                'test/specs/rpc-prerequisites.ts',
                /^const MIN_API_LEVEL = (\d+);$/m,
            ),
            lifecycleStub: declaredFloor(
                'test/specs/rpc-lifecycle.e2e.ts',
                /^const ACCEPTED_STUB_API_LEVEL = (\d+);$/m,
            ),
        }).toEqual({
            installSh: REQUIRED_API_LEVEL,
            installPs1: REQUIRED_API_LEVEL,
            prerequisites: REQUIRED_API_LEVEL,
            lifecycleStub: REQUIRED_API_LEVEL,
        });
    });
});

function spawnError(code: string): Error & { code: string } {
    return Object.assign(new Error(`spawn nvim ${code}`), { code });
}

// The second half of #199. Both notices used to be the same sentence, ending
// in "Check the configured path and permissions." — advice that is actively
// wrong once the process is running, and that cost the reporter several days
// of moving nvim.exe between directories.
describe('Neovim connection failure notices (#199)', () => {
    it('blames elevation rather than the executable bit for a Windows EACCES', () => {
        const notice = neovimStartFailureNotice(
            'C:\\Program Files\\Neovim\\bin\\nvim.exe',
            spawnError('EACCES'),
            true,
        );
        expect(notice).toContain('C:\\Program Files\\Neovim\\bin\\nvim.exe');
        expect(notice).toContain('administrator');
        expect(notice).toContain('WSL');
        expect(notice).not.toContain('not executable');
    });

    it('still reports a POSIX EACCES as a non-executable binary', () => {
        const notice = neovimStartFailureNotice(
            '/usr/bin/nvim',
            spawnError('EACCES'),
            false,
        );
        expect(notice).toContain('not executable');
        expect(notice).not.toContain('administrator');
    });

    it('points ENOENT at the path setting, and nothing else does', () => {
        expect(
            neovimStartFailureNotice('nvim', spawnError('ENOENT'), true),
        ).toContain('Leave the path empty');
        expect(
            neovimStartFailureNotice('nvim', spawnError('EACCES'), true),
        ).not.toContain('Leave the path empty');
    });

    it('does not send a post-spawn failure back to the path settings', () => {
        // Verbatim from the issue's third screenshot, which is what a Neovim
        // below the api_level floor produced from the decoration bridge.
        const notice = neovimHandshakeFailureNotice(
            'C:\\Neovim\\bin\\nvim.exe',
            new Error(
                'Neovim RPC error: [0,"Error executing lua: [string \\"<nvim>\\"]:867: invalid key: on_range"]',
            ),
        );
        expect(notice).toContain('invalid key: on_range');
        expect(notice).toContain('The path is fine');
        expect(notice).not.toMatch(/Check the configured path/);
        expect(notice).not.toMatch(/permissions/);
    });
});
