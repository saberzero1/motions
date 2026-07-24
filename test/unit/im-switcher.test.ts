import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImSwitcher, ImSwitcherConfig } from '../../src/im/im-switcher';

const {
    mockExecuteImGet,
    mockExecuteImSet,
    mockIsValidImIdentifier,
    mockIsAnyViewComposing,
    mockOnAllCompositionsEnd,
} = vi.hoisted(() => ({
    mockExecuteImGet: vi.fn(),
    mockExecuteImSet: vi.fn(),
    mockIsValidImIdentifier: vi.fn(),
    mockIsAnyViewComposing: vi.fn(),
    mockOnAllCompositionsEnd: vi.fn(),
}));

vi.mock('../../src/im/im-process', () => ({
    executeImGet: mockExecuteImGet,
    executeImSet: mockExecuteImSet,
    isValidImIdentifier: mockIsValidImIdentifier,
}));

vi.mock('../../src/im/composition-tracker', () => ({
    isAnyViewComposing: mockIsAnyViewComposing,
    onAllCompositionsEnd: mockOnAllCompositionsEnd,
}));

vi.mock('obsidian', () => ({
    Notice: class {
        constructor() {}
    },
    Platform: { isDesktop: true },
}));

function createSwitcher(overrides?: Partial<ImSwitcherConfig>): ImSwitcher {
    return new ImSwitcher({
        enabled: true,
        autoWire: true,
        defaultNormalIm: 'com.apple.keylayout.ABC',
        restoreBehavior: 'restore',
        defaultInsertIm: '',
        obtainConfig: { binary: '/usr/bin/macism', args: [], timeoutMs: 5000 },
        switchConfig: {
            binary: '/usr/bin/macism',
            args: ['{im}'],
            timeoutMs: 5000,
        },
        ...overrides,
    });
}

function ensureDomGlobals(): void {
    const scope = globalThis as typeof globalThis & {
        window?: Window & typeof globalThis;
    };

    if (!scope.window) {
        scope.window = globalThis as unknown as Window & typeof globalThis;
    }
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    ensureDomGlobals();
    mockExecuteImGet.mockReset().mockResolvedValue('com.apple.keylayout.ABC');
    mockExecuteImSet.mockReset().mockResolvedValue(true);
    mockIsValidImIdentifier.mockReset().mockReturnValue(true);
    mockIsAnyViewComposing.mockReset().mockReturnValue(false);
    mockOnAllCompositionsEnd.mockReset().mockReturnValue(() => {});
});

afterEach(() => {
    vi.useRealTimers();
});

describe('primeCache', () => {
    it('populates lastKnownIm after async resolution', async () => {
        const switcher = createSwitcher();
        switcher.primeCache();
        await Promise.resolve();
        expect(mockExecuteImGet).toHaveBeenCalledWith(
            switcher.config.obtainConfig,
        );
        expect(switcher.lastKnownIm).toBe('com.apple.keylayout.ABC');
    });

    it('does not update cache after destroy', async () => {
        const switcher = createSwitcher();
        let resolveGet!: (value: string) => void;
        mockExecuteImGet.mockReturnValue(
            new Promise<string>((resolve) => {
                resolveGet = resolve;
            }),
        );
        switcher.primeCache();
        switcher.destroy();
        resolveGet('com.apple.keylayout.ABC');
        await Promise.resolve();
        expect(switcher.lastKnownIm).toBeNull();
    });
});

describe('get', () => {
    it('calls executeImGet and returns result', async () => {
        const switcher = createSwitcher();
        const result = await switcher.get();
        expect(mockExecuteImGet).toHaveBeenCalledWith(
            switcher.config.obtainConfig,
        );
        expect(result).toBe('com.apple.keylayout.ABC');
    });

    it('updates lastKnownIm with result', async () => {
        const switcher = createSwitcher();
        await switcher.get();
        expect(switcher.lastKnownIm).toBe('com.apple.keylayout.ABC');
    });
});

describe('set', () => {
    it('calls executeImSet with the identifier', async () => {
        const switcher = createSwitcher();
        await switcher.set('com.apple.keylayout.ABC');
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
    });

    it('updates lastKnownIm on success', async () => {
        const switcher = createSwitcher();
        await switcher.set('com.apple.keylayout.ABC');
        expect(switcher.lastKnownIm).toBe('com.apple.keylayout.ABC');
    });

    it('rejects invalid identifier and does not call executeImSet', async () => {
        const switcher = createSwitcher();
        mockIsValidImIdentifier.mockReturnValue(false);
        await switcher.set('not.valid');
        expect(mockExecuteImSet).not.toHaveBeenCalled();
        expect(switcher.lastKnownIm).toBeNull();
    });
});

describe('save and restore', () => {
    it('save(leafId) queries OS and stores result in per-leaf cache', async () => {
        const switcher = createSwitcher();
        mockExecuteImGet.mockResolvedValue('com.apple.keylayout.Dvorak');
        await switcher.save('leaf-1');
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImGet).toHaveBeenCalledWith(
            switcher.config.obtainConfig,
        );
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.Dvorak',
        );
    });

    it('save(leafId) falls back to lastKnownIm when OS query fails', async () => {
        const switcher = createSwitcher();
        switcher.lastKnownIm = 'com.apple.keylayout.Dvorak';
        mockExecuteImGet.mockResolvedValue(null);
        await switcher.save('leaf-1');
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.Dvorak',
        );
    });

    it("restore(leafId) with restoreBehavior: 'restore' calls set with saved IM", async () => {
        const switcher = createSwitcher({ restoreBehavior: 'restore' });
        mockExecuteImGet.mockResolvedValue('com.apple.keylayout.Dvorak');
        await switcher.save('leaf-1');
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.Dvorak',
        );
    });

    it('restore(leafId) with no saved IM does nothing', async () => {
        const switcher = createSwitcher({ restoreBehavior: 'restore' });
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it("restore(leafId) with restoreBehavior: 'default' calls set with defaultInsertIm", async () => {
        const switcher = createSwitcher({
            restoreBehavior: 'default',
            defaultInsertIm: 'com.apple.keylayout.Dvorak',
        });
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.Dvorak',
        );
    });

    it("restore(leafId) with restoreBehavior: 'default' and empty defaultInsertIm does nothing", async () => {
        const switcher = createSwitcher({
            restoreBehavior: 'default',
            defaultInsertIm: '',
        });
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });
});

describe('per-leaf isolation', () => {
    it('save different IMs for different leaf IDs, restore each gets the correct one', async () => {
        const switcher = createSwitcher({ restoreBehavior: 'restore' });
        mockExecuteImGet.mockResolvedValueOnce('com.apple.keylayout.ABC');
        await switcher.save('leaf-1');
        mockExecuteImGet.mockResolvedValueOnce('com.apple.keylayout.Dvorak');
        await switcher.save('leaf-2');

        switcher.restore('leaf-1');
        await Promise.resolve();
        switcher.restore('leaf-2');
        await Promise.resolve();

        expect(mockExecuteImSet).toHaveBeenNthCalledWith(
            1,
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
        expect(mockExecuteImSet).toHaveBeenNthCalledWith(
            2,
            switcher.config.switchConfig,
            'com.apple.keylayout.Dvorak',
        );
    });
});

describe('onInsertLeave', () => {
    it('calls save then set with defaultNormalIm after debounce timer fires', async () => {
        mockExecuteImGet.mockResolvedValue(
            'com.tencent.inputmethod.wetype.pinyin',
        );
        const switcher = createSwitcher();
        const saveSpy = vi.spyOn(switcher, 'save');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await vi.advanceTimersByTimeAsync(0);
        expect(saveSpy).toHaveBeenCalledWith('leaf-1');
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
    });

    it('skips set when OS-queried IM already equals defaultNormalIm', async () => {
        mockExecuteImGet.mockResolvedValue('com.apple.keylayout.ABC');
        const switcher = createSwitcher();
        const saveSpy = vi.spyOn(switcher, 'save');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await vi.advanceTimersByTimeAsync(0);
        expect(saveSpy).toHaveBeenCalledWith('leaf-1');
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('does nothing when defaultNormalIm is empty', async () => {
        const switcher = createSwitcher({ defaultNormalIm: '' });
        const saveSpy = vi.spyOn(switcher, 'save');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await vi.advanceTimersByTimeAsync(0);
        expect(saveSpy).toHaveBeenCalledWith('leaf-1');
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });
});

describe('onInsertEnter', () => {
    it('calls restore with the leaf ID after debounce timer fires', () => {
        const switcher = createSwitcher();
        const restoreSpy = vi.spyOn(switcher, 'restore');
        switcher.onInsertEnter('leaf-1');
        vi.advanceTimersByTime(50);
        expect(restoreSpy).toHaveBeenCalledWith('leaf-1');
    });
});

describe('onCmdlineLeave', () => {
    it('switches to normal IM after debounce', async () => {
        const switcher = createSwitcher();
        switcher.lastKnownIm = 'com.tencent.inputmethod.wetype.pinyin';
        switcher.onCmdlineLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
    });

    it('skips when already on normal IM', () => {
        const switcher = createSwitcher();
        switcher.lastKnownIm = 'com.apple.keylayout.ABC';
        switcher.onCmdlineLeave('leaf-1');
        vi.advanceTimersByTime(50);
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('does nothing when defaultNormalIm is empty', () => {
        const switcher = createSwitcher({ defaultNormalIm: '' });
        switcher.lastKnownIm = 'com.tencent.inputmethod.wetype.pinyin';
        switcher.onCmdlineLeave('leaf-1');
        vi.advanceTimersByTime(50);
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('does not save IM state (unlike onInsertLeave)', async () => {
        const switcher = createSwitcher();
        switcher.lastKnownIm = 'com.tencent.inputmethod.wetype.pinyin';
        switcher.onCmdlineLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await Promise.resolve();
        expect(mockExecuteImGet).not.toHaveBeenCalled();
    });
});

describe('debouncing', () => {
    it('rapid calls only execute the last one', async () => {
        mockExecuteImGet.mockResolvedValue(
            'com.tencent.inputmethod.wetype.pinyin',
        );
        const switcher = createSwitcher();
        switcher.onInsertLeave('leaf-1');
        switcher.onInsertLeave('leaf-1');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await vi.advanceTimersByTimeAsync(0);
        expect(mockExecuteImSet).toHaveBeenCalledTimes(1);
    });
});

describe('composition guard', () => {
    it('defers switching when isAnyViewComposing returns true', () => {
        mockIsAnyViewComposing.mockReturnValue(true);
        const switcher = createSwitcher();

        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        expect(mockExecuteImSet).not.toHaveBeenCalled();
        expect(mockOnAllCompositionsEnd).toHaveBeenCalledWith(
            expect.any(Function),
        );
    });

    it('executes pending switch when onAllCompositionsEnd fires', async () => {
        mockIsAnyViewComposing.mockReturnValue(true);
        mockExecuteImGet.mockResolvedValue(
            'com.tencent.inputmethod.wetype.pinyin',
        );
        let endCallback: (() => void) | null = null;
        mockOnAllCompositionsEnd.mockImplementation((cb: () => void) => {
            endCallback = cb;
            return () => {
                endCallback = null;
            };
        });

        const switcher = createSwitcher();
        switcher.onInsertLeave('leaf-1');
        expect(mockExecuteImSet).not.toHaveBeenCalled();

        endCallback!();
        await vi.advanceTimersByTimeAsync(0);
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
    });

    it('only executes the last deferred switch', async () => {
        mockIsAnyViewComposing.mockReturnValue(true);
        let endCallback: (() => void) | null = null;
        mockOnAllCompositionsEnd.mockImplementation((cb: () => void) => {
            endCallback = cb;
            return () => {
                endCallback = null;
            };
        });

        const switcher = createSwitcher();
        switcher.onInsertLeave('leaf-1');
        switcher.onInsertEnter('leaf-1');
        expect(mockExecuteImSet).not.toHaveBeenCalled();

        endCallback!();
        await Promise.resolve();
        // Only the last call (onInsertEnter → restore) should execute,
        // not onInsertLeave.
        expect(mockExecuteImSet).toHaveBeenCalledTimes(0);
    });

    it('proceeds normally when isAnyViewComposing returns false', async () => {
        mockIsAnyViewComposing.mockReturnValue(false);
        mockExecuteImGet.mockResolvedValue(
            'com.tencent.inputmethod.wetype.pinyin',
        );
        const switcher = createSwitcher();

        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await vi.advanceTimersByTimeAsync(0);
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
        expect(mockOnAllCompositionsEnd).not.toHaveBeenCalled();
    });
});

describe('destroy', () => {
    it('prevents post-destroy callbacks from executing', async () => {
        const switcher = createSwitcher();
        switcher.onInsertLeave('leaf-1');
        switcher.destroy();
        vi.advanceTimersByTime(50);
        await Promise.resolve();
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('clears saved state', async () => {
        const switcher = createSwitcher({ restoreBehavior: 'restore' });
        mockExecuteImGet.mockResolvedValue('com.apple.keylayout.Dvorak');
        await switcher.save('leaf-1');
        switcher.destroy();
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('cleans up composition end subscription', () => {
        mockIsAnyViewComposing.mockReturnValue(true);
        const unsubscribe = vi.fn();
        mockOnAllCompositionsEnd.mockReturnValue(unsubscribe);

        const switcher = createSwitcher();
        switcher.onInsertLeave('leaf-1');
        expect(mockOnAllCompositionsEnd).toHaveBeenCalled();

        switcher.destroy();
        expect(unsubscribe).toHaveBeenCalled();
    });
});

describe('cleanupView', () => {
    it('removes per-view IM state', async () => {
        const switcher = createSwitcher({ restoreBehavior: 'restore' });
        mockExecuteImGet.mockResolvedValue('com.apple.keylayout.Dvorak');
        await switcher.save('imw_0');

        switcher.cleanupView('imw_0');
        switcher.restore('imw_0');
        await Promise.resolve();
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });
});

describe('setAutoWire', () => {
    it('updates config.autoWire value', () => {
        const switcher = createSwitcher({ autoWire: true });
        switcher.setAutoWire(false);
        expect(switcher.config.autoWire).toBe(false);
    });
});

describe('getDialogPrefix', () => {
    function getDialogPrefix(dialog: HTMLElement): string | null {
        const firstSpan = dialog.querySelector('span');
        if (!firstSpan) return null;
        for (const child of Array.from(firstSpan.childNodes)) {
            if (child.nodeType === 3) {
                const text = child.textContent?.trim();
                if (text === ':' || text === '/' || text === '?') {
                    return text;
                }
                return null;
            }
        }
        return null;
    }

    function makeDialog(prefix: string): HTMLElement {
        const textNode = { nodeType: 3, textContent: prefix };
        const inputNode = { nodeType: 1 };
        const span = { childNodes: [textNode, inputNode] };
        return {
            querySelector: (sel: string) => (sel === 'span' ? span : null),
        } as unknown as HTMLElement;
    }

    it('detects : prefix', () => {
        expect(getDialogPrefix(makeDialog(':'))).toBe(':');
    });

    it('detects / prefix', () => {
        expect(getDialogPrefix(makeDialog('/'))).toBe('/');
    });

    it('detects ? prefix', () => {
        expect(getDialogPrefix(makeDialog('?'))).toBe('?');
    });

    it('returns null for non-cmdline prefix', () => {
        expect(getDialogPrefix(makeDialog('recording @a'))).toBeNull();
    });

    it('returns null for empty dialog', () => {
        const div = {
            querySelector: () => null,
        } as unknown as HTMLElement;
        expect(getDialogPrefix(div)).toBeNull();
    });
});
