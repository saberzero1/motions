import type { CmAdapter } from '../types/vim-api';
import type { LabeledTarget } from './types';

export interface OverlayHandle {
    cleanup: () => void;
    updateLabels: (targets: LabeledTarget[]) => void;
}

export function showOverlay(
    cm: CmAdapter,
    targets: LabeledTarget[],
    options?: { shade?: boolean },
): OverlayHandle | null {
    const view = cm.cm6;
    if (!view) return null;

    const wrapper = createDiv({ cls: 'vim-motions-easymotion' });
    view.scrollDOM.appendChild(wrapper);

    let shade: HTMLElement | null = null;
    if (options?.shade) {
        shade = createDiv({ cls: 'vim-motions-easymotion-shade' });
        wrapper.appendChild(shade);
    }

    const labelContainer = createDiv();
    wrapper.appendChild(labelContainer);

    function renderLabels(items: LabeledTarget[]) {
        labelContainer.empty();
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

            if (target.label.length === 1) {
                const el = labelContainer.createSpan({
                    cls: 'vim-motions-easymotion-label',
                    text: target.label,
                });
                el.style.setProperty(
                    '--vim-motions-em-left',
                    `${coords.left - scrollRect.left + scrollLeft}px`,
                );
                el.style.setProperty(
                    '--vim-motions-em-top',
                    `${coords.top - scrollRect.top + scrollTop}px`,
                );
            } else {
                const group = labelContainer.createSpan({
                    cls: 'vim-motions-easymotion-label',
                });
                group.style.setProperty(
                    '--vim-motions-em-left',
                    `${coords.left - scrollRect.left + scrollLeft}px`,
                );
                group.style.setProperty(
                    '--vim-motions-em-top',
                    `${coords.top - scrollRect.top + scrollTop}px`,
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

    renderLabels(targets);

    return {
        cleanup: () => wrapper.remove(),
        updateLabels: renderLabels,
    };
}
