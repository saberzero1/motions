import type { LabeledTarget } from './types';
import { captureKeys, type KeyCaptureHandle } from '../util/key-capture';

export function waitForKey(): KeyCaptureHandle<string | null> {
    return captureKeys<string | null>({
        abortValue: null,
        onKey: (e, settle) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key.length !== 1 && e.key !== 'Escape') return;

            settle(e.key === 'Escape' ? null : e.key);
        },
    });
}

export function waitForLabel(
    labels: LabeledTarget[],
    onNarrow: (remaining: LabeledTarget[]) => void,
): KeyCaptureHandle<LabeledTarget | null> {
    let prefix = '';

    return captureKeys<LabeledTarget | null>({
        abortValue: null,
        onKey: (e, settle) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                settle(null);
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
                settle(exact);
                return;
            }

            const remaining = labels.filter((t) => t.label.startsWith(typed));
            if (remaining.length > 0) {
                prefix = typed;
                onNarrow(remaining);
            }
        },
    });
}
