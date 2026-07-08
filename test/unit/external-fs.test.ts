import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockReadFile = vi.fn();
const mockAccess = vi.fn();
const mockHomedir = vi.fn(() => '/home/testuser');
const mockGetPath = vi.fn((name: string) =>
    name === 'userData' ? '/home/testuser/.config/obsidian' : '',
);

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
        if (name === 'fs/promises')
            return { readFile: mockReadFile, access: mockAccess };
        if (name === 'os') return { homedir: mockHomedir };
        if (name === 'electron')
            return { remote: { app: { getPath: mockGetPath } } };
        throw new Error(`Unknown module: ${name}`);
    };
}

function removeWindowRequire() {
    delete (globalThis as Record<string, unknown>).require;
}

async function loadModule() {
    vi.resetModules();
    return await import('../../src/util/external-fs');
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockReadFile.mockReset();
    mockAccess.mockReset();
    mockHomedir.mockReset().mockReturnValue('/home/testuser');
    mockGetPath
        .mockReset()
        .mockImplementation((name: string) =>
            name === 'userData' ? '/home/testuser/.config/obsidian' : '',
        );
    mockIsDesktop = true;
    installWindowRequire();
});

afterEach(() => {
    removeWindowRequire();
    mockIsDesktop = true;
});

describe('isAbsolutePath', () => {
    it('detects Unix absolute paths', async () => {
        const { isAbsolutePath } = await loadModule();
        expect(isAbsolutePath('/home/user/init.lua')).toBe(true);
        expect(isAbsolutePath('/etc/config')).toBe(true);
        expect(isAbsolutePath('/')).toBe(true);
    });

    it('detects tilde paths', async () => {
        const { isAbsolutePath } = await loadModule();
        expect(isAbsolutePath('~')).toBe(true);
        expect(isAbsolutePath('~/.config/obsidian/init.lua')).toBe(true);
        expect(isAbsolutePath('~/init.lua')).toBe(true);
    });

    it('detects Windows drive letter paths', async () => {
        const { isAbsolutePath } = await loadModule();
        expect(isAbsolutePath('C:\\Users\\azin\\.config\\init.lua')).toBe(true);
        expect(isAbsolutePath('D:/Documents/init.lua')).toBe(true);
        expect(isAbsolutePath('c:\\lowercase')).toBe(true);
    });

    it('detects Windows UNC paths', async () => {
        const { isAbsolutePath } = await loadModule();
        expect(isAbsolutePath('\\\\server\\share\\file')).toBe(true);
    });

    it('rejects vault-relative paths', async () => {
        const { isAbsolutePath } = await loadModule();
        expect(isAbsolutePath('init.lua')).toBe(false);
        expect(isAbsolutePath('.init.lua')).toBe(false);
        expect(isAbsolutePath('obsidian.init.lua')).toBe(false);
        expect(isAbsolutePath('.obsidian/init.lua')).toBe(false);
        expect(isAbsolutePath('subfolder/init.lua')).toBe(false);
    });

    it('rejects empty string', async () => {
        const { isAbsolutePath } = await loadModule();
        expect(isAbsolutePath('')).toBe(false);
    });
});

describe('readExternalFile', () => {
    it('reads file at absolute path', async () => {
        const { readExternalFile } = await loadModule();
        mockReadFile.mockResolvedValue('vim.opt.scrolloff = 8');
        const content = await readExternalFile('/home/user/init.lua');
        expect(content).toBe('vim.opt.scrolloff = 8');
        expect(mockReadFile).toHaveBeenCalledWith('/home/user/init.lua', {
            encoding: 'utf-8',
        });
    });

    it('expands tilde before reading', async () => {
        const { readExternalFile } = await loadModule();
        mockReadFile.mockResolvedValue('set scrolloff=5');
        await readExternalFile('~/.config/obsidian/vimrc');
        expect(mockReadFile).toHaveBeenCalledWith(
            '/home/testuser/.config/obsidian/vimrc',
            { encoding: 'utf-8' },
        );
    });

    it('returns null on mobile', async () => {
        mockIsDesktop = false;
        const { readExternalFile } = await loadModule();
        const content = await readExternalFile('/some/path');
        expect(content).toBeNull();
        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('returns null when file does not exist', async () => {
        const { readExternalFile } = await loadModule();
        mockReadFile.mockRejectedValue(new Error('ENOENT'));
        const content = await readExternalFile('/nonexistent/file.lua');
        expect(content).toBeNull();
    });

    it('returns null when window.require is unavailable', async () => {
        removeWindowRequire();
        const { readExternalFile } = await loadModule();
        const content = await readExternalFile('/some/path');
        expect(content).toBeNull();
    });
});

describe('externalFileExists', () => {
    it('returns true when file is accessible', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        expect(await externalFileExists('/home/user/init.lua')).toBe(true);
        expect(mockAccess).toHaveBeenCalledWith('/home/user/init.lua');
    });

    it('expands tilde before checking', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        await externalFileExists('~/init.lua');
        expect(mockAccess).toHaveBeenCalledWith('/home/testuser/init.lua');
    });

    it('returns false on mobile', async () => {
        mockIsDesktop = false;
        const { externalFileExists } = await loadModule();
        expect(await externalFileExists('/some/path')).toBe(false);
        expect(mockAccess).not.toHaveBeenCalled();
    });

    it('returns false when file does not exist', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockRejectedValue(new Error('ENOENT'));
        expect(await externalFileExists('/nonexistent')).toBe(false);
    });

    it('returns false when window.require is unavailable', async () => {
        removeWindowRequire();
        const { externalFileExists } = await loadModule();
        expect(await externalFileExists('/some/path')).toBe(false);
    });
});

describe('getObsidianUserDataDir', () => {
    it('returns userData path on desktop', async () => {
        const { getObsidianUserDataDir } = await loadModule();
        expect(getObsidianUserDataDir()).toBe(
            '/home/testuser/.config/obsidian',
        );
        expect(mockGetPath).toHaveBeenCalledWith('userData');
    });

    it('returns null on mobile', async () => {
        mockIsDesktop = false;
        const { getObsidianUserDataDir } = await loadModule();
        expect(getObsidianUserDataDir()).toBeNull();
        expect(mockGetPath).not.toHaveBeenCalled();
    });

    it('returns null when electron is unavailable', async () => {
        (globalThis as Record<string, unknown>).require = (name: string) => {
            if (name === 'electron') throw new Error('Not available');
            throw new Error(`Unknown: ${name}`);
        };
        const { getObsidianUserDataDir } = await loadModule();
        expect(getObsidianUserDataDir()).toBeNull();
    });
});

describe('tilde expansion edge cases', () => {
    it('expands bare tilde to homedir', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        await externalFileExists('~');
        expect(mockAccess).toHaveBeenCalledWith('/home/testuser');
    });

    it('expands tilde with backslash separator (Windows)', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        await externalFileExists('~\\.config\\init.lua');
        expect(mockAccess).toHaveBeenCalledWith(
            '/home/testuser\\.config\\init.lua',
        );
    });

    it('does not expand tilde in middle of path', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        await externalFileExists('/home/~user/file');
        expect(mockAccess).toHaveBeenCalledWith('/home/~user/file');
    });

    it('does not expand ~username (only bare ~ or ~/)', async () => {
        const { readExternalFile } = await loadModule();
        mockReadFile.mockResolvedValue('content');
        await readExternalFile('~otheruser/file');
        expect(mockReadFile).toHaveBeenCalledWith('~otheruser/file', {
            encoding: 'utf-8',
        });
    });

    it('passes through tilde on mobile without expansion', async () => {
        mockIsDesktop = false;
        const { readExternalFile } = await loadModule();
        expect(await readExternalFile('~/.config/init.lua')).toBeNull();
        expect(mockReadFile).not.toHaveBeenCalled();
    });
});

describe('Windows path handling', () => {
    it('reads file at Windows drive letter path', async () => {
        const { readExternalFile } = await loadModule();
        mockReadFile.mockResolvedValue('content');
        await readExternalFile('C:\\Users\\azin\\.config\\init.lua');
        expect(mockReadFile).toHaveBeenCalledWith(
            'C:\\Users\\azin\\.config\\init.lua',
            { encoding: 'utf-8' },
        );
    });

    it('checks existence at Windows path with forward slashes', async () => {
        const { externalFileExists } = await loadModule();
        mockAccess.mockResolvedValue(undefined);
        expect(await externalFileExists('D:/Documents/vimrc')).toBe(true);
        expect(mockAccess).toHaveBeenCalledWith('D:/Documents/vimrc');
    });
});
