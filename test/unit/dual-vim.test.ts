import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@replit/codemirror-vim', () => ({
    vim: () => [],
    Vim: { defineEx: vi.fn() },
    getCM: () => null,
    setLivePreviewField: vi.fn(),
    isCursorSuppressedForView: vi.fn(() => false),
}));

vi.mock('@codemirror/state', () => ({
    Prec: { highest: (ext: unknown) => ext },
}));

vi.mock('obsidian', () => ({
    editorLivePreviewField: {},
    Notice: class {
        constructor(_msg: string, _duration?: number) {}
    },
}));

describe('bundled-vim', () => {
    beforeEach(() => {
        vi.resetModules();
        const win = window as unknown as Record<string, unknown>;
        delete win.CodeMirrorAdapter;
    });

    it('isBundledVimActive() is initially false', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        expect(mod.isBundledVimActive()).toBe(false);
    });

    it('createBundledVimExtension() sets isBundledVimActive() to true', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        mod.createBundledVimExtension();
        expect(mod.isBundledVimActive()).toBe(true);
    });

    it('createBundledVimExtension() twice is idempotent', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        const ext1 = mod.createBundledVimExtension();
        const ext2 = mod.createBundledVimExtension();
        expect(ext1).toBeDefined();
        expect(ext2).toBeDefined();
    });

    it('installVimBridge() is idempotent', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        mod.installVimBridge();
        mod.installVimBridge();
        const win = window as unknown as Record<
            string,
            Record<string, unknown>
        >;
        expect(win.CodeMirrorAdapter).toBeDefined();
    });

    it('uninstallVimBridge() removes bridge', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        mod.installVimBridge();
        mod.uninstallVimBridge();
        const win = window as unknown as Record<
            string,
            Record<string, unknown>
        >;
        const desc = Object.getOwnPropertyDescriptor(
            win.CodeMirrorAdapter,
            'Vim',
        );
        expect(desc).toBeUndefined();
    });

    it('uninstallVimBridge() is idempotent', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        mod.installVimBridge();
        mod.uninstallVimBridge();
        mod.uninstallVimBridge();
    });

    it('bridge getter returns Vim singleton', async () => {
        const mod = await import('../../src/vim/bundled-vim');
        mod.installVimBridge();
        const win = window as unknown as Record<
            string,
            Record<string, unknown>
        >;
        expect(win.CodeMirrorAdapter?.Vim).toBeDefined();
    });
});
