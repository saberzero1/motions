import { MarkdownView, Notice, type WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { setKeyInterceptActive } from '@replit/codemirror-vim';
import { findLinkAtCursor } from '../motions/goto-definition';
import { navigateWithJump } from '../workspace/navigate';

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
    '.cm-hmd-internal-link',
    '.cm-link',
    '.cm-url',
    '.menu-item',
    '.modal-close-button',
    '.vertical-tab-nav-item',
    '.checkbox-container',
    '.modal-header-button',
    '.workspace-drawer-vault-switcher',
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
    const positions: { left: number; top: number }[] = [];
    for (const target of targets) {
        const pos = getHintPosition(target.element);
        positions.push(pos);
        const el = container.createSpan({
            cls: 'vim-motions-hint-label',
            text: target.label,
        });
        el.style.setProperty('--vim-motions-hint-left', `${pos.left}px`);
        el.style.setProperty('--vim-motions-hint-top', `${pos.top}px`);
        target.labelEl = el;
    }

    resolveOverlaps(targets, positions);
}

export function resolveOverlaps(
    targets: HintTarget[],
    positions: { left: number; top: number }[],
): void {
    if (targets.length < 2) return;

    const placed: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }[] = [];

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const pos = positions[i];
        if (!target || !pos) continue;

        const el = target.labelEl;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        let labelLeft = pos.left;
        let labelTop = pos.top;
        const width = rect.width;
        const height = rect.height;
        let right = labelLeft + width;
        let bottom = labelTop + height;

        for (const prev of placed) {
            if (
                labelLeft < prev.right &&
                right > prev.left &&
                labelTop < prev.bottom &&
                bottom > prev.top
            ) {
                labelTop = prev.bottom;
                bottom = labelTop + height;
            }
        }

        placed.push({ left: labelLeft, top: labelTop, right, bottom });

        if (labelTop !== pos.top || labelLeft !== pos.left) {
            el.style.setProperty('--vim-motions-hint-left', `${labelLeft}px`);
            el.style.setProperty('--vim-motions-hint-top', `${labelTop}px`);
        }
    }
}

interface HintResult {
    target: HintTarget | null;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}

function waitForHintKey(targets: HintTarget[]): Promise<HintResult> {
    return new Promise((resolve) => {
        let firstChar = '';
        hintModeActive = true;
        setKeyInterceptActive(true);

        const cleanup = () => {
            hintModeActive = false;
            setKeyInterceptActive(false);
            activeDocument.removeEventListener('keydown', handler, true);
        };

        const handler = (e: KeyboardEvent) => {
            if (
                e.key === 'Shift' ||
                e.key === 'Control' ||
                e.key === 'Alt' ||
                e.key === 'Meta'
            ) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                cleanup();
                resolve({
                    target: null,
                    ctrlKey: false,
                    altKey: false,
                    metaKey: false,
                    shiftKey: false,
                });
                return;
            }

            const key = e.shiftKey ? e.key.toLowerCase() : e.key;

            if (firstChar === '') {
                if (e.key === 'Backspace') return;

                const anyMatch = targets.some((t) => t.label.startsWith(key));
                if (!anyMatch) {
                    cleanup();
                    resolve({
                        target: null,
                        ctrlKey: false,
                        altKey: false,
                        metaKey: false,
                        shiftKey: false,
                    });
                    return;
                }

                firstChar = key;
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
                        altKey: e.altKey,
                        metaKey: e.metaKey,
                        shiftKey: e.shiftKey,
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
            const fullLabel = firstChar + key;
            const match = targets.find((t) => t.label === fullLabel);
            resolve({
                target: match ?? null,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                shiftKey: e.shiftKey,
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

function editorViewFromMarkdownView(mdView: MarkdownView): EditorView | null {
    try {
        return mdView.editor.cm ?? null;
    } catch {
        return null;
    }
}

function getEditorViewFromElement(el: Element, app: App): EditorView | null {
    const cmEditor = el.closest('.cm-editor');
    if (!cmEditor) return null;
    const cmView = (cmEditor as unknown as Record<string, unknown>).cmView as
        { view?: EditorView } | undefined;
    if (cmView?.view) return cmView.view;
    const leaf = findLeafForElement(app, el as HTMLElement);
    if (leaf?.view instanceof MarkdownView) {
        return editorViewFromMarkdownView(leaf.view);
    }
    return null;
}

function resolveCmUnderlineHref(el: Element, app: App): string | undefined {
    const editorView = getEditorViewFromElement(el, app);
    if (!editorView) return undefined;
    try {
        const pos = editorView.posAtDOM(el, 0);
        const line = editorView.state.doc.lineAt(pos);
        const ch = pos - line.from;
        const link = findLinkAtCursor(line.text, ch);
        return link?.target;
    } catch {
        return undefined;
    }
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
        el.classList.contains('cm-underline') ||
        el.classList.contains('cm-hmd-internal-link') ||
        el.classList.contains('cm-link') ||
        el.classList.contains('cm-url')
    ) {
        const href =
            el.getAttribute('data-href') ??
            (el.instanceOf(HTMLAnchorElement)
                ? el.getAttribute('href')
                : null) ??
            (el.classList.contains('cm-underline') ||
            el.classList.contains('cm-hmd-internal-link') ||
            el.classList.contains('cm-link') ||
            el.classList.contains('cm-url')
                ? resolveCmUnderlineHref(el, app)
                : undefined);
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

function getElementCenter(el: Element): { clientX: number; clientY: number } {
    const rect = el.getBoundingClientRect();
    return {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
    };
}

async function hintActivate(
    app: App,
    target: HintTarget,
    openInNewPane: boolean,
): Promise<boolean> {
    const el = target.element as HTMLElement;
    const inModal = !!el.closest('.modal-container');

    if (target.targetType === 'pane') {
        if (target.leaf) {
            if (openInNewPane) {
                await app.workspace.duplicateLeaf(target.leaf, 'tab');
            } else {
                app.workspace.setActiveLeaf(target.leaf, { focus: true });
                const mdView = app.workspace.getActiveViewOfType(MarkdownView);
                if (mdView) {
                    mdView.editor.focus();
                }
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
    const isExternalLink =
        linkHref &&
        (linkHref.startsWith('http://') || linkHref.startsWith('https://'));
    const isInternalLink = linkHref && !isExternalLink;

    if (isInternalLink) {
        const activeFile = app.workspace.getActiveFile()?.path ?? '';
        await navigateWithJump(app, linkHref, activeFile, {
            newTab: openInNewPane,
        });
        return !inModal;
    }

    if (isExternalLink) {
        window.open(linkHref);
        return !inModal;
    }

    if (openInNewPane) {
        const { clientX, clientY } = getElementCenter(el);
        el.dispatchEvent(
            new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                ctrlKey: true,
                metaKey: true,
                clientX,
                clientY,
            }),
        );
        return !inModal;
    }

    const { clientX, clientY } = getElementCenter(el);
    el.dispatchEvent(
        new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
        }),
    );
    el.dispatchEvent(
        new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
        }),
    );
    el.dispatchEvent(
        new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
        }),
    );
    if (inModal) {
        el.blur();
        const focused = activeDocument.activeElement as HTMLElement | null;
        if (focused && el.contains(focused)) {
            focused.blur();
        }
    }
    return !inModal;
}

function hintOpenNew(app: App, target: HintTarget): Promise<boolean> {
    return hintActivate(app, target, true);
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

function hintContextMenu(_app: App, target: HintTarget): boolean {
    const el = target.element as HTMLElement;
    const { clientX, clientY } = getElementCenter(el);
    el.dispatchEvent(
        new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
        }),
    );
    return true;
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
    actionName: 'activate' | 'openNew' | 'yank' | 'close' | 'contextMenu',
    hintChars?: string,
    fontSize?: () => number,
): (count?: number) => void {
    const actions = {
        activate: (app: App, target: HintTarget) =>
            hintActivate(app, target, false),
        openNew: hintOpenNew,
        yank: (app: App, target: HintTarget) =>
            Promise.resolve(hintYank(app, target)),
        close: (app: App, target: HintTarget) =>
            Promise.resolve(hintClose(app, target)),
        contextMenu: (app: App, target: HintTarget) =>
            Promise.resolve(hintContextMenu(app, target)),
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
            .filter((el) => !el.classList.contains('is-measuring'))
            .filter(
                (el) =>
                    !(
                        el.classList.contains('cm-underline') &&
                        (el.closest('.cm-hmd-internal-link') ||
                            el.closest('.cm-link'))
                    ),
            )
            .filter((el) => {
                if (el.classList.contains('cm-formatting-link')) return false;
                if (!el.classList.contains('cm-hmd-internal-link')) return true;
                const prev = el.previousElementSibling;
                return (
                    !prev || !prev.classList.contains('cm-hmd-internal-link')
                );
            })
            .filter((el) => {
                if (!el.classList.contains('cm-link')) return true;
                const prev = el.previousElementSibling;
                return (
                    !prev ||
                    !prev.classList.contains('cm-link') ||
                    prev.classList.contains('cm-formatting-link')
                );
            })
            .filter((el) => {
                if (!el.classList.contains('cm-url')) return true;
                return !el.classList.contains('cm-string');
            });
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

        const originalLeaf =
            count && count > 1 ? app.workspace.getMostRecentLeaf() : null;

        void waitForHintKey(targets).then(async (result) => {
            container.remove();
            if (!result.target) return;
            if (!result.target.element.isConnected) {
                new Notice('Target is no longer available');
                return;
            }

            let action = actions[actionName];
            if (actionName === 'activate') {
                if (result.ctrlKey || result.metaKey) {
                    action = actions.openNew;
                } else if (result.shiftKey) {
                    action = actions.contextMenu;
                }
            }

            const shouldRefocus = await action(app, result.target);

            if (count && count > 1 && originalLeaf) {
                app.workspace.setActiveLeaf(originalLeaf, { focus: true });
                window.requestAnimationFrame(() => {
                    run(count - 1, false);
                });
            } else if (shouldRefocus) {
                refocusEditor(app);
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
    contextMenu: (count?: number) => void;
} {
    return {
        activate: createHintAction(app, 'activate', hintChars, fontSize),
        openNew: createHintAction(app, 'openNew', hintChars, fontSize),
        yank: createHintAction(app, 'yank', hintChars, fontSize),
        close: createHintAction(app, 'close', hintChars, fontSize),
        contextMenu: createHintAction(app, 'contextMenu', hintChars, fontSize),
    };
}
