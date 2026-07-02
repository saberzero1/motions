import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type { VimMotionsSettings } from '../settings';
import type { VimModeTracker } from '../vim/mode-tracker';
import { executeCommand } from './navigation';
import { GlobalExCommandModal } from '../ui/global-ex-command';

// ── Types ───────────────────────────────────────────────────────

const enum SeqState {
    IDLE,
    COUNT,
    G_PENDING,
    CW_PENDING,
    CW_G_PENDING,
    Z_PENDING,
}

const SEQUENCE_TIMEOUT = 1000;

// ── Helpers ─────────────────────────────────────────────────────

function isEditorOrInputFocused(doc: Document): boolean {
    const el = doc.activeElement;
    if (!el) return false;

    if (el.closest('.cm-editor')) return true;

    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    if (el.closest('.prompt-input')) return true;

    return false;
}

function closeAllTabs(app: App): void {
    const active = app.workspace.getLeaf(false);
    app.workspace.iterateAllLeaves((leaf) => {
        if (leaf !== active) {
            leaf.detach();
        }
    });
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

const LINE_HEIGHT = 40;

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

// ── GlobalKeyHandler ────────────────────────────────────────────

export class GlobalKeyHandler {
    private app: App;
    private settings: VimMotionsSettings;
    private modeTracker: VimModeTracker | null;

    private docs = new Set<Document>();
    private cleanups: (() => void)[] = [];

    private state: SeqState = SeqState.IDLE;
    private count = 0;
    private timer: number | null = null;

    constructor(
        app: App,
        settings: VimMotionsSettings,
        modeTracker: VimModeTracker | null,
    ) {
        this.app = app;
        this.settings = settings;
        this.modeTracker = modeTracker;
    }

    // ── Lifecycle ───────────────────────────────────────────────

    install(): void {
        const mainDoc =
            this.app.workspace.containerEl.ownerDocument ?? document;
        this.installOnDocument(mainDoc);

        const ref = this.app.workspace.on(
            'window-open',
            (_workspaceWindow, win) => {
                this.installOnDocument(win.document);
            },
        );
        this.cleanups.push(() => this.app.workspace.offref(ref));
    }

    private installOnDocument(doc: Document): void {
        if (this.docs.has(doc)) return;
        this.docs.add(doc);

        const handler = (e: KeyboardEvent) => this.onKeydown(e, doc);
        doc.addEventListener('keydown', handler, true);
        this.cleanups.push(() => {
            doc.removeEventListener('keydown', handler, true);
        });
    }

    destroy(): void {
        this.resetSequence();
        for (const fn of this.cleanups) fn();
        this.cleanups = [];
        this.docs.clear();
    }

    // ── Sequence helpers ────────────────────────────────────────

    private resetSequence(): void {
        this.state = SeqState.IDLE;
        this.count = 0;
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        this.modeTracker?.setGlobalChord('');
    }

    private startTimeout(): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(
            () => this.resetSequence(),
            SEQUENCE_TIMEOUT,
        );
    }

    private chordText(): string {
        const countStr = this.count > 0 ? String(this.count) : '';
        switch (this.state) {
            case SeqState.G_PENDING:
                return countStr + 'g';
            case SeqState.CW_PENDING:
                return countStr + '<C-w>';
            case SeqState.CW_G_PENDING:
                return countStr + '<C-w>g';
            case SeqState.Z_PENDING:
                return countStr + 'z';
            default:
                return countStr;
        }
    }

    private updateChord(): void {
        this.modeTracker?.setGlobalChord(this.chordText());
    }

    // ── Interception gate ───────────────────────────────────────

    private shouldIntercept(e: KeyboardEvent, doc: Document): boolean {
        if (!this.settings.enableWorkspaceNav) return false;
        if (e.isComposing) return false;
        if (isEditorOrInputFocused(doc)) return false;
        return true;
    }

    // ── Command dispatch ────────────────────────────────────────

    private exec(commandId: string): void {
        executeCommand(this.app, commandId);
    }

    // ── Scroll ──────────────────────────────────────────────────

    private scrollBy(dy: number): void {
        const container = getScrollContainer(this.app);
        if (container) container.scrollBy({ top: dy, behavior: 'auto' });
    }

    private scrollTo(top: number): void {
        const container = getScrollContainer(this.app);
        if (container) container.scrollTo({ top, behavior: 'auto' });
    }

    private scrollToEnd(): void {
        const container = getScrollContainer(this.app);
        if (container)
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'auto',
            });
    }

    private scrollHalfPage(direction: 1 | -1): void {
        const container = getScrollContainer(this.app);
        if (container)
            container.scrollBy({
                top: (direction * container.clientHeight) / 2,
                behavior: 'auto',
            });
    }

    private scrollFullPage(direction: 1 | -1): void {
        const container = getScrollContainer(this.app);
        if (!container) return;
        const distance = container.clientHeight - 2 * LINE_HEIGHT;
        container.scrollBy({ top: direction * distance, behavior: 'auto' });
    }

    // ── Main handler ────────────────────────────────────────────

    private onKeydown(e: KeyboardEvent, doc: Document): void {
        if (this.state !== SeqState.IDLE && this.state !== SeqState.COUNT) {
            this.handlePending(e);
            return;
        }

        if (!this.shouldIntercept(e, doc)) return;

        if (
            e.key === 'Shift' ||
            e.key === 'Control' ||
            e.key === 'Alt' ||
            e.key === 'Meta'
        ) {
            return;
        }

        // <C-o>/<C-i>: jumplist in codemirror-vim, history nav here (non-editor only).
        if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            if (e.key === 'o') {
                e.preventDefault();
                e.stopPropagation();
                this.exec('app:go-back');
                return;
            }
            if (e.key === 'i') {
                e.preventDefault();
                e.stopPropagation();
                this.exec('app:go-forward');
                return;
            }
        }

        if (
            e.key === 'w' &&
            e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey &&
            !e.metaKey
        ) {
            e.preventDefault();
            e.stopPropagation();
            this.state = SeqState.CW_PENDING;
            this.startTimeout();
            this.updateChord();
            return;
        }

        // Ctrl-d/f/b may be intercepted by Chromium before reaching the DOM
        // in some views (e.g. reading mode). They work in graph/canvas/etc.
        if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
            if (e.key === 'd') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollHalfPage(1);
                return;
            }
            if (e.key === 'u') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollHalfPage(-1);
                return;
            }
            if (e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollFullPage(1);
                return;
            }
            if (e.key === 'b') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollFullPage(-1);
                return;
            }
        }

        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.key === 'H') {
                e.preventDefault();
                e.stopPropagation();
                this.exec('workspace:previous-tab');
                return;
            }
            if (e.key === 'L') {
                e.preventDefault();
                e.stopPropagation();
                this.exec('workspace:next-tab');
                return;
            }
            if (e.key === 'G') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollToEnd();
                return;
            }
        }

        if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            if (e.key === 'j') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollBy(LINE_HEIGHT);
                return;
            }
            if (e.key === 'k') {
                e.preventDefault();
                e.stopPropagation();
                this.scrollBy(-LINE_HEIGHT);
                return;
            }
        }

        if (e.key === ':' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            new GlobalExCommandModal(this.app).open();
            return;
        }

        if (
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            e.key >= '1' &&
            e.key <= '9'
        ) {
            e.preventDefault();
            e.stopPropagation();
            this.state = SeqState.COUNT;
            this.count = parseInt(e.key, 10);
            this.startTimeout();
            this.updateChord();
            return;
        }

        if (
            e.key === 'g' &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey
        ) {
            e.preventDefault();
            e.stopPropagation();
            this.state = SeqState.G_PENDING;
            this.startTimeout();
            this.updateChord();
            return;
        }

        if (
            e.key === 'z' &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey
        ) {
            e.preventDefault();
            e.stopPropagation();
            this.state = SeqState.Z_PENDING;
            this.startTimeout();
            this.updateChord();
            return;
        }
    }

    // ── Pending-state continuation ──────────────────────────────

    private handlePending(e: KeyboardEvent): void {
        if (
            e.key === 'Shift' ||
            e.key === 'Control' ||
            e.key === 'Alt' ||
            e.key === 'Meta'
        ) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        switch (this.state) {
            case SeqState.COUNT:
                this.handleCount(e);
                break;
            case SeqState.G_PENDING:
                this.handleGPending(e);
                break;
            case SeqState.CW_PENDING:
                this.handleCwPending(e);
                break;
            case SeqState.CW_G_PENDING:
                this.handleCwGPending(e);
                break;
            case SeqState.Z_PENDING:
                this.handleZPending(e);
                break;
            default:
                this.resetSequence();
        }
    }

    private handleCount(e: KeyboardEvent): void {
        if (
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            e.key >= '0' &&
            e.key <= '9'
        ) {
            this.count = this.count * 10 + parseInt(e.key, 10);
            this.startTimeout();
            this.updateChord();
            return;
        }

        if (
            e.key === 'g' &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey
        ) {
            this.state = SeqState.G_PENDING;
            this.startTimeout();
            this.updateChord();
            return;
        }

        if (
            e.key === 'w' &&
            e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey &&
            !e.metaKey
        ) {
            this.state = SeqState.CW_PENDING;
            this.startTimeout();
            this.updateChord();
            return;
        }

        if (
            e.key === 'z' &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey
        ) {
            this.state = SeqState.Z_PENDING;
            this.startTimeout();
            this.updateChord();
            return;
        }

        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.key === 'H') {
                this.exec('workspace:previous-tab');
                this.resetSequence();
                return;
            }
            if (e.key === 'L') {
                this.exec('workspace:next-tab');
                this.resetSequence();
                return;
            }
            if (e.key === 'G') {
                this.scrollToEnd();
                this.resetSequence();
                return;
            }
        }

        if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            const repeat = this.count || 1;
            if (e.key === 'j') {
                this.scrollBy(LINE_HEIGHT * repeat);
                this.resetSequence();
                return;
            }
            if (e.key === 'k') {
                this.scrollBy(-LINE_HEIGHT * repeat);
                this.resetSequence();
                return;
            }
        }

        this.resetSequence();
    }

    private handleGPending(e: KeyboardEvent): void {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.key === 't' && !e.shiftKey) {
                if (this.count > 0) {
                    gotoNthTab(this.app, this.count);
                } else {
                    this.exec('workspace:next-tab');
                }
                this.resetSequence();
                return;
            }
            if (e.key === 'T') {
                this.exec('workspace:previous-tab');
                this.resetSequence();
                return;
            }

            if (e.key === 't' && e.ctrlKey) {
                if (this.count > 0) {
                    gotoNthTab(this.app, this.count);
                }
                this.resetSequence();
                return;
            }
        }

        if (
            e.key === 'g' &&
            !e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey &&
            !e.metaKey
        ) {
            this.scrollTo(0);
            this.resetSequence();
            return;
        }

        this.resetSequence();
    }

    private handleCwPending(e: KeyboardEvent): void {
        if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            switch (e.key) {
                case 'h':
                    this.exec('editor:focus-left');
                    break;
                case 'j':
                    this.exec('editor:focus-bottom');
                    break;
                case 'k':
                    this.exec('editor:focus-top');
                    break;
                case 'l':
                    this.exec('editor:focus-right');
                    break;
                case 'v':
                    this.exec('workspace:split-vertical');
                    break;
                case 's':
                    this.exec('workspace:split-horizontal');
                    break;
                case 'c':
                case 'q':
                    this.exec('workspace:close');
                    break;
                case 'o':
                    closeOtherTabs(this.app);
                    break;
                case 'g':
                    this.state = SeqState.CW_G_PENDING;
                    this.startTimeout();
                    this.updateChord();
                    return;
                default:
                    break;
            }
        }

        this.resetSequence();
    }

    private handleCwGPending(_e: KeyboardEvent): void {
        this.resetSequence();
    }

    private handleZPending(_e: KeyboardEvent): void {
        this.resetSequence();
    }
}
