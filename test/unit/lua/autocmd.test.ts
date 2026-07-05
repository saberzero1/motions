import { describe, it, expect, vi } from 'vitest';
import type { TFile } from 'obsidian';
import type { VimModeChange, CmAdapter } from '../../../src/types/vim-api';
import {
    AutocmdManager,
    AutocmdCallbacks,
    AutocmdYankEvent,
} from '../../../src/lua/autocmd';

function createCallbacks() {
    let modeHandler: ((mode: VimModeChange) => void) | null = null;
    let yankHandler: ((payload: AutocmdYankEvent) => void) | null = null;
    let fileHandler: ((file: TFile | null) => void) | null = null;
    let focusGainedHandler: (() => void) | null = null;
    let focusLostHandler: (() => void) | null = null;
    const counts = {
        mode: 0,
        yank: 0,
        file: 0,
        focusGained: 0,
        focusLost: 0,
    };

    const callbacks: AutocmdCallbacks = {
        onModeChange: (handler) => {
            counts.mode++;
            modeHandler = handler;
            return () => {
                modeHandler = null;
            };
        },
        onYank: (handler) => {
            counts.yank++;
            yankHandler = handler;
            return () => {
                yankHandler = null;
            };
        },
        onFileOpen: (handler) => {
            counts.file++;
            fileHandler = handler;
            return () => {
                fileHandler = null;
            };
        },
        onFocusGained: (handler) => {
            counts.focusGained++;
            focusGainedHandler = handler;
            return () => {
                focusGainedHandler = null;
            };
        },
        onFocusLost: (handler) => {
            counts.focusLost++;
            focusLostHandler = handler;
            return () => {
                focusLostHandler = null;
            };
        },
    };

    return {
        callbacks,
        counts,
        triggerMode(mode: VimModeChange) {
            modeHandler?.(mode);
        },
        triggerYank(payload: AutocmdYankEvent) {
            yankHandler?.(payload);
        },
        triggerFile(path: string | null) {
            const file = path ? ({ path } as TFile) : null;
            fileHandler?.(file);
        },
        triggerFocusGained() {
            focusGainedHandler?.();
        },
        triggerFocusLost() {
            focusLostHandler?.();
        },
    };
}

describe('AutocmdManager', () => {
    it('registers and fires autocmds', () => {
        const manager = new AutocmdManager(null);
        const callback = vi.fn();
        manager.register('FocusGained', { callback });
        manager.fire('FocusGained');
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('passes event data to callbacks', () => {
        const manager = new AutocmdManager(null);
        const callback = vi.fn();
        manager.register('BufEnter', { callback });
        manager.fire('BufEnter', { file: 'note.md' });
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'BufEnter',
                file: 'note.md',
                match: 'note.md',
                buf: 0,
                group: null,
            }),
        );
    });

    it('supports once autocmds', () => {
        const manager = new AutocmdManager(null);
        const callback = vi.fn();
        manager.register('FocusLost', { callback, once: true });
        manager.fire('FocusLost');
        manager.fire('FocusLost');
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('creates augroups and clears when requested', () => {
        const manager = new AutocmdManager(null);
        const groupId = manager.createAugroup('test', { clear: false });
        const callback = vi.fn();
        manager.register('FocusGained', { callback, group: groupId });
        manager.createAugroup('test', { clear: true });
        manager.fire('FocusGained');
        expect(callback).not.toHaveBeenCalled();
    });

    it('deletes autocmds by id', () => {
        const manager = new AutocmdManager(null);
        const callback = vi.fn();
        const id = manager.register('FocusGained', { callback });
        manager.deleteAutocmd(id);
        manager.fire('FocusGained');
        expect(callback).not.toHaveBeenCalled();
    });

    it('deletes augroup by name and removes its autocmds', () => {
        const manager = new AutocmdManager(null);
        const groupId = manager.createAugroup('group', { clear: true });
        const callback = vi.fn();
        manager.register('FocusLost', { callback, group: groupId });
        manager.deleteAugroupByName('group');
        manager.fire('FocusLost');
        expect(callback).not.toHaveBeenCalled();
    });

    it('clears matching autocmds by group and event', () => {
        const manager = new AutocmdManager(null);
        const groupId = manager.createAugroup('group', { clear: true });
        const callback = vi.fn();
        const other = vi.fn();
        manager.register('FocusGained', { callback, group: groupId });
        manager.register('FocusLost', { callback: other, group: groupId });
        manager.clearAutocmds({ group: groupId, event: 'FocusGained' });
        manager.fire('FocusGained');
        manager.fire('FocusLost');
        expect(callback).not.toHaveBeenCalled();
        expect(other).toHaveBeenCalledTimes(1);
    });

    it('clears ungrouped autocmds on request', () => {
        const manager = new AutocmdManager(null);
        const groupId = manager.createAugroup('group', { clear: true });
        const grouped = vi.fn();
        const ungrouped = vi.fn();
        manager.register('FocusGained', { callback: grouped, group: groupId });
        manager.register('FocusGained', { callback: ungrouped });
        manager.clearUngrouped();
        manager.fire('FocusGained');
        expect(grouped).toHaveBeenCalledTimes(1);
        expect(ungrouped).not.toHaveBeenCalled();
    });

    it('matches BufEnter patterns', () => {
        const manager = new AutocmdManager(null);
        const callback = vi.fn();
        manager.register('BufEnter', { callback, pattern: '*.md' });
        manager.fire('BufEnter', { file: 'note.md' });
        manager.fire('BufEnter', { file: 'config.json' });
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('matches ModeChanged patterns with wildcards', () => {
        const manager = new AutocmdManager(null);
        const exact = vi.fn();
        const wildcard = vi.fn();
        manager.register('ModeChanged', { callback: exact, pattern: 'n:i' });
        manager.register('ModeChanged', { callback: wildcard, pattern: '*:i' });
        manager.fire('ModeChanged', {
            match: 'n:i',
            data: { old_mode: 'n', new_mode: 'i' },
        });
        manager.fire('ModeChanged', {
            match: 'i:n',
            data: { old_mode: 'i', new_mode: 'n' },
        });
        expect(exact).toHaveBeenCalledTimes(1);
        expect(wildcard).toHaveBeenCalledTimes(1);
    });

    it('skips nested autocmds', () => {
        const manager = new AutocmdManager(null);
        const inner = vi.fn();
        manager.register('FocusLost', { callback: inner });
        manager.register('FocusGained', {
            callback: () => manager.fire('FocusLost'),
        });
        manager.fire('FocusGained');
        expect(inner).not.toHaveBeenCalled();
    });

    it('defers reload while firing', () => {
        const manager = new AutocmdManager(null);
        const reload = vi.fn();
        manager.setReloadCallback(reload);
        manager.register('FocusGained', {
            callback: () => {
                if (manager.isFiring()) manager.deferReload();
            },
        });
        manager.fire('FocusGained');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(manager.hasPendingReload()).toBe(false);
    });

    it('activates idempotently and wires handlers once', () => {
        const manager = new AutocmdManager(null);
        const harness = createCallbacks();
        manager.activate(harness.callbacks);
        manager.activate(harness.callbacks);
        expect(harness.counts.mode).toBe(1);
        expect(harness.counts.yank).toBe(1);
        expect(harness.counts.file).toBe(1);
        expect(harness.counts.focusGained).toBe(1);
        expect(harness.counts.focusLost).toBe(1);
    });

    it('tracks mode changes and fires insert enter/leave', () => {
        const manager = new AutocmdManager(null);
        const insertEnter = vi.fn();
        const insertLeave = vi.fn();
        manager.register('InsertEnter', { callback: insertEnter });
        manager.register('InsertLeave', { callback: insertLeave });
        const harness = createCallbacks();
        manager.activate(harness.callbacks);
        harness.triggerMode({ mode: 'insert' });
        expect(manager.getModeState()).toEqual({
            previousMode: 'n',
            currentMode: 'i',
        });
        harness.triggerMode({ mode: 'normal' });
        expect(manager.getModeState()).toEqual({
            previousMode: 'i',
            currentMode: 'n',
        });
        expect(insertEnter).toHaveBeenCalledTimes(1);
        expect(insertLeave).toHaveBeenCalledTimes(1);
    });

    it('fires focus and file events through activate handlers', () => {
        const manager = new AutocmdManager(null);
        const focus = vi.fn();
        const blur = vi.fn();
        const enter = vi.fn();
        const leave = vi.fn();
        manager.register('FocusGained', { callback: focus });
        manager.register('FocusLost', { callback: blur });
        manager.register('BufEnter', { callback: enter });
        manager.register('BufLeave', { callback: leave });
        const harness = createCallbacks();
        manager.activate(harness.callbacks);
        harness.triggerFocusGained();
        harness.triggerFocusLost();
        harness.triggerFile('note.md');
        harness.triggerFile('next.md');
        expect(focus).toHaveBeenCalledTimes(1);
        expect(blur).toHaveBeenCalledTimes(1);
        expect(enter).toHaveBeenCalledTimes(2);
        expect(leave).toHaveBeenCalledTimes(1);
    });

    it('attaches and detaches adapter listeners on leaf change', () => {
        const manager = new AutocmdManager(null);
        const adapter: CmAdapter = {
            cm6: {} as CmAdapter['cm6'],
            state: {},
            getCursor: vi.fn(),
            setCursor: vi.fn(),
            getLine: vi.fn(),
            lineCount: vi.fn(),
            getSelection: vi.fn(),
            replaceSelection: vi.fn(),
            replaceRange: vi.fn(),
            getRange: vi.fn(),
            firstLine: vi.fn(),
            lastLine: vi.fn(),
            indexFromPos: vi.fn(),
            posFromIndex: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        };
        const harness = createCallbacks();
        manager.activate({
            ...harness.callbacks,
            onModeChange: (_handler, target) => {
                if (target) {
                    target.on('vim-mode-change', _handler);
                    return () =>
                        target.off(
                            'vim-mode-change',
                            _handler as (...args: unknown[]) => void,
                        );
                }
                return undefined;
            },
            onYank: (_handler, target) => {
                if (target) {
                    target.on(
                        'vim-yank',
                        _handler as (...args: unknown[]) => void,
                    );
                    return () =>
                        target.off(
                            'vim-yank',
                            _handler as (...args: unknown[]) => void,
                        );
                }
                return undefined;
            },
        });
        manager.onActiveLeafChange(adapter);
        expect(adapter.on).toHaveBeenCalled();
        manager.onActiveLeafChange(null);
        expect(adapter.off).toHaveBeenCalled();
    });
});
