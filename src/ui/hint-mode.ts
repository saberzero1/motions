import { MarkdownView, type WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';

export const HOME_ROW = 'asdfghjkl';
export const ALL_KEYS = 'abcdefghijklmnopqrstuvwxyz';

// Standard HTML selectors (stable across Obsidian versions)
const STANDARD_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input[type="checkbox"]',
    '[role="button"]',
    '[role="tab"]',
    '[data-href]',
];

// Obsidian-internal selectors (may change between versions)
const OBSIDIAN_SELECTORS = [
    '.clickable-icon',
    '.nav-file-title',
    '.nav-folder-title',
    '.nav-action-button',
    '.workspace-tab-header',
    '.workspace-tab-header-inner-close-button',
    '.workspace-leaf-content',
    '.tree-item-self',
    '.tree-item-icon',
    '.side-dock-ribbon-action',
    '.callout-fold',
    '.cm-underline',
    '.menu-item',
    '.modal-close-button',
    '.vertical-tab-nav-item',
    '.setting-item-control button',
    '.setting-item-control .checkbox-container',
    '.setting-item-control select',
    '.setting-group-search-control .setting-group-filter',
    '.modal-header-button',
    '.search-input-container input',
];

export const TARGET_SELECTOR = [
    ...STANDARD_SELECTORS,
    ...OBSIDIAN_SELECTORS,
].join(', ');

export function generateHintLabels(
    count: number,
    hintChars: string = HOME_ROW,
): string[] {
    if (count <= hintChars.length) {
        return Array.from(hintChars.slice(0, count));
    }
    const labels: string[] = [];
    for (const first of hintChars) {
        for (const second of ALL_KEYS) {
            labels.push(first + second);
            if (labels.length >= count) return labels;
        }
    }
    for (const first of ALL_KEYS) {
        if (hintChars.includes(first)) continue;
        for (const second of ALL_KEYS) {
            labels.push(first + second);
            if (labels.length >= count) return labels;
        }
    }
    return labels;
}

function isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.top >= activeWindow.innerHeight ||
        rect.bottom <= 0 ||
        rect.left >= activeWindow.innerWidth ||
        rect.right <= 0
    ) {
        return false;
    }

    let ancestor = el.parentElement;
    while (ancestor) {
        const overflow = activeWindow.getComputedStyle(ancestor).overflow;
        if (
            overflow === 'hidden' ||
            overflow === 'scroll' ||
            overflow === 'auto'
        ) {
            const parentRect = ancestor.getBoundingClientRect();
            if (
                rect.bottom <= parentRect.top ||
                rect.top >= parentRect.bottom ||
                rect.right <= parentRect.left ||
                rect.left >= parentRect.right
            ) {
                return false;
            }
        }
        ancestor = ancestor.parentElement;
    }
    return true;
}

interface HintTarget {
    element: Element;
    label: string;
    labelEl: HTMLElement;
}

function getHintPosition(element: Element): { left: number; top: number } {
    const rect = element.getBoundingClientRect();

    if (element.classList.contains('workspace-leaf-content')) {
        const editor =
            element.querySelector('.cm-editor') ??
            element.querySelector('.markdown-preview-view');
        if (editor) {
            const editorRect = editor.getBoundingClientRect();
            return {
                left: editorRect.left + activeWindow.scrollX + 8,
                top: editorRect.top + activeWindow.scrollY + 8,
            };
        }
    }

    return {
        left: rect.left + activeWindow.scrollX,
        top: rect.top + activeWindow.scrollY,
    };
}

function showHints(targets: HintTarget[], container: HTMLElement): void {
    for (const target of targets) {
        const pos = getHintPosition(target.element);
        const el = container.createSpan({
            cls: 'vim-motions-hint-label',
            text: target.label,
        });
        el.style.setProperty('--vim-motions-hint-left', `${pos.left}px`);
        el.style.setProperty('--vim-motions-hint-top', `${pos.top}px`);
        target.labelEl = el;
    }
}

interface HintResult {
    target: HintTarget | null;
    ctrlKey: boolean;
    metaKey: boolean;
}

function waitForHintKey(targets: HintTarget[]): Promise<HintResult> {
    return new Promise((resolve) => {
        let firstChar = '';

        const cleanup = () => {
            activeDocument.removeEventListener('keydown', handler, true);
        };

        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                cleanup();
                resolve({ target: null, ctrlKey: false, metaKey: false });
                return;
            }

            if (firstChar === '') {
                if (e.key === 'Backspace') return;

                const anyMatch = targets.some((t) => t.label.startsWith(e.key));
                if (!anyMatch) {
                    cleanup();
                    resolve({ target: null, ctrlKey: false, metaKey: false });
                    return;
                }

                firstChar = e.key;
                for (const t of targets) {
                    if (!t.label.startsWith(firstChar)) {
                        t.labelEl.classList.add('is-dimmed');
                    }
                }

                const exactMatch = targets.find((t) => t.label === firstChar);
                if (exactMatch) {
                    cleanup();
                    resolve({
                        target: exactMatch,
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                    });
                }
                return;
            }

            if (e.key === 'Backspace') {
                firstChar = '';
                for (const t of targets) {
                    t.labelEl.classList.remove('is-dimmed');
                }
                return;
            }

            cleanup();
            const fullLabel = firstChar + e.key;
            const match = targets.find((t) => t.label === fullLabel);
            resolve({
                target: match ?? null,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
            });
        };

        activeDocument.addEventListener('keydown', handler, true);
    });
}

function findLeafForElement(app: App, el: HTMLElement): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    app.workspace.iterateAllLeaves((leaf) => {
        if (found) return;
        if (leaf.view.containerEl.contains(el)) {
            found = leaf;
        }
    });
    return found;
}

function activateElement(
    app: App,
    el: HTMLElement,
    openInNewPane: boolean,
): void {
    if (el.classList.contains('workspace-leaf-content')) {
        const leaf = findLeafForElement(app, el);
        if (leaf) {
            app.workspace.setActiveLeaf(leaf, { focus: true });
            const mdView = app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                mdView.editor.focus();
            }
        }
        return;
    }

    if (el.getAttribute('contenteditable') === 'true') {
        el.focus();
        return;
    }

    const linkHref =
        el.getAttribute('data-href') ??
        (el.instanceOf(HTMLAnchorElement) ? el.getAttribute('href') : null);
    const isInternalLink =
        linkHref &&
        !linkHref.startsWith('http://') &&
        !linkHref.startsWith('https://');

    if (isInternalLink) {
        const activeFile = app.workspace.getActiveFile()?.path ?? '';
        void app.workspace.openLinkText(linkHref, activeFile, openInNewPane);
        return;
    }

    if (openInNewPane) {
        el.dispatchEvent(
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                ctrlKey: true,
                metaKey: true,
            }),
        );
        return;
    }

    el.click();
}

function refocusEditor(app: App): void {
    window.setTimeout(() => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            view.editor.focus();
        }
    }, 150);
}

export function createHintModeAction(app: App, hintChars?: string): () => void {
    return () => {
        const allElements = activeDocument.querySelectorAll(TARGET_SELECTOR);
        const visible = Array.from(allElements).filter(isVisible);
        if (visible.length === 0) return;

        const labels = generateHintLabels(visible.length, hintChars);
        const container = createDiv({ cls: 'vim-motions-hint-overlay' });
        activeDocument.body.appendChild(container);

        const targets: HintTarget[] = visible.map((el, i) => ({
            element: el,
            label: labels[i] ?? '',
            labelEl: createSpan(),
        }));

        showHints(targets, container);

        void waitForHintKey(targets).then((result) => {
            container.remove();
            if (result.target) {
                const openInNewPane = result.ctrlKey || result.metaKey;
                activateElement(
                    app,
                    result.target.element as HTMLElement,
                    openInNewPane,
                );
            }
            refocusEditor(app);
        });
    };
}
