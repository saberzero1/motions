import type { LuaKeymap } from './api';

export interface VimMapUnmap {
    map(
        mode: LuaKeymap['mode'],
        lhs: string,
        rhs: string,
        options?: { noremap?: boolean },
    ): void;
    unmap(lhs: string, mode: LuaKeymap['mode']): void;
}

type BufferFnMapper = (keymap: LuaKeymap) => boolean;

export class BufferKeymapManager {
    // Per-file keymap storage: filePath → list of keymaps
    private bufferMaps = new Map<string, LuaKeymap[]>();
    // Currently active buffer
    private activeBuffer: string | null = null;
    // Keymaps currently applied to the vim engine
    private appliedMaps: LuaKeymap[] = [];
    private vimEngine: VimMapUnmap | null = null;
    private fnMapper: BufferFnMapper | null = null;

    register(filePath: string, keymap: LuaKeymap): void {
        let maps = this.bufferMaps.get(filePath);
        if (!maps) {
            maps = [];
            this.bufferMaps.set(filePath, maps);
        }
        const idx = maps.findIndex(
            (m) => m.mode === keymap.mode && m.lhs === keymap.lhs,
        );
        if (idx !== -1) maps.splice(idx, 1);
        maps.push(keymap);
        if (filePath === this.activeBuffer) {
            this.unapplyKeymap(keymap.mode, keymap.lhs);
            this.applyKeymap(keymap);
        }
    }

    unregister(filePath: string, mode: LuaKeymap['mode'], lhs: string): void {
        const maps = this.bufferMaps.get(filePath);
        if (!maps) return;
        const idx = maps.findIndex((m) => m.mode === mode && m.lhs === lhs);
        if (idx !== -1) maps.splice(idx, 1);
        if (filePath === this.activeBuffer) {
            this.unapplyKeymap(mode, lhs);
        }
    }

    switchBuffer(newPath: string | null, vimEngine?: VimMapUnmap): void {
        const engine = vimEngine ?? this.vimEngine;
        if (engine) {
            for (const km of this.appliedMaps) {
                try {
                    engine.unmap(km.lhs, km.mode);
                } catch {
                    /* ignore */
                }
            }
        }
        this.appliedMaps = [];
        this.activeBuffer = newPath;
        if (newPath && engine) {
            const maps = this.bufferMaps.get(newPath) ?? [];
            for (const km of maps) {
                this.applyKeymapTo(km, engine);
            }
        }
    }

    getActiveBuffer(): string | null {
        return this.activeBuffer;
    }

    destroy(vimEngine?: VimMapUnmap): void {
        const engine = vimEngine ?? this.vimEngine;
        if (engine) {
            for (const km of this.appliedMaps) {
                try {
                    engine.unmap(km.lhs, km.mode);
                } catch {
                    /* ignore */
                }
            }
        }
        this.appliedMaps = [];
        this.bufferMaps.clear();
        this.activeBuffer = null;
        this.vimEngine = null;
        this.fnMapper = null;
    }

    setVimEngine(engine: VimMapUnmap): void {
        this.vimEngine = engine;
    }

    setFnMapper(mapper: BufferFnMapper): void {
        this.fnMapper = mapper;
    }

    private applyKeymap(km: LuaKeymap): void {
        if (this.vimEngine) this.applyKeymapTo(km, this.vimEngine);
    }

    private unapplyKeymap(mode: LuaKeymap['mode'], lhs: string): void {
        if (this.vimEngine) {
            try {
                this.vimEngine.unmap(lhs, mode);
            } catch {
                /* ignore */
            }
        }
        this.appliedMaps = this.appliedMaps.filter(
            (m) => !(m.mode === mode && m.lhs === lhs),
        );
    }

    private applyKeymapTo(km: LuaKeymap, engine: VimMapUnmap): void {
        if (km.isFn && km.callback && this.fnMapper?.(km)) {
            this.appliedMaps.push(km);
            return;
        }
        if (km.rhs) {
            if (km.noremap) {
                engine.map(km.mode, km.lhs, km.rhs, { noremap: true });
            } else {
                engine.map(km.mode, km.lhs, km.rhs);
            }
            this.appliedMaps.push(km);
        }
    }
}
