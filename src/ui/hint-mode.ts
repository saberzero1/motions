import { MarkdownView, Notice, type WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';

export const HOME_ROW = 'asdfghjkl';
export const ALL_KEYS = 'abcdefghijklmnopqrstuvwxyz';

let hintModeActive = false;

export function isHintModeActive(): boolean {
    return hintModeActive;
}

// Standard HTML selectors (stable across Obsidian versions)
const STANDARD_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
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
    '.checkbox-container',
    '.modal-header-button',
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
    targetType: 'link' | 'pane' | 'tab' | 'button' | 'input' | 'generic';
    leaf?: WorkspaceLeaf;
    href?: string;
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
        hintModeActive = true;

        const cleanup = () => {
            hintModeActive = false;
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

function classifyTarget(
    el: Element,
    app: App,
): {
    targetType: HintTarget['targetType'];
    leaf?: WorkspaceLeaf;
    href?: string;
} {
    if (el.classList.contains('workspace-leaf-content')) {
        return {
            targetType: 'pane',
            leaf: findLeafForElement(app, el as HTMLElement) ?? undefined,
        };
    }

    if (el.classList.contains('workspace-tab-header')) {
        return {
            targetType: 'tab',
            leaf: findLeafForElement(app, el as HTMLElement) ?? undefined,
        };
    }

    if (
        el.instanceOf(HTMLAnchorElement) ||
        el.matches('[data-href]') ||
        el.classList.contains('cm-underline')
    ) {
        const href =
            el.getAttribute('data-href') ??
            (el.instanceOf(HTMLAnchorElement) ? el.getAttribute('href') : null);
        return {
            targetType: 'link',
            href: href ?? undefined,
        };
    }

    if (
        el.instanceOf(HTMLInputElement) ||
        el.instanceOf(HTMLTextAreaElement) ||
        el.instanceOf(HTMLSelectElement) ||
        el.getAttribute('contenteditable') === 'true'
    ) {
        return { targetType: 'input' };
    }

    if (
        el.instanceOf(HTMLButtonElement) ||
        el.classList.contains('clickable-icon') ||
        el.matches('[role="button"]')
    ) {
        return { targetType: 'button' };
    }

    return { targetType: 'generic' };
}

function hintActivate(
    app: App,
    target: HintTarget,
    openInNewPane: boolean,
): boolean {
    const el = target.element as HTMLElement;
    const inModal = !!el.closest('.modal-container');

    if (target.targetType === 'pane') {
        if (target.leaf) {
            app.workspace.setActiveLeaf(target.leaf, { focus: true });
            const mdView = app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                mdView.editor.focus();
            }
        }
        return !inModal;
    }

    if (target.targetType === 'input') {
        el.focus();
        if (el.instanceOf(HTMLSelectElement)) {
            const sel = el;
            const next = (sel.selectedIndex + 1) % sel.options.length;
            sel.selectedIndex = next;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            if (inModal) el.blur();
        } else {
            el.click();
        }
        return !inModal;
    }

    const linkHref = target.href ?? null;
    const isInternalLink =
        linkHref &&
        !linkHref.startsWith('http://') &&
        !linkHref.startsWith('https://');

    if (isInternalLink) {
        const activeFile = app.workspace.getActiveFile()?.path ?? '';
        void app.workspace.openLinkText(linkHref, activeFile, openInNewPane);
        return !inModal;
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
        return !inModal;
    }

    el.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
    el.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, cancelable: true }),
    );
    el.click();
    if (inModal) {
        el.blur();
        const focused = activeDocument.activeElement as HTMLElement | null;
        if (focused && el.contains(focused)) {
            focused.blur();
        }
    }
    return !inModal;
}

function hintOpenNew(app: App, target: HintTarget): boolean {
    if (target.targetType === 'link' || target.targetType === 'pane') {
        return hintActivate(app, target, true);
    }
    return hintActivate(app, target, false);
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const textarea = activeDocument.createEl('textarea', {
            cls: 'vim-motions-clipboard-helper',
        });
        textarea.value = text;
        activeDocument.body.appendChild(textarea);
        textarea.select();
        try {
            await navigator.clipboard.writeText(text);
        } finally {
            textarea.remove();
        }
        return true;
    }
}

function hintYank(_app: App, target: HintTarget): boolean {
    const el = target.element as HTMLElement;
    let text = '';

    if (target.targetType === 'link' && target.href) {
        text = target.href;
    } else if (target.targetType === 'tab' || target.targetType === 'pane') {
        const view = target.leaf?.view;
        text =
            view?.getDisplayText?.() ??
            (view instanceof MarkdownView ? view.file?.path : '') ??
            '';
    } else {
        text = el.ariaLabel || el.title || el.textContent || '';
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
        new Notice('Nothing to copy');
        return true;
    }

    void copyToClipboard(trimmed).then((ok) => {
        if (ok) {
            const preview =
                trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
            new Notice(`Copied: ${preview}`);
        } else {
            new Notice('Failed to copy');
        }
    });

    return !el.closest('.modal-container');
}

function hintClose(_app: App, target: HintTarget): boolean {
    if (
        (target.targetType === 'tab' || target.targetType === 'pane') &&
        target.leaf?.view
    ) {
        target.leaf.detach();
        return false;
    }

    new Notice('Cannot close this element');
    return false;
}

function refocusEditor(app: App): void {
    window.setTimeout(() => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            view.editor.focus();
        }
    }, 150);
}

export function createHintModeAction(
    app: App,
    hintChars?: string,
    fontSize?: () => number,
): () => void {
    return createHintActions(app, hintChars, fontSize).activate;
}

function createHintAction(
    app: App,
    actionName: 'activate' | 'openNew' | 'yank' | 'close',
    hintChars?: string,
    fontSize?: () => number,
): (count?: number) => void {
    const actions = {
        activate: (app: App, target: HintTarget) =>
            hintActivate(app, target, false),
        openNew: hintOpenNew,
        yank: hintYank,
        close: hintClose,
    } as const;

    const run = (count?: number, showNotice: boolean = true): void => {
        const allElements = activeDocument.querySelectorAll(TARGET_SELECTOR);
        const visible = Array.from(allElements)
            .filter(isVisible)
            .filter(
                (el) =>
                    !el.closest('.checkbox-container') ||
                    el.classList.contains('checkbox-container'),
            )
            .filter((el) => !el.classList.contains('is-measuring'));
        if (visible.length === 0) {
            if (showNotice) {
                new Notice('No hint targets found');
            }
            return;
        }

        const labels = generateHintLabels(visible.length, hintChars);
        const container = createDiv({ cls: 'vim-motions-hint-overlay' });
        const fs = fontSize ? fontSize() : 14;
        container.style.setProperty('--vim-motions-hint-font-size', `${fs}px`);
        activeDocument.body.appendChild(container);

        const targets: HintTarget[] = visible.map((el, i) => {
            const classified = classifyTarget(el, app);
            return {
                element: el,
                label: labels[i] ?? '',
                labelEl: createSpan(),
                targetType: classified.targetType,
                leaf: classified.leaf,
                href: classified.href,
            };
        });

        showHints(targets, container);

        void waitForHintKey(targets).then((result) => {
            container.remove();
            if (!result.target) return;
            if (!result.target.element.isConnected) {
                new Notice('Target is no longer available');
                return;
            }

            let action = actions[actionName];
            if (
                actionName === 'activate' &&
                (result.ctrlKey || result.metaKey)
            ) {
                action = actions.openNew;
            }

            const shouldRefocus = action(app, result.target);
            if (shouldRefocus) {
                refocusEditor(app);
            }

            if (count && count > 1) {
                window.requestAnimationFrame(() => {
                    run(count - 1, false);
                });
            }
        });
    };

    return (count?: number) => run(count ?? 1);
}

export function createHintActions(
    app: App,
    hintChars?: string,
    fontSize?: () => number,
): {
    activate: (count?: number) => void;
    openNew: (count?: number) => void;
    yank: (count?: number) => void;
    close: (count?: number) => void;
} {
    return {
        activate: createHintAction(app, 'activate', hintChars, fontSize),
        openNew: createHintAction(app, 'openNew', hintChars, fontSize),
        yank: createHintAction(app, 'yank', hintChars, fontSize),
        close: createHintAction(app, 'close', hintChars, fontSize),
    };
}
