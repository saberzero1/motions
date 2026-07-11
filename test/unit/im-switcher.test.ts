import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImSwitcher, ImSwitcherConfig } from '../../src/im/im-switcher';

const { mockExecuteImGet, mockExecuteImSet, mockIsValidImIdentifier } =
    vi.hoisted(() => ({
        mockExecuteImGet: vi.fn(),
        mockExecuteImSet: vi.fn(),
        mockIsValidImIdentifier: vi.fn(),
    }));

vi.mock('../../src/im/im-process', () => ({
    executeImGet: mockExecuteImGet,
    executeImSet: mockExecuteImSet,
    isValidImIdentifier: mockIsValidImIdentifier,
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

class FakeElement extends EventTarget {}

function ensureDomGlobals(): void {
    const scope = globalThis as typeof globalThis & {
        window?: Window & typeof globalThis;
        document?: Document;
        Event?: typeof Event;
    };

    if (!scope.Event) {
        class MockEvent {
            type: string;

            constructor(type: string) {
                this.type = type;
            }
        }

        scope.Event = MockEvent as unknown as typeof Event;
    }

    if (!scope.window) {
        scope.window = globalThis as unknown as Window & typeof globalThis;
    }

    if (!scope.document) {
        scope.document = {
            createElement: () => new FakeElement() as unknown as HTMLElement,
        } as unknown as Document;
    }
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    ensureDomGlobals();
    mockExecuteImGet.mockReset().mockResolvedValue('com.apple.keylayout.ABC');
    mockExecuteImSet.mockReset().mockResolvedValue(true);
    mockIsValidImIdentifier.mockReset().mockReturnValue(true);
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
    it('save(leafId) stores lastKnownIm in per-leaf cache', async () => {
        const switcher = createSwitcher();
        switcher.lastKnownIm = 'com.apple.keylayout.Dvorak';
        switcher.save('leaf-1');
        await Promise.resolve();
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.Dvorak',
        );
    });

    it("restore(leafId) with restoreBehavior: 'restore' calls set with saved IM", async () => {
        const switcher = createSwitcher({ restoreBehavior: 'restore' });
        switcher.lastKnownIm = 'com.apple.keylayout.Dvorak';
        switcher.save('leaf-1');
        await Promise.resolve();
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
        switcher.lastKnownIm = 'com.apple.keylayout.ABC';
        switcher.save('leaf-1');
        switcher.lastKnownIm = 'com.apple.keylayout.Dvorak';
        switcher.save('leaf-2');
        await Promise.resolve();

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
        const switcher = createSwitcher();
        const saveSpy = vi.spyOn(switcher, 'save');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await Promise.resolve();
        expect(saveSpy).toHaveBeenCalledWith('leaf-1');
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
    });

    it('skips set when lastKnownIm already equals defaultNormalIm', async () => {
        const switcher = createSwitcher();
        switcher.lastKnownIm = 'com.apple.keylayout.ABC';
        const saveSpy = vi.spyOn(switcher, 'save');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await Promise.resolve();
        expect(saveSpy).toHaveBeenCalledWith('leaf-1');
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('does nothing when defaultNormalIm is empty', async () => {
        const switcher = createSwitcher({ defaultNormalIm: '' });
        const saveSpy = vi.spyOn(switcher, 'save');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await Promise.resolve();
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
        const switcher = createSwitcher();
        switcher.onInsertLeave('leaf-1');
        switcher.onInsertLeave('leaf-1');
        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledTimes(1);
    });
});

describe('composition guard', () => {
    it('defers switching during composition and executes after compositionend', async () => {
        const switcher = createSwitcher();
        const el = document.createElement('div');
        switcher.reattachCompositionListeners(el);
        el.dispatchEvent(new Event('compositionstart'));

        switcher.onInsertLeave('leaf-1');
        vi.advanceTimersByTime(50);
        expect(mockExecuteImSet).not.toHaveBeenCalled();

        el.dispatchEvent(new Event('compositionend'));
        await Promise.resolve();
        expect(mockExecuteImSet).toHaveBeenCalledWith(
            switcher.config.switchConfig,
            'com.apple.keylayout.ABC',
        );
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
        switcher.lastKnownIm = 'com.apple.keylayout.Dvorak';
        switcher.save('leaf-1');
        await Promise.resolve();
        switcher.destroy();
        switcher.restore('leaf-1');
        await Promise.resolve();
        expect(mockExecuteImSet).not.toHaveBeenCalled();
    });

    it('removes composition listeners from element', () => {
        const switcher = createSwitcher();
        const el = document.createElement('div');
        const removeSpy = vi.spyOn(el, 'removeEventListener');
        switcher.reattachCompositionListeners(el);
        switcher.destroy();
        expect(removeSpy).toHaveBeenCalledWith(
            'compositionstart',
            expect.any(Function),
        );
        expect(removeSpy).toHaveBeenCalledWith(
            'compositionend',
            expect.any(Function),
        );
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
