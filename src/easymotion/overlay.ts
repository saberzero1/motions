import type { CmAdapter } from '../types/vim-api';
import type { Target, LabeledTarget } from './types';

const COORD_SNAP = 2;

export function filterVisibleTargets(
    cm: CmAdapter,
    targets: Target[],
): Target[] {
    const view = cm.cm6;
    if (!view) return targets;
    const seen: { left: number; top: number }[] = [];
    return targets.filter((t) => {
        const offset = cm.indexFromPos({ line: t.line, ch: t.ch });
        const coords = view.coordsAtPos(offset);
        if (!coords) return false;
        const dup = seen.some(
            (s) =>
                Math.abs(s.left - coords.left) < COORD_SNAP &&
                Math.abs(s.top - coords.top) < COORD_SNAP,
        );
        if (dup) return false;
        seen.push({ left: coords.left, top: coords.top });
        return true;
    });
}

export interface OverlayHandle {
    cleanup: () => void;
    updateLabels: (targets: LabeledTarget[]) => void;
}

export function showMatchHighlights(
    cm: CmAdapter,
    targets: Target[],
): OverlayHandle | null {
    const view = cm.cm6;
    if (!view) return null;

    const wrapper = createDiv({ cls: 'vim-motions-easymotion' });
    view.scrollDOM.appendChild(wrapper);

    const container = createDiv();
    wrapper.appendChild(container);

    function render(items: Target[]) {
        container.empty();
        const scrollRect = view.scrollDOM.getBoundingClientRect();
        const scrollLeft = view.scrollDOM.scrollLeft;
        const scrollTop = view.scrollDOM.scrollTop;

        for (const target of items) {
            const offset = cm.indexFromPos({
                line: target.line,
                ch: target.ch,
            });
            const coords = view.coordsAtPos(offset);
            if (!coords) continue;

            const left = coords.left - scrollRect.left + scrollLeft;
            const top = coords.top - scrollRect.top + scrollTop;

            const el = container.createSpan({
                cls: 'vim-motions-flash-match',
            });
            el.style.setProperty('--vim-motions-em-left', `${left}px`);
            el.style.setProperty('--vim-motions-em-top', `${top}px`);
        }
    }

    render(targets);

    return {
        cleanup: () => wrapper.remove(),
        updateLabels: () => {},
    };
}

export function showOverlay(
    cm: CmAdapter,
    targets: LabeledTarget[],
    options?: { shade?: boolean; fontSize?: number },
): OverlayHandle | null {
    const view = cm.cm6;
    if (!view) return null;

    const fs = options?.fontSize ?? 14;

    // Shade is appended directly to scrollDOM (not inside the wrapper)
    // so that its `right: 0; bottom: 0` resolves against the full
    // scrollDOM dimensions instead of the zero-size wrapper.
    let shade: HTMLElement | null = null;
    if (options?.shade) {
        shade = createDiv({ cls: 'vim-motions-easymotion-shade' });
        view.scrollDOM.appendChild(shade);
    }

    const wrapper = createDiv({ cls: 'vim-motions-easymotion' });
    wrapper.style.setProperty('--vim-motions-em-font-size', `${fs}px`);
    view.scrollDOM.appendChild(wrapper);

    const labelContainer = createDiv();
    wrapper.appendChild(labelContainer);

    const LABEL_CHAR_WIDTH = fs * 0.6;
    const LABEL_PAD_X = 6;
    const LABEL_HEIGHT = fs + 2;

    function labelWidth(len: number): number {
        return len * LABEL_CHAR_WIDTH + LABEL_PAD_X;
    }

    function renderLabels(items: LabeledTarget[]) {
        labelContainer.empty();
        const scrollRect = view.scrollDOM.getBoundingClientRect();
        const scrollLeft = view.scrollDOM.scrollLeft;
        const scrollTop = view.scrollDOM.scrollTop;

        const placed: {
            left: number;
            top: number;
            right: number;
            bottom: number;
        }[] = [];

        for (const target of items) {
            const offset = cm.indexFromPos({
                line: target.line,
                ch: target.ch,
            });
            const coords = view.coordsAtPos(offset);
            if (!coords) continue;

            let left = coords.left - scrollRect.left + scrollLeft;
            let top = coords.top - scrollRect.top + scrollTop;
            const width = labelWidth(target.label.length);

            let right = left + width;
            let bottom = top + LABEL_HEIGHT;
            for (const prev of placed) {
                if (
                    left < prev.right &&
                    right > prev.left &&
                    top < prev.bottom &&
                    bottom > prev.top
                ) {
                    top = prev.bottom;
                    bottom = top + LABEL_HEIGHT;
                }
            }
            placed.push({ left, top, right, bottom });

            if (target.label.length === 1) {
                const el = labelContainer.createSpan({
                    cls: 'vim-motions-easymotion-label',
                    text: target.label,
                });
                el.style.setProperty('--vim-motions-em-left', `${left}px`);
                el.style.setProperty('--vim-motions-em-top', `${top}px`);
            } else {
                const group = labelContainer.createSpan({
                    cls: 'vim-motions-easymotion-label',
                });
                group.style.setProperty('--vim-motions-em-left', `${left}px`);
                group.style.setProperty('--vim-motions-em-top', `${top}px`);
                group.createSpan({
                    cls: 'vim-motions-easymotion-label-first',
                    text: target.label[0],
                });
                group.createSpan({
                    cls: 'vim-motions-easymotion-label-second',
                    text: target.label.slice(1),
                });
            }
        }
    }

    renderLabels(targets);

    return {
        cleanup: () => {
            shade?.remove();
            wrapper.remove();
        },
        updateLabels: renderLabels,
    };
}
