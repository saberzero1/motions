import {
    Annotation,
    type Extension,
    type Transaction,
} from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';

/** Marks the editor transactions that apply Neovim's own line events. */
export const neovimLineEvent = Annotation.define<boolean>();

let listener: ((update: ViewUpdate) => void) | null = null;

/** Routes editor edits to the connected document sync; null detaches it. */
export function setHostEditListener(
    next: ((update: ViewUpdate) => void) | null,
): void {
    listener = next;
}

/**
 * Installed in every editor and inert until a Neovim connection listens. Every
 * edit that does not come from Neovim's line events is Obsidian's: a command
 * run with `:ob`, a ticked checkbox, another plugin, a change to the file on
 * disk. Synchronisation otherwise runs only from Neovim to the editor.
 */
export function neovimHostEditExtension(): Extension {
    return EditorView.updateListener.of((update) => {
        if (update.docChanged) listener?.(update);
    });
}

export function hasHostEdit(transactions: readonly Transaction[]): boolean {
    return transactions.some(
        (transaction) =>
            transaction.docChanged && !transaction.annotation(neovimLineEvent),
    );
}
