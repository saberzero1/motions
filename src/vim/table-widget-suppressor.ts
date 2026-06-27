import type { App } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import { around } from '../util/around';

export type TableWidgetMode = 'off' | 'cursor' | 'always';

let mode: TableWidgetMode = 'off';

interface DecorationValue {
    isReplace?: boolean;
    widget?: {
        containerEl?: HTMLElement;
    };
}

function isTableWidgetDecoration(value: unknown): boolean {
    const v = value as DecorationValue | null | undefined;
    if (!v || v.isReplace !== true || !v.widget) return false;
    const el = v.widget.containerEl;
    if (!el || typeof el.className !== 'string') return false;
    return el.className.includes('cm-table-widget');
}

function shouldSuppress(from: number, to: number, value: unknown): boolean {
    if (mode === 'off') return false;
    if (from >= to || !isTableWidgetDecoration(value)) return false;
    return true;
}

export function installTableWidgetSuppressor(
    _app: App,
    newMode: TableWidgetMode,
): () => void {
    mode = newMode;

    const proto = RangeSetBuilder.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
    >;
    const uninstall = around(proto, {
        add(orig) {
            return function (
                this: unknown,
                from: unknown,
                to: unknown,
                value: unknown,
            ) {
                if (shouldSuppress(from as number, to as number, value)) return;
                return orig.call(this, from, to, value);
            };
        },
        addInner(orig) {
            return function (
                this: unknown,
                from: unknown,
                to: unknown,
                value: unknown,
            ) {
                if (shouldSuppress(from as number, to as number, value))
                    return false;
                return orig.call(this, from, to, value);
            };
        },
    });

    return () => {
        mode = 'off';
        uninstall();
    };
}
