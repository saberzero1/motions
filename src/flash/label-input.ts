import type { LabeledTarget } from '../easymotion/types';

/**
 * Wait for the user to type a label character sequence, supporting
 * multi-character labels with prefix narrowing.
 *
 * - Exact match → resolves with the matched target
 * - Prefix match → accumulates prefix, calls `onNarrow` with remaining labels
 * - No match → ignores the keystroke
 * - Escape → resolves with `null`
 * - Backspace → resets prefix, calls `onNarrow` with all labels
 */
export function waitForFlashLabel(
    labels: LabeledTarget[],
    onNarrow: (remaining: LabeledTarget[]) => void,
): Promise<LabeledTarget | null> {
    return new Promise((resolve) => {
        let prefix = '';

        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                activeDocument.removeEventListener('keydown', handler, true);
                resolve(null);
                return;
            }

            if (e.key === 'Backspace') {
                if (prefix.length > 0) {
                    prefix = '';
                    onNarrow(labels);
                }
                return;
            }

            if (e.key.length !== 1) return;

            const typed = prefix + e.key;
            const exact = labels.find((t) => t.label === typed);
            if (exact) {
                activeDocument.removeEventListener('keydown', handler, true);
                resolve(exact);
                return;
            }

            const remaining = labels.filter((t) => t.label.startsWith(typed));
            if (remaining.length > 0) {
                prefix = typed;
                onNarrow(remaining);
            }
        };

        activeDocument.addEventListener('keydown', handler, true);
    });
}
