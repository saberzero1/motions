import { describe, expect, it, vi } from 'vitest';
import { BufferKeymapManager } from '../../../src/lua/buffer';
import type { LuaKeymap } from '../../../src/lua/api';

const createKeymap = (
    lhs: string,
    rhs: string,
    mode: LuaKeymap['mode'] = 'normal',
    noremap = true,
): LuaKeymap => ({
    mode,
    lhs,
    rhs,
    noremap,
});

describe('BufferKeymapManager', () => {
    it('applies keymaps on switchBuffer', () => {
        const manager = new BufferKeymapManager();
        const map = vi.fn();
        const unmap = vi.fn();
        manager.setVimEngine({ map, unmap });

        manager.register('a.md', createKeymap('jj', 'esc'));
        manager.switchBuffer('a.md');

        expect(map).toHaveBeenCalledWith('normal', 'jj', 'esc', {
            noremap: true,
        });
        expect(unmap).not.toHaveBeenCalled();
    });

    it('switches between buffers and reapplies maps', () => {
        const manager = new BufferKeymapManager();
        const map = vi.fn();
        const unmap = vi.fn();
        manager.setVimEngine({ map, unmap });

        manager.register('a.md', createKeymap('aa', ':A'));
        manager.register('b.md', createKeymap('bb', ':B'));

        manager.switchBuffer('a.md');
        manager.switchBuffer('b.md');
        manager.switchBuffer('a.md');

        expect(unmap).toHaveBeenCalledWith('aa', 'normal');
        expect(unmap).toHaveBeenCalledWith('bb', 'normal');
        expect(map).toHaveBeenCalledWith('normal', 'aa', ':A', {
            noremap: true,
        });
        expect(map).toHaveBeenCalledWith('normal', 'bb', ':B', {
            noremap: true,
        });
    });

    it('unregister removes active mappings', () => {
        const manager = new BufferKeymapManager();
        const map = vi.fn();
        const unmap = vi.fn();
        manager.setVimEngine({ map, unmap });

        manager.register('a.md', createKeymap('aa', ':A'));
        manager.switchBuffer('a.md');
        manager.unregister('a.md', 'normal', 'aa');

        expect(unmap).toHaveBeenCalledWith('aa', 'normal');
    });

    it('register applies immediately on active buffer', () => {
        const manager = new BufferKeymapManager();
        const map = vi.fn();
        const unmap = vi.fn();
        manager.setVimEngine({ map, unmap });

        manager.switchBuffer('a.md');
        manager.register('a.md', createKeymap('aa', ':A'));

        expect(map).toHaveBeenCalledWith('normal', 'aa', ':A', {
            noremap: true,
        });
    });

    it('destroy clears applied mappings', () => {
        const manager = new BufferKeymapManager();
        const map = vi.fn();
        const unmap = vi.fn();
        manager.setVimEngine({ map, unmap });

        manager.register('a.md', createKeymap('aa', ':A'));
        manager.switchBuffer('a.md');
        manager.destroy();

        expect(unmap).toHaveBeenCalledWith('aa', 'normal');
        expect(manager.getActiveBuffer()).toBeNull();
    });
});
