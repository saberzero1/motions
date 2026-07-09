import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type {
    GlobalMappingRegistry,
    GlobalMapGate,
} from './global-mapping-registry';
import { executeCommand } from './navigation';
import { GlobalExCommandModal } from '../ui/global-ex-command';
import type { OilManager } from '../oil/manager';

export const LINE_HEIGHT = 40;

function closeAllTabs(app: App): void {
    const active = app.workspace.getLeaf(false);
    app.workspace.iterateAllLeaves((leaf) => {
        if (leaf !== active) {
            leaf.detach();
        }
    });
}

// Helper functions moved from global-key-handler.ts:
function getScrollContainer(app: App): HTMLElement | null {
    const mdView = app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView) {
        if (
            (mdView as unknown as { getMode: () => string }).getMode() ===
            'source'
        )
            return null;
        const preview = mdView.containerEl.querySelector(
            '.markdown-preview-view',
        );
        return preview as HTMLElement | null;
    }

    const leaf = app.workspace.getMostRecentLeaf();
    if (!leaf?.view) return null;
    const content = leaf.view.containerEl.querySelector('.view-content');
    if (!content) return null;

    return findLargestScrollable(content);
}

function findLargestScrollable(root: Element): HTMLElement | null {
    const walker = root.ownerDocument.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
    );
    let best: HTMLElement | null = null;
    let bestArea = 0;

    let node = walker.nextNode();
    while (node) {
        const el = node as HTMLElement;
        const style = el.ownerDocument.defaultView?.getComputedStyle(el);
        if (
            style &&
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight
        ) {
            const area = el.clientWidth * el.clientHeight;
            if (area > bestArea) {
                best = el;
                bestArea = area;
            }
        }
        node = walker.nextNode();
    }
    return best;
}

function closeOtherTabs(app: App): void {
    closeAllTabs(app);
}

function gotoNthTab(app: App, n: number): void {
    const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
    app.workspace.iterateAllLeaves((leaf) => {
        leaves.push(leaf);
    });
    const target = leaves[n - 1];
    if (target) {
        app.workspace.setActiveLeaf(target, { focus: true });
    }
}

// Scroll helpers
function scrollBy(app: App, dy: number): void {
    const container = getScrollContainer(app);
    if (container) container.scrollBy({ top: dy, behavior: 'auto' });
}

function scrollTo(app: App, top: number): void {
    const container = getScrollContainer(app);
    if (container) container.scrollTo({ top, behavior: 'auto' });
}

function scrollToEnd(app: App): void {
    const container = getScrollContainer(app);
    if (container)
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'auto',
        });
}

function scrollHalfPage(app: App, direction: 1 | -1): void {
    const container = getScrollContainer(app);
    if (container)
        container.scrollBy({
            top: (direction * container.clientHeight) / 2,
            behavior: 'auto',
        });
}

function scrollFullPage(app: App, direction: 1 | -1): void {
    const container = getScrollContainer(app);
    if (!container) return;
    const distance = container.clientHeight - 2 * LINE_HEIGHT;
    container.scrollBy({ top: direction * distance, behavior: 'auto' });
}

export function registerDefaultGlobalMappings(
    registry: GlobalMappingRegistry,
    app: App,
    hintActions: {
        activate: (count?: number) => void;
        openNew: (count?: number) => void;
        yank: (count?: number) => void;
        close: (count?: number) => void;
    } | null,
    openPicker?: (source: string, opts?: { query?: string }) => void,
    oilManager?: OilManager,
): void {
    void app;
    const add = (
        keys: string,
        action: Parameters<GlobalMappingRegistry['addMapping']>[1],
        gate: GlobalMapGate,
        name?: string,
    ): void => {
        registry.addMapping(keys, action, { source: 'default', gate, name });
    };

    const noop = (_app: App, _count: number): void => {
        return;
    };

    add(
        'j',
        {
            type: 'builtin',
            fn: (app2, count) => scrollBy(app2, LINE_HEIGHT * count),
        },
        'standard',
        'scrollDown',
    );
    add(
        'k',
        {
            type: 'builtin',
            fn: (app2, count) => scrollBy(app2, -LINE_HEIGHT * count),
        },
        'standard',
        'scrollUp',
    );
    add(
        'H',
        { type: 'obcommand', commandId: 'workspace:previous-tab' },
        'standard',
        'previousTab',
    );
    add(
        'L',
        { type: 'obcommand', commandId: 'workspace:next-tab' },
        'standard',
        'nextTab',
    );
    add(
        'G',
        { type: 'builtin', fn: (app2) => scrollToEnd(app2) },
        'standard',
        'scrollToEnd',
    );
    add(
        'gg',
        { type: 'builtin', fn: (app2) => scrollTo(app2, 0) },
        'standard',
        'scrollToTop',
    );
    add(
        'gt',
        {
            type: 'builtin',
            fn: (app2, count) => {
                if (count > 0) {
                    gotoNthTab(app2, count);
                } else {
                    executeCommand(app2, 'workspace:next-tab');
                }
            },
        },
        'structural',
        'gotoTab',
    );
    add(
        'gT',
        { type: 'obcommand', commandId: 'workspace:previous-tab' },
        'structural',
        'gotoPrevTab',
    );
    add(
        '<C-d>',
        { type: 'builtin', fn: (app2) => scrollHalfPage(app2, 1) },
        'standard',
        'scrollHalfPageDown',
    );
    add(
        '<C-u>',
        { type: 'builtin', fn: (app2) => scrollHalfPage(app2, -1) },
        'standard',
        'scrollHalfPageUp',
    );
    add(
        '<C-f>',
        { type: 'builtin', fn: (app2) => scrollFullPage(app2, 1) },
        'standard',
        'scrollFullPageDown',
    );
    add(
        '<C-b>',
        { type: 'builtin', fn: (app2) => scrollFullPage(app2, -1) },
        'standard',
        'scrollFullPageUp',
    );
    add(
        '<C-o>',
        { type: 'obcommand', commandId: 'app:go-back' },
        'structural',
        'goBack',
    );
    add(
        '<C-i>',
        { type: 'obcommand', commandId: 'app:go-forward' },
        'structural',
        'goForward',
    );
    add(
        '<C-w>h',
        { type: 'obcommand', commandId: 'editor:focus-left' },
        'structural',
        'focusPaneLeft',
    );
    add(
        '<C-w>j',
        { type: 'obcommand', commandId: 'editor:focus-bottom' },
        'structural',
        'focusPaneDown',
    );
    add(
        '<C-w>k',
        { type: 'obcommand', commandId: 'editor:focus-top' },
        'structural',
        'focusPaneUp',
    );
    add(
        '<C-w>l',
        { type: 'obcommand', commandId: 'editor:focus-right' },
        'structural',
        'focusPaneRight',
    );
    add(
        '<C-w>v',
        { type: 'obcommand', commandId: 'workspace:split-vertical' },
        'structural',
        'splitVertical',
    );
    add(
        '<C-w>s',
        { type: 'obcommand', commandId: 'workspace:split-horizontal' },
        'structural',
        'splitHorizontal',
    );
    add(
        '<C-w>c',
        { type: 'obcommand', commandId: 'workspace:close' },
        'structural',
        'closeTab',
    );
    add(
        '<C-w>q',
        { type: 'obcommand', commandId: 'workspace:close' },
        'structural',
        'closeTabAlt',
    );
    add(
        '<C-w>o',
        { type: 'builtin', fn: (app2) => closeOtherTabs(app2) },
        'structural',
        'closeOtherTabs',
    );
    add(
        ':',
        {
            type: 'builtin',
            fn: (app2) => {
                new GlobalExCommandModal(
                    app2,
                    registry,
                    openPicker,
                    oilManager,
                ).open();
            },
        },
        'structural',
        'exCommandLine',
    );
    add('z', { type: 'builtin', fn: noop }, 'standard');
    add('<C-w>g', { type: 'builtin', fn: noop }, 'structural');

    if (hintActions !== null) {
        add(
            'f',
            {
                type: 'builtin',
                fn: (_app2, count) => hintActions.activate(count),
            },
            'hint',
        );
        add(
            'F',
            {
                type: 'builtin',
                fn: (_app2, count) => hintActions.openNew(count),
            },
            'hint',
        );
        add(
            'yf',
            { type: 'builtin', fn: (_app2, count) => hintActions.yank(count) },
            'hint',
        );
        add(
            'df',
            { type: 'builtin', fn: (_app2, count) => hintActions.close(count) },
            'hint',
        );
    }
}
