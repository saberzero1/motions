import type { App } from 'obsidian';

import { runCleanups } from '../util/cleanup';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';

/**
 * Tracks whether keyboard input belongs to Obsidian's native File Explorer.
 *
 * Obsidian's tree keeps its own selection while keydown targets `BODY`, so a
 * direct containment test on the event target is not sufficient on its own.
 * The last explorer interaction per document is therefore remembered, and
 * cleared as soon as a pointer or focus event lands outside the tree.
 */
export class FileExplorerContext {
    private app: App;
    private docs = new Set<Document>();
    private interactedDocs = new WeakSet<Document>();
    private cleanups: (() => void)[] = [];

    constructor(app: App) {
        this.app = app;
    }

    observeDocument(doc: Document): void {
        if (this.docs.has(doc)) return;
        this.docs.add(doc);

        const track = (e: PointerEvent | FocusEvent) => {
            if (this.containsTarget(e.target)) {
                this.interactedDocs.add(doc);
            } else {
                this.interactedDocs.delete(doc);
            }
        };
        doc.addEventListener('pointerdown', track, true);
        doc.addEventListener('focusin', track, true);
        this.cleanups.push(() => {
            doc.removeEventListener('pointerdown', track, true);
            doc.removeEventListener('focusin', track, true);
        });
    }

    observeActiveLeaf(): void {
        const ref = this.app.workspace.on('active-leaf-change', (leaf) => {
            const isExplorer =
                leaf?.view.getViewType() === FILE_EXPLORER_VIEW_TYPE;
            for (const doc of this.docs) {
                if (isExplorer && leaf.view.containerEl.ownerDocument === doc) {
                    this.interactedDocs.add(doc);
                } else {
                    this.interactedDocs.delete(doc);
                }
            }
        });
        this.cleanups.push(() => this.app.workspace.offref(ref));
    }

    containsTarget(target: EventTarget | null): boolean {
        return (
            !!target &&
            this.app.workspace
                .getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)
                .some((leaf) => leaf.view.containerEl.contains(target as Node))
        );
    }

    isActive(doc: Document, target: EventTarget | null): boolean {
        return this.containsTarget(target) || this.interactedDocs.has(doc);
    }

    destroy(): void {
        runCleanups(this.cleanups, 'file explorer context');
        this.cleanups = [];
        this.docs.clear();
    }
}
