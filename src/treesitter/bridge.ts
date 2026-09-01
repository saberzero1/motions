import { type Extension, type Transaction } from '@codemirror/state';
import {
    type EditorView,
    type PluginValue,
    type ViewUpdate,
    ViewPlugin,
} from '@codemirror/view';
import { type Tree, Edit } from 'web-tree-sitter';
import { getOrCreateParser } from './runtime';
import {
    setTreeForView,
    deleteTreeForView,
    setTreeEffect,
    treeSitterTreeField,
} from './tree-state';

function translateChanges(tr: Transaction, oldDoc: string): Edit[] {
    const edits: Edit[] = [];
    const newDoc = tr.state.doc.toString();

    tr.changes.iterChanges((fromA, toA, fromB, toB) => {
        edits.push(
            new Edit({
                startIndex: fromA,
                oldEndIndex: toA,
                newEndIndex: fromB + (toB - fromB),
                startPosition: offsetToPoint(oldDoc, fromA),
                oldEndPosition: offsetToPoint(oldDoc, toA),
                newEndPosition: offsetToPoint(
                    newDoc,
                    Math.min(fromB + (toB - fromB), newDoc.length),
                ),
            }),
        );
    });

    return edits;
}

function offsetToPoint(
    text: string,
    offset: number,
): { row: number; column: number } {
    let row = 0;
    let lastNewline = -1;
    const end = Math.min(offset, text.length);
    for (let i = 0; i < end; i++) {
        if (text.charCodeAt(i) === 10) {
            row++;
            lastNewline = i;
        }
    }
    return { row, column: offset - lastNewline - 1 };
}

class TreeSitterBridge implements PluginValue {
    private tree: Tree | null = null;
    private langName: string;
    private prevDoc: string;

    constructor(
        private view: EditorView,
        langName: string,
    ) {
        this.langName = langName;
        this.prevDoc = view.state.doc.toString();
        const parser = getOrCreateParser(langName);
        this.tree = parser.parse(this.prevDoc);
        if (this.tree) {
            setTreeForView(view, this.tree);
            view.dispatch({ effects: setTreeEffect.of(this.tree) });
        }
    }

    update(update: ViewUpdate): void {
        if (!update.docChanged || !this.tree) return;

        const edits = translateChanges(update.transactions[0]!, this.prevDoc);
        for (const edit of edits) {
            this.tree.edit(edit);
        }

        const newDoc = update.state.doc.toString();
        const parser = getOrCreateParser(this.langName);
        const newTree = parser.parse(newDoc, this.tree);

        this.tree.delete();
        this.tree = newTree;
        this.prevDoc = newDoc;

        if (this.tree) {
            setTreeForView(update.view, this.tree);
            update.view.dispatch({ effects: setTreeEffect.of(this.tree) });
        }
    }

    destroy(): void {
        if (this.tree) {
            deleteTreeForView(this.view);
            this.tree.delete();
            this.tree = null;
        }
    }
}

const activeBridges = new WeakMap<EditorView, TreeSitterBridge>();

export function createBridgeExtension(langName: string): Extension {
    return [
        treeSitterTreeField,
        ViewPlugin.define((view) => {
            const bridge = new TreeSitterBridge(view, langName);
            activeBridges.set(view, bridge);
            return bridge;
        }, {}),
    ];
}

export {
    getTreeForView,
    hasTreeForView,
    treeSitterTreeField,
} from './tree-state';
