import { type ChangeSet, type Extension } from '@codemirror/state';
import {
    type EditorView,
    type PluginValue,
    type ViewUpdate,
    ViewPlugin,
} from '@codemirror/view';
import { type Tree, Edit } from 'web-tree-sitter';
import {
    type FoldMetadata,
    extractFoldMetadata,
    setFoldMetadata,
} from '../fold/metadata';
import { getOrCreateParser } from './runtime';
import { setTreeForView, deleteTreeForView } from './tree-state';

/**
 * Walks a string once, converting steadily increasing offsets to points.
 *
 * Callers must request offsets in non-decreasing order; `iterChanges` yields
 * them that way. A fresh scan per offset would make translation quadratic in
 * document length.
 */
class PointScanner {
    private index = 0;
    private row = 0;
    private column = 0;

    constructor(private readonly text: string) {}

    at(offset: number): { row: number; column: number } {
        const target = Math.min(offset, this.text.length);
        while (this.index < target) {
            if (this.text.charCodeAt(this.index) === 10) {
                this.row++;
                this.column = 0;
            } else {
                this.column++;
            }
            this.index++;
        }
        return { row: this.row, column: this.column };
    }
}

function advancePoint(
    start: { row: number; column: number },
    text: string,
): { row: number; column: number } {
    let { row, column } = start;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            row++;
            column = 0;
        } else {
            column++;
        }
    }
    return { row, column };
}

/**
 * Convert a CodeMirror change set into tree-sitter edits.
 *
 * `Edit` positions are interpreted against the tree *as it currently stands*,
 * so once edit k-1 has been applied the tree's coordinate for `fromA` is
 * `fromB` — every earlier change lies strictly before it. Mixing old-document
 * and new-document offsets happens to work for a single change, because
 * `fromA === fromB` there, and silently corrupts every change after the first
 * otherwise.
 *
 * The prefix of `newDoc` below `fromB` is unaffected by changes at or after
 * change k, so points may be read from `newDoc` rather than materialising each
 * intermediate document. Columns are UTF-16 code units, matching the
 * web-tree-sitter binding.
 */
export function translateChanges(
    changes: ChangeSet,
    oldDoc: string,
    newDoc: string,
): Edit[] {
    const edits: Edit[] = [];
    const scanner = new PointScanner(newDoc);

    changes.iterChanges((fromA, toA, fromB, toB) => {
        const startPosition = scanner.at(fromB);
        const oldEndPosition = advancePoint(
            startPosition,
            oldDoc.slice(fromA, toA),
        );
        const newEndPosition = scanner.at(toB);

        edits.push(
            new Edit({
                startIndex: fromB,
                oldEndIndex: fromB + (toA - fromA),
                newEndIndex: toB,
                startPosition,
                oldEndPosition,
                newEndPosition,
            }),
        );
    });

    return edits;
}

class TreeSitterBridge implements PluginValue {
    private tree: Tree | null = null;
    private foldMetadata: FoldMetadata | undefined;
    private prevDoc: string;

    constructor(
        private readonly view: EditorView,
        private readonly langName: string,
    ) {
        this.prevDoc = view.state.doc.toString();
        this.publish(this.parse(this.prevDoc, null));
        if (this.tree) {
            this.foldMetadata = extractFoldMetadata(this.tree, view.state);
            setFoldMetadata(view.state, this.foldMetadata);
        }
    }

    /**
     * Never dispatch from here. CodeMirror constructs and updates plugins with
     * `updateState !== Idle`, where `dispatch` throws; the exception is caught
     * and the plugin deactivated, stranding whatever was already published.
     */
    update(update: ViewUpdate): void {
        if (update.docChanged) {
            const newDoc = update.state.doc.toString();

            if (this.tree) {
                for (const edit of translateChanges(
                    update.changes,
                    this.prevDoc,
                    newDoc,
                )) {
                    this.tree.edit(edit);
                }
            }

            const next = this.parse(newDoc, this.tree);
            this.prevDoc = newDoc;
            this.publish(next);
            this.foldMetadata = this.tree
                ? extractFoldMetadata(this.tree, update.state)
                : undefined;
        }

        // Selection-only transactions also create a new EditorState identity.
        if (this.tree && this.foldMetadata) {
            setFoldMetadata(update.state, this.foldMetadata);
        }
    }

    destroy(): void {
        this.publish(null);
    }

    private parse(text: string, oldTree: Tree | null): Tree | null {
        try {
            return (
                getOrCreateParser(this.langName).parse(
                    text,
                    oldTree ?? undefined,
                ) ?? null
            );
        } catch (err) {
            console.warn('Vim Motions: treesitter parse failed:', err);
            return null;
        }
    }

    /**
     * Sole owner of the published tree's lifetime: it frees the tree it
     * replaces, so no caller should. Publishing null must clear the map, not
     * merely the field — a freed tree left behind hands every consumer a
     * use-after-free through `getTreeForView`.
     */
    private publish(tree: Tree | null): void {
        const previous = this.tree;
        this.tree = tree;

        if (tree) setTreeForView(this.view, tree);
        else deleteTreeForView(this.view);

        if (previous && previous !== tree) previous.delete();
    }
}

export function createBridgeExtension(langName: string): Extension {
    return ViewPlugin.define((view) => new TreeSitterBridge(view, langName));
}
