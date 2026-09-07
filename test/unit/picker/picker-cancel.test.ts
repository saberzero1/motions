import { describe, it, expect, beforeEach, vi } from 'vitest';

// The real Obsidian `Modal.close()` invokes `onClose()`. The shared mock's
// `close()` is a no-op, which would hide the exact ordering under test:
// `confirmSelection` closes the modal BEFORE dispatching the selection, so
// `onClose` runs first.
vi.mock('obsidian', async () => {
    const actual = await vi.importActual<
        typeof import('../__mocks__/obsidian')
    >('../__mocks__/obsidian');
    class Modal {
        app: unknown;
        contentEl = { empty: () => {} } as unknown as HTMLElement;
        modalEl = { removeClass: () => {} } as unknown as HTMLElement;
        constructor(app: unknown) {
            this.app = app;
        }
        open(): void {}
        close(): void {
            (this as unknown as { onClose?: () => void }).onClose?.();
        }
    }
    return { ...actual, Modal };
});

const { PickerModal } = await import('../../../src/picker/picker');
import type { PickerItem, PickerSource } from '../../../src/picker/types';

describe('picker selection vs cancellation', () => {
    const item: PickerItem = { id: 'a', label: 'Alpha' };
    let onSelect: ReturnType<typeof vi.fn>;
    let onCancel: ReturnType<typeof vi.fn>;

    function makeModal() {
        onSelect = vi.fn();
        onCancel = vi.fn();
        const source = {
            name: 'test',
            items: () => [item],
            onSelect,
        } as unknown as PickerSource;
        const app = {
            workspace: { getActiveViewOfType: () => null },
        } as never;
        const modal = new PickerModal(
            app,
            source,
            { search: () => [] },
            { source: 'test', onCancel },
        );
        const internals = modal as unknown as {
            currentMatches: { item: PickerItem; score: number }[];
            selectedIndex: number;
            confirmSelection: () => void;
        };
        internals.currentMatches = [{ item, score: 1 }];
        internals.selectedIndex = 0;
        return { modal, internals };
    }

    beforeEach(() => {
        vi.useFakeTimers();
        PickerModal.activeInstance = null;
    });

    it('a confirmed selection fires onSelect once and never onCancel', () => {
        const { internals } = makeModal();
        internals.confirmSelection();
        vi.runAllTimers();
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('closing without a selection fires onCancel exactly once', () => {
        const { modal } = makeModal();
        modal.close();
        vi.runAllTimers();
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('closeActive() cancels a live picker', () => {
        const { modal } = makeModal();
        PickerModal.activeInstance = modal;
        PickerModal.closeActive();
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('closeActive() is a no-op when nothing is open', () => {
        expect(() => PickerModal.closeActive()).not.toThrow();
    });
});
