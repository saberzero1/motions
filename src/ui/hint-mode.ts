import type { App } from 'obsidian';
import type { ActionFn } from '../types/vim-api';

const HOME_ROW = 'asdfghjkl';
const ALL_KEYS = 'abcdefghijklmnopqrstuvwxyz';

const TARGET_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    '[role="button"]',
    '[role="tab"]',
    '.clickable-icon',
    '.nav-file-title',
    '.nav-folder-title',
    '.workspace-tab-header',
    '.tree-item-self',
].join(', ');

function generateHintLabels(count: number): string[] {
    const labels: string[] = [];
    for (const first of HOME_ROW) {
        for (const second of ALL_KEYS) {
            labels.push(first + second);
            if (labels.length >= count) return labels;
        }
    }
    for (const first of ALL_KEYS) {
        if (HOME_ROW.includes(first)) continue;
        for (const second of ALL_KEYS) {
            labels.push(first + second);
            if (labels.length >= count) return labels;
        }
    }
    return labels;
}

function isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0
    );
}

interface HintTarget {
    element: Element;
    label: string;
    labelEl: HTMLElement;
}

function showHints(targets: HintTarget[], container: HTMLElement): void {
    for (const target of targets) {
        const rect = target.element.getBoundingClientRect();
        const el = container.createSpan({
            cls: 'vim-motions-hint-label',
            text: target.label,
        });
        el.style.setProperty(
            '--vim-motions-hint-left',
            `${rect.left + window.scrollX}px`,
        );
        el.style.setProperty(
            '--vim-motions-hint-top',
            `${rect.top + window.scrollY}px`,
        );
        target.labelEl = el;
    }
}

function waitForHintKey(targets: HintTarget[]): Promise<HintTarget | null> {
    return new Promise((resolve) => {
        let firstChar = '';

        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                activeDocument.removeEventListener('keydown', handler, true);
                resolve(null);
                return;
            }

            if (firstChar === '') {
                firstChar = e.key;
                for (const t of targets) {
                    if (!t.label.startsWith(firstChar)) {
                        // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- dynamic CSS custom property for hint filtering
                        t.labelEl.style.setProperty(
                            '--vim-motions-hint-opacity',
                            '0.2',
                        );
                    }
                }
                return;
            }

            activeDocument.removeEventListener('keydown', handler, true);
            const fullLabel = firstChar + e.key;
            const match = targets.find((t) => t.label === fullLabel);
            resolve(match ?? null);
        };

        activeDocument.addEventListener('keydown', handler, true);
    });
}

export function createHintModeAction(app: App): ActionFn {
    return () => {
        const allElements = activeDocument.querySelectorAll(TARGET_SELECTOR);
        const visible = Array.from(allElements).filter(isVisible);
        if (visible.length === 0) return;

        const labels = generateHintLabels(visible.length);
        const container = createDiv({ cls: 'vim-motions-hint-overlay' });
        activeDocument.body.appendChild(container);

        const targets: HintTarget[] = visible.map((el, i) => ({
            element: el,
            label: labels[i] ?? '',
            labelEl: createSpan(),
        }));

        showHints(targets, container);

        void waitForHintKey(targets).then((match) => {
            container.remove();
            if (match) {
                (match.element as HTMLElement).click();
            }
        });
    };
}
