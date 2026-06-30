import type { LabeledTarget } from './types';

export function waitForKey(): Promise<string | null> {
    return new Promise((resolve) => {
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            document.removeEventListener('keydown', handler, true);
            if (e.key === 'Escape') {
                resolve(null);
            } else {
                resolve(e.key);
            }
        };
        document.addEventListener('keydown', handler, true);
    });
}

export function waitForLabel(
    labels: LabeledTarget[],
    onNarrow: (remaining: LabeledTarget[]) => void,
): Promise<LabeledTarget | null> {
    return new Promise((resolve) => {
        let prefix = '';

        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handler, true);
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
                document.removeEventListener('keydown', handler, true);
                resolve(exact);
                return;
            }

            const remaining = labels.filter((t) => t.label.startsWith(typed));
            if (remaining.length > 0) {
                prefix = typed;
                onNarrow(remaining);
            }
        };
        document.addEventListener('keydown', handler, true);
    });
}
