import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';

const mockHomedir = vi.fn(() => '/home/testuser');
const mockOpenPath = vi.fn<(path: string) => Promise<string>>();
const mockShowItemInFolder = vi.fn<(path: string) => void>();

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
        if (name === 'os') return { homedir: mockHomedir };
        if (name === 'electron') {
            return {
                remote: {
                    shell: {
                        openPath: mockOpenPath,
                        showItemInFolder: mockShowItemInFolder,
                    },
                },
            };
        }
        throw new Error(`Unknown module: ${name}`);
    };
}

async function loadModule() {
    vi.resetModules();
    return await import('../../../src/util/open-path');
}

type MockApp = App & {
    openWithDefaultApp: ReturnType<typeof vi.fn>;
    showInFolder: ReturnType<typeof vi.fn>;
};

function makeApp(): MockApp {
    return {
        openWithDefaultApp: vi.fn(),
        showInFolder: vi.fn(),
    } as unknown as MockApp;
}

beforeEach(() => {
    mockHomedir.mockReset().mockReturnValue('/home/testuser');
    mockOpenPath.mockReset().mockResolvedValue('');
    mockShowItemInFolder.mockReset();
    mockIsDesktop = true;
    installWindowRequire();
});

afterEach(() => {
    delete (globalThis as Record<string, unknown>).require;
    mockIsDesktop = true;
});

describe('openPathInDefaultApp — vault-relative paths', () => {
    it('routes a vault-relative config through the Obsidian API', async () => {
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        expect(await openPathInDefaultApp(app, 'init.lua')).toBe(true);

        expect(app.openWithDefaultApp).toHaveBeenCalledWith('init.lua');
        expect(mockOpenPath).not.toHaveBeenCalled();
    });

    it('routes a nested vault-relative config through the Obsidian API', async () => {
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        expect(await openPathInDefaultApp(app, '.obsidian/.init.lua')).toBe(
            true,
        );

        expect(app.openWithDefaultApp).toHaveBeenCalledWith(
            '.obsidian/.init.lua',
        );
        expect(mockOpenPath).not.toHaveBeenCalled();
    });
});

describe('openPathInDefaultApp — out-of-vault paths (issue #182 regression)', () => {
    it('does NOT hand an absolute config to the vault-relative API', async () => {
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        await openPathInDefaultApp(
            app,
            '/home/testuser/.config/obsidian/init.lua',
        );

        // openWithDefaultApp joins onto the vault base path, turning this into
        // `<vault>/home/testuser/...`, which does not exist.
        expect(app.openWithDefaultApp).not.toHaveBeenCalled();
    });

    it('opens an absolute config through the OS shell instead', async () => {
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        expect(
            await openPathInDefaultApp(
                app,
                '/home/testuser/.config/obsidian/init.lua',
            ),
        ).toBe(true);

        expect(mockOpenPath).toHaveBeenCalledWith(
            '/home/testuser/.config/obsidian/init.lua',
        );
    });

    it('expands a tilde config path before opening', async () => {
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        await openPathInDefaultApp(app, '~/.config/obsidian/vimrc');

        expect(mockOpenPath).toHaveBeenCalledWith(
            '/home/testuser/.config/obsidian/vimrc',
        );
        expect(app.openWithDefaultApp).not.toHaveBeenCalled();
    });

    it('opens a Windows absolute config through the OS shell', async () => {
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        await openPathInDefaultApp(app, 'C:\\Users\\azin\\init.lua');

        expect(mockOpenPath).toHaveBeenCalledWith('C:\\Users\\azin\\init.lua');
        expect(app.openWithDefaultApp).not.toHaveBeenCalled();
    });

    it('reports failure when the shell rejects the path', async () => {
        mockOpenPath.mockResolvedValue('Failed to open path');
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        expect(await openPathInDefaultApp(app, '/nonexistent/init.lua')).toBe(
            false,
        );
    });

    it('reports failure instead of throwing when the shell throws', async () => {
        mockOpenPath.mockRejectedValue(new Error('EACCES'));
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        expect(await openPathInDefaultApp(app, '/root/init.lua')).toBe(false);
    });

    it('reports failure for an absolute config on mobile', async () => {
        mockIsDesktop = false;
        const { openPathInDefaultApp } = await loadModule();
        const app = makeApp();

        expect(await openPathInDefaultApp(app, '/home/u/init.lua')).toBe(false);
        expect(mockOpenPath).not.toHaveBeenCalled();
        expect(app.openWithDefaultApp).not.toHaveBeenCalled();
    });
});

describe('parentDirOf', () => {
    it('returns empty string for a vault-root filename', async () => {
        const { parentDirOf } = await loadModule();
        expect(parentDirOf('init.lua')).toBe('');
    });

    it('returns the directory for a nested vault path', async () => {
        const { parentDirOf } = await loadModule();
        expect(parentDirOf('.obsidian/.init.lua')).toBe('.obsidian');
        expect(parentDirOf('config/nvim/init.lua')).toBe('config/nvim');
    });

    it('returns the directory for an absolute Unix path', async () => {
        const { parentDirOf } = await loadModule();
        expect(parentDirOf('/home/testuser/.config/obsidian/init.lua')).toBe(
            '/home/testuser/.config/obsidian',
        );
    });

    it('returns the directory for a Windows backslash path', async () => {
        const { parentDirOf } = await loadModule();
        expect(parentDirOf('C:\\Users\\azin\\init.lua')).toBe(
            'C:\\Users\\azin',
        );
    });
});

describe('revealPathInSystemExplorer — vault-relative paths', () => {
    it('reveals a vault-relative config through the Obsidian API', async () => {
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        expect(revealPathInSystemExplorer(app, 'init.lua')).toBe(true);

        expect(app.showInFolder).toHaveBeenCalledWith('init.lua');
        expect(mockShowItemInFolder).not.toHaveBeenCalled();
    });

    it('passes the config file itself, not its parent directory', async () => {
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        revealPathInSystemExplorer(app, '.obsidian/.init.lua');

        // showInFolder selects the item inside its parent, so handing it the
        // directory would reveal `.obsidian`'s parent and select nothing.
        expect(app.showInFolder).toHaveBeenCalledWith('.obsidian/.init.lua');
    });
});

describe('revealPathInSystemExplorer — out-of-vault paths', () => {
    it('does NOT hand an absolute config to the vault-relative API', async () => {
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        revealPathInSystemExplorer(
            app,
            '/home/testuser/.config/obsidian/init.lua',
        );

        expect(app.showInFolder).not.toHaveBeenCalled();
    });

    it('reveals an absolute config through the OS shell instead', async () => {
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        expect(
            revealPathInSystemExplorer(
                app,
                '/home/testuser/.config/obsidian/init.lua',
            ),
        ).toBe(true);

        expect(mockShowItemInFolder).toHaveBeenCalledWith(
            '/home/testuser/.config/obsidian/init.lua',
        );
    });

    it('expands a tilde config path before revealing', async () => {
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        revealPathInSystemExplorer(app, '~/.config/obsidian/vimrc');

        expect(mockShowItemInFolder).toHaveBeenCalledWith(
            '/home/testuser/.config/obsidian/vimrc',
        );
        expect(app.showInFolder).not.toHaveBeenCalled();
    });

    it('reveals a Windows absolute config through the OS shell', async () => {
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        revealPathInSystemExplorer(app, 'C:\\Users\\azin\\init.lua');

        expect(mockShowItemInFolder).toHaveBeenCalledWith(
            'C:\\Users\\azin\\init.lua',
        );
        expect(app.showInFolder).not.toHaveBeenCalled();
    });

    it('reports failure instead of throwing when the shell throws', async () => {
        mockShowItemInFolder.mockImplementation(() => {
            throw new Error('EACCES');
        });
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        expect(revealPathInSystemExplorer(app, '/root/init.lua')).toBe(false);
    });

    it('reports failure for an absolute config on mobile', async () => {
        mockIsDesktop = false;
        const { revealPathInSystemExplorer } = await loadModule();
        const app = makeApp();

        expect(revealPathInSystemExplorer(app, '/home/u/init.lua')).toBe(false);
        expect(mockShowItemInFolder).not.toHaveBeenCalled();
        expect(app.showInFolder).not.toHaveBeenCalled();
    });
});
