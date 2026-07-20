import type { EditorView } from '@codemirror/view';
import type { CmAdapter } from '../types/vim-api';
import type { Target, LabeledTarget } from './types';

const COORD_SNAP = 2;
const MIN_HIGHLIGHT_WIDTH = 4;

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

interface TargetRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

function measureTarget(
    view: EditorView,
    cm: CmAdapter,
    target: Target,
    scrollRect: DOMRect,
    scrollLeft: number,
    scrollTop: number,
): TargetRect | null {
    const ml = target.matchLength ?? 1;
    const startOffset = cm.indexFromPos({ line: target.line, ch: target.ch });
    const startCoords = view.coordsAtPos(startOffset);
    if (!startCoords) return null;

    const left = startCoords.left - scrollRect.left + scrollLeft;
    const top = startCoords.top - scrollRect.top + scrollTop;
    const height = startCoords.bottom - startCoords.top;

    const endOffset = Math.min(startOffset + ml, view.state.doc.length);
    const endCoords = view.coordsAtPos(endOffset);
    let width: number;
    if (endCoords && Math.abs(endCoords.top - startCoords.top) < COORD_SNAP) {
        width = Math.abs(endCoords.left - startCoords.left);
    } else {
        const nextCoords = view.coordsAtPos(
            Math.min(startOffset + 1, view.state.doc.length),
        );
        if (
            nextCoords &&
            Math.abs(nextCoords.top - startCoords.top) < COORD_SNAP
        ) {
            width = (nextCoords.left - startCoords.left) * ml;
        } else {
            width = 8 * ml;
        }
    }
    width = Math.max(width, MIN_HIGHLIGHT_WIDTH);

    return { left, top, width, height };
}

function measureLabelAnchor(
    view: EditorView,
    cm: CmAdapter,
    target: Target,
    scrollRect: DOMRect,
    scrollLeft: number,
    scrollTop: number,
): { left: number; top: number } | null {
    const ml = target.matchLength ?? 1;
    const startOffset = cm.indexFromPos({ line: target.line, ch: target.ch });
    const startCoords = view.coordsAtPos(startOffset);
    if (!startCoords) return null;

    const endOffset = Math.min(startOffset + ml, view.state.doc.length);
    const endCoords = view.coordsAtPos(endOffset);

    if (endCoords && Math.abs(endCoords.top - startCoords.top) < COORD_SNAP) {
        return {
            left: endCoords.left - scrollRect.left + scrollLeft,
            top: endCoords.top - scrollRect.top + scrollTop,
        };
    }

    const nextCoords = view.coordsAtPos(
        Math.min(startOffset + 1, view.state.doc.length),
    );
    const charW =
        nextCoords && Math.abs(nextCoords.top - startCoords.top) < COORD_SNAP
            ? nextCoords.left - startCoords.left
            : 8;
    return {
        left: startCoords.left - scrollRect.left + scrollLeft + charW * ml,
        top: startCoords.top - scrollRect.top + scrollTop,
    };
}

function renderHighlightSpans(
    container: HTMLElement,
    view: EditorView,
    cm: CmAdapter,
    targets: Target[],
): void {
    container.empty();
    const scrollRect = view.scrollDOM.getBoundingClientRect();
    const scrollLeft = view.scrollDOM.scrollLeft;
    const scrollTop = view.scrollDOM.scrollTop;

    for (const target of targets) {
        const rect = measureTarget(
            view,
            cm,
            target,
            scrollRect,
            scrollLeft,
            scrollTop,
        );
        if (!rect) continue;

        const el = container.createSpan({ cls: 'vim-motions-flash-match' });
        el.style.setProperty('--vim-motions-em-left', `${rect.left}px`);
        el.style.setProperty('--vim-motions-em-top', `${rect.top}px`);
        el.style.setProperty('--vim-motions-flash-w', `${rect.width}px`);
        el.style.setProperty('--vim-motions-flash-h', `${rect.height}px`);
    }
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

    renderHighlightSpans(container, view, cm, targets);

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

    const highlightContainer = createDiv();
    wrapper.appendChild(highlightContainer);

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
            const anchor = measureLabelAnchor(
                view,
                cm,
                target,
                scrollRect,
                scrollLeft,
                scrollTop,
            );
            if (!anchor) continue;

            let labelLeft = anchor.left;
            let labelTop = anchor.top;
            const width = labelWidth(target.label.length);

            let right = labelLeft + width;
            let bottom = labelTop + LABEL_HEIGHT;
            for (const prev of placed) {
                if (
                    labelLeft < prev.right &&
                    right > prev.left &&
                    labelTop < prev.bottom &&
                    bottom > prev.top
                ) {
                    labelTop = prev.bottom;
                    bottom = labelTop + LABEL_HEIGHT;
                }
            }
            placed.push({ left: labelLeft, top: labelTop, right, bottom });

            if (target.label.length === 1) {
                const el = labelContainer.createSpan({
                    cls: 'vim-motions-easymotion-label',
                    text: target.label,
                });
                el.style.setProperty('--vim-motions-em-left', `${labelLeft}px`);
                el.style.setProperty('--vim-motions-em-top', `${labelTop}px`);
            } else {
                const group = labelContainer.createSpan({
                    cls: 'vim-motions-easymotion-label',
                });
                group.style.setProperty(
                    '--vim-motions-em-left',
                    `${labelLeft}px`,
                );
                group.style.setProperty(
                    '--vim-motions-em-top',
                    `${labelTop}px`,
                );
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

    renderHighlightSpans(highlightContainer, view, cm, targets);
    renderLabels(targets);

    return {
        cleanup: () => {
            shade?.remove();
            wrapper.remove();
        },
        updateLabels: renderLabels,
    };
}
