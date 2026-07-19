import { type WorkspaceLeaf, View } from 'obsidian';
import type { UndoTree } from './undo-tree';

export const UNDO_TREE_VIEW_TYPE = 'undo-tree';

function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export class UndoTreeView extends View {
    static VIEW_TYPE = UNDO_TREE_VIEW_TYPE;

    private containerDiv: HTMLElement | null = null;
    private previewLabelEl: HTMLSpanElement | null = null;
    private previewSummaryEl: HTMLSpanElement | null = null;
    private selectedSeq: number | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private collapsedSeqs = new Set<number>();

    constructor(
        leaf: WorkspaceLeaf,
        private readonly getUndoTree: () => UndoTree,
        private readonly onNavigate?: (seq: number) => void,
    ) {
        super(leaf);
    }

    private get undoTree(): UndoTree {
        return this.getUndoTree();
    }

    getViewType(): string {
        return UndoTreeView.VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Undo tree';
    }

    getIcon(): string {
        return 'history';
    }

    protected async onOpen(): Promise<void> {
        this.containerEl.empty();
        this.containerDiv = this.containerEl.createDiv({
            cls: 'vim-motions-undo-tree-view',
        });
        this.containerDiv.setAttribute('tabindex', '0');
        this.renderTree();

        this.keydownHandler = (e: KeyboardEvent) => {
            this.handleKeydown(e);
        };
        this.containerDiv.addEventListener('keydown', this.keydownHandler);
    }

    protected async onClose(): Promise<void> {
        if (this.containerDiv && this.keydownHandler) {
            this.containerDiv.removeEventListener(
                'keydown',
                this.keydownHandler,
            );
        }
        this.keydownHandler = null;
        this.containerDiv = null;
    }

    refresh(): void {
        this.renderTree();
    }

    private renderTree(): void {
        if (!this.containerDiv) return;
        this.containerDiv.empty();

        this.previewLabelEl = null;
        this.previewSummaryEl = null;

        const nodes = this.undoTree.getAllNodes();
        if (nodes.length === 0) {
            this.containerDiv.createDiv({
                cls: 'vim-motions-undo-empty',
                text: 'No undo history',
            });
            return;
        }

        const currentSeq = this.undoTree.getCurrentSeq();
        if (this.selectedSeq === null) {
            this.selectedSeq = currentSeq;
        }

        const sorted = [...nodes]
            .sort((a, b) => b.seq - a.seq)
            .filter((node) => this.isNodeVisible(node));

        const treeEl = this.containerDiv.createDiv({
            cls: 'vim-motions-undo-tree-content',
        });

        for (const node of sorted) {
            const row = treeEl.createDiv({
                cls: 'vim-motions-undo-node',
            });
            row.dataset['seq'] = String(node.seq);

            if (node.seq === currentSeq) {
                row.addClass('vim-motions-undo-node--current');
            }
            if (node.seq === this.selectedSeq) {
                row.addClass('vim-motions-undo-node--selected');
            }
            if (node.saved) {
                row.addClass('vim-motions-undo-node--saved');
            }

            if (node.children.length > 1) {
                const toggle = row.createSpan({
                    cls: 'vim-motions-undo-branch-toggle',
                    text: this.collapsedSeqs.has(node.seq) ? '▸' : '▾',
                });
                toggle.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (this.collapsedSeqs.has(node.seq)) {
                        this.collapsedSeqs.delete(node.seq);
                    } else {
                        this.collapsedSeqs.add(node.seq);
                    }
                    this.renderTree();
                });
            }

            const connector = row.createSpan({
                cls: 'vim-motions-undo-connector',
            });
            if (node.children.length > 1) {
                connector.textContent = '\u251C\u2500';
            } else {
                connector.textContent = '\u2502';
            }

            const marker = row.createSpan({
                cls: 'vim-motions-undo-marker',
            });
            marker.textContent = node.seq === 0 ? '\u25CB' : '\u25CF';

            row.createSpan({
                cls: 'vim-motions-undo-seq',
                text: String(node.seq),
            });

            row.createSpan({
                cls: 'vim-motions-undo-time',
                text: formatRelativeTime(node.timestamp),
            });

            if (node.changeSummary) {
                row.createSpan({
                    cls: 'vim-motions-undo-change',
                    text: `+${node.changeSummary.inserted} -${node.changeSummary.deleted}`,
                });
            }

            if (node.children.length > 1) {
                row.createSpan({
                    cls: 'vim-motions-undo-branch-indicator',
                    text: `${node.children.length} branches`,
                });
            }

            if (node.saved) {
                row.createSpan({
                    cls: 'vim-motions-undo-flags',
                    text: 'saved',
                });
            }

            row.addEventListener('click', () => {
                this.selectedSeq = node.seq;
                this.onNavigate?.(node.seq);
                this.renderTree();
            });

            row.addEventListener('mouseenter', () => {
                this.updatePreview(node);
            });
            row.addEventListener('mouseleave', () => {
                this.updatePreviewForSeq(this.selectedSeq);
            });
        }

        const previewEl = this.containerDiv.createDiv({
            cls: 'vim-motions-undo-preview',
        });
        this.previewLabelEl = previewEl.createSpan({
            cls: 'vim-motions-undo-preview-label',
        });
        this.previewSummaryEl = previewEl.createSpan({
            cls: 'vim-motions-undo-preview-summary',
        });
        this.updatePreviewForSeq(this.selectedSeq);
    }

    private isNodeVisible(node: ReturnType<UndoTree['getNode']>): boolean {
        if (!node) return false;
        let cursor = node;
        let parent = node.parent;
        while (parent) {
            if (
                parent.children.length > 1 &&
                this.collapsedSeqs.has(parent.seq)
            ) {
                if (parent.children[0] !== cursor) {
                    return false;
                }
            }
            cursor = parent;
            parent = parent.parent;
        }
        return true;
    }

    private updatePreviewForSeq(seq: number | null): void {
        if (seq === null) return;
        const node = this.undoTree.getNode(seq) ?? this.undoTree.getCurrent();
        this.updatePreview(node);
    }

    private updatePreview(node: ReturnType<UndoTree['getNode']>): void {
        if (!node || !this.previewLabelEl || !this.previewSummaryEl) return;

        if (node.seq === 0) {
            this.previewLabelEl.textContent = 'Initial state';
            this.previewSummaryEl.textContent = '';
            return;
        }

        this.previewLabelEl.textContent = `Change #${node.seq} at ${new Date(
            node.timestamp,
        ).toLocaleTimeString()}`;
        if (node.changeSummary) {
            this.previewSummaryEl.textContent = `+${node.changeSummary.inserted} chars, -${node.changeSummary.deleted} chars`;
        } else {
            this.previewSummaryEl.textContent = 'No change data';
        }
    }

    private handleKeydown(e: KeyboardEvent): void {
        const nodes = this.undoTree.getAllNodes();
        const sorted = [...nodes]
            .sort((a, b) => b.seq - a.seq)
            .filter((node) => this.isNodeVisible(node));
        if (sorted.length === 0) return;

        const currentIdx = sorted.findIndex((n) => n.seq === this.selectedSeq);

        switch (e.key) {
            case 'j': {
                e.preventDefault();
                const nextIdx = Math.min(currentIdx + 1, sorted.length - 1);
                const nextNode = sorted[nextIdx];
                if (nextNode) {
                    this.selectedSeq = nextNode.seq;
                    this.renderTree();
                }
                break;
            }
            case 'k': {
                e.preventDefault();
                const prevIdx = Math.max(currentIdx - 1, 0);
                const prevNode = sorted[prevIdx];
                if (prevNode) {
                    this.selectedSeq = prevNode.seq;
                    this.renderTree();
                }
                break;
            }
            case 'Enter': {
                e.preventDefault();
                if (this.selectedSeq !== null) {
                    this.onNavigate?.(this.selectedSeq);
                    this.renderTree();
                }
                break;
            }
            case 'q': {
                e.preventDefault();
                this.leaf.detach();
                break;
            }
        }
    }
}

export function createUndoTreeViewFactory(
    getUndoTree: () => UndoTree,
    onNavigate?: (seq: number) => void,
): (leaf: WorkspaceLeaf) => UndoTreeView {
    return (leaf) => new UndoTreeView(leaf, getUndoTree, onNavigate);
}
