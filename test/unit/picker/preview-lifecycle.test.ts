import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import type { App } from 'obsidian';
import type { Component } from '../__mocks__/obsidian';
import type {
    PickerMatch,
    PickerSource,
    PreviewReturn,
} from '../../../src/picker/types';

class PreviewElement {
    children: PreviewElement[] = [];

    constructor(
        readonly text = '',
        readonly cls = '',
    ) {}

    empty(): void {
        this.children = [];
    }

    createDiv(opts: { text?: string; cls?: string } = {}): PreviewElement {
        const child = new PreviewElement(opts.text, opts.cls);
        this.children.push(child);
        return child;
    }

    createEl(
        _tag: string,
        opts: { text?: string; cls?: string } = {},
    ): PreviewElement {
        return this.createDiv(opts);
    }

    get textContent(): string {
        return (
            this.text + this.children.map((child) => child.textContent).join('')
        );
    }
}

describe('picker preview lifecycle (#172)', () => {
    const modals: InstanceType<typeof PickerModal>[] = [];

    function makeModal(preview: NonNullable<PickerSource['preview']>) {
        const items = Array.from({ length: 12 }, (_, index) => ({
            id: `item-${index}`,
            label: `Item ${index}`,
        }));
        const source: PickerSource = {
            name: 'test',
            placeholder: 'Search',
            items: () => items,
            onSelect: () => {},
            preview,
        };
        const app = {
            workspace: { getActiveViewOfType: () => null },
        } as unknown as App;
        const modal = new PickerModal(app, source, { search: () => [] });
        const internals = modal as unknown as {
            currentMatches: PickerMatch[];
            previewEl: HTMLElement;
            previewComponent: Component | null;
            moveSelection: (delta: number) => void;
            updatePreview: () => void;
        };
        internals.currentMatches = items.map((item) => ({
            item,
            score: 0,
            highlights: [],
        }));
        const pane = new PreviewElement();
        internals.previewEl = pane as unknown as HTMLElement;
        modals.push(modal);
        return { internals, pane };
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        for (const modal of modals.splice(0)) modal.close();
        vi.clearAllTimers();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('T1: debounces cross-frame key repeat and previews the final item', async () => {
        const preview = vi.fn<NonNullable<PickerSource['preview']>>(
            (item) => item.id,
        );
        const { internals } = makeModal(preview);

        for (let i = 0; i < 10; i++) {
            internals.moveSelection(1);
            await vi.advanceTimersByTimeAsync(30);
        }
        await vi.runAllTimersAsync();

        expect.soft(preview.mock.calls.length).toBeLessThanOrEqual(2);
        expect(preview.mock.lastCall?.[0].id).toBe('item-10');
    });

    it('T2: starts an isolated preview on the leading edge before timers advance', async () => {
        const preview = vi.fn(() => 'preview');
        const { internals } = makeModal(preview);

        internals.moveSelection(1);
        // Allow the provider's promise boundary, but no debounce or frame timer.
        await Promise.resolve();

        expect(preview).toHaveBeenCalledTimes(1);
    });

    it('T3: unloads rendered preview components when the next preview is null', async () => {
        const preview = vi
            .fn<NonNullable<PickerSource['preview']>>()
            .mockReturnValueOnce({ markdown: '![[embed]]', sourcePath: 'a.md' })
            .mockReturnValue(null);
        const { internals, pane } = makeModal(preview);
        internals.updatePreview();
        await vi.runAllTimersAsync();
        const component = internals.previewComponent;
        const wasLoaded = component?.loaded;

        internals.moveSelection(1);
        await vi.runAllTimersAsync();

        expect({
            wasLoaded,
            loaded: component?.loaded,
            text: pane.textContent,
        }).toEqual({ wasLoaded: true, loaded: false, text: 'No preview' });
    });

    it('T4: unloads rendered preview components when the next preview is raw text', async () => {
        const preview = vi
            .fn<NonNullable<PickerSource['preview']>>()
            .mockReturnValueOnce({ markdown: '![[embed]]', sourcePath: 'a.md' })
            .mockReturnValue('raw preview');
        const { internals, pane } = makeModal(preview);
        internals.updatePreview();
        await vi.runAllTimersAsync();
        const component = internals.previewComponent;
        const wasLoaded = component?.loaded;

        internals.moveSelection(1);
        await vi.runAllTimersAsync();

        expect({
            wasLoaded,
            loaded: component?.loaded,
            text: pane.textContent,
        }).toEqual({ wasLoaded: true, loaded: false, text: 'raw preview' });
    });

    it('T5: catches synchronous provider throws and renders the error message', async () => {
        const { internals, pane } = makeModal(() => {
            throw new Error('provider exploded');
        });

        const runPreview = async () => {
            internals.moveSelection(1);
            await vi.runAllTimersAsync();
        };
        await expect.soft(runPreview()).resolves.toBeUndefined();

        expect(pane.children.map(({ text, cls }) => ({ text, cls }))).toEqual([
            {
                text: 'Preview failed: provider exploded',
                cls: 'vim-motions-picker-preview-empty',
            },
        ]);
    });

    it('T6: ignores an in-flight result after moving away and back to the same item', async () => {
        let resolveOld: (result: PreviewReturn) => void = () => {};
        const oldPreview = new Promise<PreviewReturn>((resolve) => {
            resolveOld = resolve;
        });
        const preview = vi
            .fn<NonNullable<PickerSource['preview']>>()
            .mockReturnValueOnce(oldPreview)
            .mockReturnValue('current preview');
        const { internals, pane } = makeModal(preview);
        internals.updatePreview();
        await vi.advanceTimersByTimeAsync(30);
        internals.moveSelection(1);
        await vi.advanceTimersByTimeAsync(30);
        internals.moveSelection(-1);
        await vi.runAllTimersAsync();

        resolveOld('stale preview');
        await vi.runAllTimersAsync();

        expect(pane.textContent).toBe('current preview');
    });
});
