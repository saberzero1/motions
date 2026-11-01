import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    InputMethodManager,
    type ImSwitcherConfig,
} from '../../src/im/input-method-manager';
import type { InputMethodArea } from '../../src/im/types';

const { executeImGet, executeImSet, isValidImIdentifier, isAnyViewComposing } =
    vi.hoisted(() => ({
        executeImGet: vi.fn(),
        executeImSet: vi.fn(),
        isValidImIdentifier: vi.fn(),
        isAnyViewComposing: vi.fn(),
    }));

vi.mock('../../src/im/im-process', () => ({
    executeImGet,
    executeImSet,
    isValidImIdentifier,
}));

vi.mock('../../src/im/composition-tracker', () => ({
    isAnyViewComposing,
    onAllCompositionsEnd: vi.fn(() => () => {}),
}));

vi.mock('obsidian', () => ({
    Notice: class {
        constructor() {}
    },
}));

function createManager(
    resolvers?: ConstructorParameters<typeof InputMethodManager>[1],
): InputMethodManager {
    const config: ImSwitcherConfig = {
        enabled: true,
        autoWire: true,
        defaultNormalIm: '1033',
        restoreBehavior: 'restore',
        defaultInsertIm: '',
        findDefaultIm: '1033',
        obtainConfig: { binary: 'im-select.exe', args: [], timeoutMs: 5000 },
        switchConfig: {
            binary: 'im-select.exe',
            args: ['{im}'],
            timeoutMs: 5000,
        },
    };
    return new InputMethodManager(config, resolvers);
}

const noteArea: InputMethodArea = {
    key: 'note:Vault:one.md',
    kind: 'note',
    viewId: 'imw_1',
    mode: 'insert',
};

async function flushOperations(): Promise<void> {
    for (let i = 0; i < 24; i++) await Promise.resolve();
}

beforeEach(() => {
    executeImGet.mockReset();
    executeImSet.mockReset();
    isValidImIdentifier.mockReset().mockReturnValue(true);
    isAnyViewComposing.mockReset().mockReturnValue(false);
});

describe('InputMethodManager', () => {
    it('keeps a note IM when its editor view is destroyed', async () => {
        executeImGet.mockResolvedValue('2052');
        executeImSet.mockResolvedValue(true);
        const manager = createManager();

        await manager.save(noteArea);
        manager.cleanupView(noteArea.viewId!);
        manager.restore(noteArea);
        await flushOperations();

        expect(executeImSet).toHaveBeenCalledWith(
            manager.config.switchConfig,
            '2052',
        );
    });

    it('does not interfere when returning to the same area after an app switch', async () => {
        executeImGet.mockResolvedValue('2052');
        const manager = createManager({
            resolveFocusedArea: () => noteArea,
        });

        manager.onFocusIn(noteArea);
        await flushOperations();
        manager.onWindowBlur();
        await flushOperations();

        manager.lastKnownIm = '1033';
        manager.onWindowFocus();
        await flushOperations();

        expect(executeImSet).not.toHaveBeenCalled();
    });

    it('handles focusout arriving before the window blur event', async () => {
        executeImGet.mockResolvedValue('2052');
        const manager = createManager({
            resolveFocusedArea: () => noteArea,
        });

        manager.onFocusIn(noteArea);
        await flushOperations();
        manager.onFocusOut(noteArea);
        manager.onWindowBlur();
        manager.onWindowFocus();
        await flushOperations();

        expect(executeImSet).not.toHaveBeenCalled();
    });

    it('restores normal IM when a new note replaces the focused editor', async () => {
        executeImSet.mockResolvedValue(true);
        const oldArea: InputMethodArea = {
            ...noteArea,
            mode: 'insert',
        };
        const newArea: InputMethodArea = {
            key: 'note:Vault:two.md',
            kind: 'note',
            viewId: noteArea.viewId,
            mode: 'normal',
        };
        let focusedArea = oldArea;
        const manager = createManager({
            resolveFocusedArea: () => focusedArea,
        });
        manager.loadPersistedState({ [oldArea.key]: '2052' });

        manager.onFocusIn(oldArea);
        await flushOperations();
        executeImSet.mockClear();
        focusedArea = newArea;
        manager.onFocusedAreaChanged();
        await flushOperations();

        expect(executeImSet).toHaveBeenLastCalledWith(
            manager.config.switchConfig,
            '1033',
        );
    });

    it('does not restore a stale area after a newer focus event', async () => {
        executeImSet.mockResolvedValue(true);
        const manager = createManager();
        const areaA: InputMethodArea = {
            key: 'input:copilot:leaf-a:prompt:1',
            kind: 'input',
            mode: 'insert',
        };
        const areaB: InputMethodArea = {
            key: 'input:copilot:leaf-b:prompt:1',
            kind: 'input',
            mode: 'insert',
        };
        manager.loadPersistedState({
            [areaA.key]: '2052',
            [areaB.key]: '1033',
        });

        manager.onFocusIn(areaA);
        manager.onFocusIn(areaB);
        await flushOperations();

        expect(executeImSet).toHaveBeenCalledTimes(1);
        expect(executeImSet).toHaveBeenCalledWith(
            manager.config.switchConfig,
            '1033',
        );
    });

    it('saves the insert IM before leaving a note for normal mode', async () => {
        executeImGet
            .mockResolvedValueOnce('1033')
            .mockResolvedValueOnce('2052');
        executeImSet.mockResolvedValue(true);
        const manager = createManager({
            resolveViewArea: () => ({ ...noteArea, mode: 'normal' }),
        });

        manager.onFocusIn(noteArea);
        await flushOperations();
        manager.onInsertLeave(noteArea.viewId!);
        await flushOperations();

        expect(executeImGet).toHaveBeenCalled();
        expect(executeImSet).toHaveBeenLastCalledWith(
            manager.config.switchConfig,
            '1033',
        );

        manager.cleanupView(noteArea.viewId!);
        manager.lastKnownIm = '1033';
        manager.onFocusIn(noteArea);
        await flushOperations();
        expect(executeImSet).toHaveBeenLastCalledWith(
            manager.config.switchConfig,
            '2052',
        );
    });

    it('does not resave a note after it has entered normal mode', async () => {
        executeImGet.mockResolvedValue('2052');
        executeImSet.mockResolvedValue(true);
        const manager = createManager({
            resolveViewArea: () => ({ ...noteArea, mode: 'normal' }),
        });

        manager.onFocusIn(noteArea);
        await flushOperations();
        manager.onInsertLeave(noteArea.viewId!);
        await flushOperations();
        executeImGet.mockClear();

        manager.onWindowBlur();
        await flushOperations();

        expect(executeImGet).not.toHaveBeenCalled();
    });

    it('restores the target area after returning from another application', async () => {
        executeImSet.mockResolvedValue(true);
        const normalArea: InputMethodArea = {
            ...noteArea,
            mode: 'normal',
        };
        const otherArea: InputMethodArea = {
            key: 'note:Vault:two.md',
            kind: 'note',
            viewId: 'imw_2',
            mode: 'normal',
        };
        const manager = createManager({
            resolveFocusedArea: () => otherArea,
        });

        manager.onFocusIn(normalArea);
        await flushOperations();
        executeImSet.mockClear();
        manager.onWindowBlur();
        // The external application may have changed IM to 2052 while our
        // cached value still says 1033; restore must not trust that cache.
        manager.lastKnownIm = '1033';
        manager.onWindowFocus();
        await flushOperations();

        expect(executeImSet).toHaveBeenLastCalledWith(
            manager.config.switchConfig,
            '1033',
        );
    });
});
