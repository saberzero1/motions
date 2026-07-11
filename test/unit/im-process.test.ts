import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockExecFile = vi.fn();
const mockReadFile = vi.fn();
const mockAccess = vi.fn();
const mockHomedir = vi.fn(() => '/home/testuser');

let mockIsDesktop = true;

vi.mock('obsidian', () => ({
    Platform: new Proxy(
        {},
        {
            get(_target, prop) {
                if (prop === 'isDesktop') return mockIsDesktop;
                if (prop === 'isDesktopApp') return mockIsDesktop;
                if (prop === 'isMobile') return !mockIsDesktop;
                return false;
            },
        },
    ),
    MarkdownView: class {},
    Notice: class {},
    TFile: class {},
}));

function installWindowRequire() {
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).require = (name: string) => {
        if (name === 'child_process') return { execFile: mockExecFile };
        if (name === 'fs/promises')
            return { readFile: mockReadFile, access: mockAccess };
        if (name === 'os') return { homedir: mockHomedir };
        throw new Error(`Unknown module: ${name}`);
    };
}

function removeWindowRequire() {
    delete (globalThis as Record<string, unknown>).require;
}

async function loadModule() {
    vi.resetModules();
    return await import('../../src/im/im-process');
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockExecFile
        .mockReset()
        .mockImplementation((_binary, _args, _options, cb) => {
            cb(null, 'com.apple.keylayout.ABC\n', '');
            return { kill: vi.fn() };
        });
    mockReadFile.mockReset();
    mockAccess.mockReset();
    mockHomedir.mockReset().mockReturnValue('/home/testuser');
    mockIsDesktop = true;
    installWindowRequire();
});

afterEach(() => {
    removeWindowRequire();
    mockIsDesktop = true;
});

describe('parseImArgs', () => {
    it('returns empty array for empty string', async () => {
        const { parseImArgs } = await loadModule();
        expect(parseImArgs('')).toEqual([]);
    });

    it('returns single arg when quoted', async () => {
        const { parseImArgs } = await loadModule();
        expect(parseImArgs('{im}')).toEqual(['{im}']);
    });

    it('splits multiple args', async () => {
        const { parseImArgs } = await loadModule();
        expect(parseImArgs('-s {im}')).toEqual(['-s', '{im}']);
    });

    it('returns empty array for whitespace-only', async () => {
        const { parseImArgs } = await loadModule();
        expect(parseImArgs('   ')).toEqual([]);
    });

    it('trims and collapses extra spaces', async () => {
        const { parseImArgs } = await loadModule();
        expect(parseImArgs('  -s   {im}  ')).toEqual(['-s', '{im}']);
    });

    it('handles three args', async () => {
        const { parseImArgs } = await loadModule();
        expect(parseImArgs('engine {im} --verbose')).toEqual([
            'engine',
            '{im}',
            '--verbose',
        ]);
    });
});

describe('isValidImIdentifier', () => {
    it('accepts valid identifiers', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('com.apple.keylayout.ABC')).toBe(true);
        expect(isValidImIdentifier('keyboard-us')).toBe(true);
        expect(isValidImIdentifier('1033')).toBe(true);
        expect(isValidImIdentifier('xkb:us::eng')).toBe(true);
        expect(
            isValidImIdentifier('com.tencent.inputmethod.wetype.pinyin'),
        ).toBe(true);
    });

    it('rejects empty string', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('')).toBe(false);
    });

    it('rejects semicolons', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('abc;rm -rf')).toBe(false);
    });

    it('rejects pipes', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('abc|cat')).toBe(false);
    });

    it('rejects ampersands', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('abc&&evil')).toBe(false);
    });

    it('rejects backticks', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('abc`evil`')).toBe(false);
    });

    it('rejects single quotes', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier("abc'evil")).toBe(false);
    });

    it('rejects backslashes', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('abc\\evil')).toBe(false);
    });

    it('rejects parentheses', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('abc(evil)')).toBe(false);
    });

    it('rejects overly long identifiers', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('a'.repeat(257))).toBe(false);
    });

    it('allows spaces', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('Chinese Simplified')).toBe(true);
    });

    it('allows slashes and colons', async () => {
        const { isValidImIdentifier } = await loadModule();
        expect(isValidImIdentifier('fcitx5/pinyin')).toBe(true);
        expect(isValidImIdentifier('xkb:us::eng')).toBe(true);
    });
});

describe('validateImBinary', () => {
    it('returns true for valid absolute path', async () => {
        const { validateImBinary } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        await expect(validateImBinary('/usr/local/bin/macism')).resolves.toBe(
            true,
        );
        expect(mockAccess).toHaveBeenCalledWith('/usr/local/bin/macism');
    });

    it('expands tilde paths', async () => {
        const { validateImBinary } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        await expect(validateImBinary('~/bin/macism')).resolves.toBe(true);
        expect(mockAccess).toHaveBeenCalledWith('/home/testuser/bin/macism');
    });

    it('rejects relative path', async () => {
        const { validateImBinary } = await loadModule();
        await expect(validateImBinary('./macism')).resolves.toBe(false);
        expect(mockAccess).not.toHaveBeenCalled();
    });

    it('rejects bare command', async () => {
        const { validateImBinary } = await loadModule();
        await expect(validateImBinary('macism')).resolves.toBe(false);
        expect(mockAccess).not.toHaveBeenCalled();
    });

    it('returns false on mobile', async () => {
        mockIsDesktop = false;
        const { validateImBinary } = await loadModule();
        await expect(validateImBinary('/usr/local/bin/macism')).resolves.toBe(
            false,
        );
        expect(mockAccess).not.toHaveBeenCalled();
    });

    it('returns false when file does not exist', async () => {
        const { validateImBinary } = await loadModule();
        mockAccess.mockRejectedValue(new Error('ENOENT'));
        await expect(validateImBinary('/missing/macism')).resolves.toBe(false);
    });
});

describe('executeImGet', () => {
    const config = {
        binary: '/usr/local/bin/macism',
        args: [],
        timeoutMs: 5000,
    };

    it('returns trimmed stdout on success', async () => {
        const { executeImGet } = await loadModule();
        await expect(executeImGet(config)).resolves.toBe(
            'com.apple.keylayout.ABC',
        );
    });

    it('returns null on mobile', async () => {
        mockIsDesktop = false;
        const { executeImGet } = await loadModule();
        await expect(executeImGet(config)).resolves.toBeNull();
        expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('returns stdout on non-fatal error', async () => {
        const { executeImGet } = await loadModule();
        mockExecFile.mockImplementationOnce((_b, _a, _o, cb) => {
            cb({ code: 1 }, 'com.apple.keylayout.ABC\n', '');
            return { kill: vi.fn() };
        });
        await expect(executeImGet(config)).resolves.toBe(
            'com.apple.keylayout.ABC',
        );
    });

    it('returns null on ENOENT', async () => {
        const { executeImGet } = await loadModule();
        mockExecFile.mockImplementationOnce((_b, _a, _o, cb) => {
            cb({ code: 'ENOENT' }, '', '');
            return { kill: vi.fn() };
        });
        await expect(executeImGet(config)).resolves.toBeNull();
    });

    it('returns null on signal termination', async () => {
        const { executeImGet } = await loadModule();
        mockExecFile.mockImplementationOnce((_b, _a, _o, cb) => {
            cb({ signal: 'SIGTERM' }, '', '');
            return { kill: vi.fn() };
        });
        await expect(executeImGet(config)).resolves.toBeNull();
    });

    it('terminates pending process before starting new one', async () => {
        const { executeImGet } = await loadModule();
        const killSpy = vi.fn();

        mockExecFile
            .mockImplementationOnce((_b, _a, _o) => {
                return { kill: killSpy };
            })
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb(null, 'com.apple.keylayout.ABC\n', '');
                return { kill: vi.fn() };
            });

        const firstPromise = executeImGet(config);
        const secondResult = await executeImGet(config);

        expect(killSpy).toHaveBeenCalled();
        expect(secondResult).toBe('com.apple.keylayout.ABC');

        const firstCallback = mockExecFile.mock.calls[0]?.[3] as
            | ((error: null, stdout: string, stderr: string) => void)
            | undefined;
        firstCallback?.(null, 'com.apple.keylayout.ABC\n', '');

        await expect(firstPromise).resolves.toBe('com.apple.keylayout.ABC');
    });

    it('returns null when disabled after repeated errors', async () => {
        const { executeImGet } = await loadModule();
        mockExecFile.mockImplementation((_b, _a, _o, cb) => {
            cb({ code: 'ENOENT' }, '', '');
            return { kill: vi.fn() };
        });

        await expect(executeImGet(config)).resolves.toBeNull();
        await expect(executeImGet(config)).resolves.toBeNull();
        await expect(executeImGet(config)).resolves.toBeNull();

        mockExecFile.mockClear();
        await expect(executeImGet(config)).resolves.toBeNull();
        expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('resets error count after success', async () => {
        const { executeImGet } = await loadModule();
        mockExecFile
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb({ code: 'ENOENT' }, '', '');
                return { kill: vi.fn() };
            })
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb({ code: 'ENOENT' }, '', '');
                return { kill: vi.fn() };
            })
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb(null, 'com.apple.keylayout.ABC\n', '');
                return { kill: vi.fn() };
            })
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb({ code: 'ENOENT' }, '', '');
                return { kill: vi.fn() };
            })
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb({ code: 'ENOENT' }, '', '');
                return { kill: vi.fn() };
            });

        await expect(executeImGet(config)).resolves.toBeNull();
        await expect(executeImGet(config)).resolves.toBeNull();
        await expect(executeImGet(config)).resolves.toBe(
            'com.apple.keylayout.ABC',
        );
        await expect(executeImGet(config)).resolves.toBeNull();
        await expect(executeImGet(config)).resolves.toBeNull();

        expect(mockExecFile).toHaveBeenCalledTimes(5);
    });
});

describe('executeImSet', () => {
    const config = {
        binary: '/usr/local/bin/macism',
        args: ['-s', '{im}'],
        timeoutMs: 5000,
    };

    it('returns true on success', async () => {
        const { executeImSet } = await loadModule();
        await expect(
            executeImSet(config, 'com.apple.keylayout.ABC'),
        ).resolves.toBe(true);
    });

    it('returns false on mobile', async () => {
        mockIsDesktop = false;
        const { executeImSet } = await loadModule();
        await expect(
            executeImSet(config, 'com.apple.keylayout.ABC'),
        ).resolves.toBe(false);
        expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('returns false for invalid identifier', async () => {
        const { executeImSet } = await loadModule();
        await expect(executeImSet(config, 'abc;evil')).resolves.toBe(false);
        expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('replaces {im} placeholder in args', async () => {
        const { executeImSet } = await loadModule();
        await expect(executeImSet(config, 'keyboard-us')).resolves.toBe(true);
        expect(mockExecFile).toHaveBeenCalledWith(
            '/usr/local/bin/macism',
            ['-s', 'keyboard-us'],
            { timeout: 5000, killSignal: 'SIGTERM' },
            expect.any(Function),
        );
    });

    it('returns false on ENOENT', async () => {
        const { executeImSet } = await loadModule();
        mockExecFile.mockImplementationOnce((_b, _a, _o, cb) => {
            cb({ code: 'ENOENT' }, '', '');
            return { kill: vi.fn() };
        });
        await expect(executeImSet(config, 'keyboard-us')).resolves.toBe(false);
    });

    it('terminates pending process before starting new one', async () => {
        const { executeImSet } = await loadModule();
        const killSpy = vi.fn();

        mockExecFile
            .mockImplementationOnce((_b, _a, _o) => {
                return { kill: killSpy };
            })
            .mockImplementationOnce((_b, _a, _o, cb) => {
                cb(null, '', '');
                return { kill: vi.fn() };
            });

        const firstPromise = executeImSet(config, 'keyboard-us');
        const secondResult = await executeImSet(config, 'keyboard-us');

        expect(killSpy).toHaveBeenCalled();
        expect(secondResult).toBe(true);

        const firstCallback = mockExecFile.mock.calls[0]?.[3] as
            | ((error: null) => void)
            | undefined;
        firstCallback?.(null);

        await expect(firstPromise).resolves.toBe(true);
    });
});
