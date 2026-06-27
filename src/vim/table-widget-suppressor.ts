import type { App } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import { around } from '../util/around';

/* eslint-disable @typescript-eslint/no-explicit-any -- CM6 decoration internals are untyped (value.widget.containerEl) */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- same: RangeSetBuilder prototype patching */

export type TableWidgetMode = 'off' | 'cursor' | 'always';

let mode: TableWidgetMode = 'off';

function isTableWidgetDecoration(value: any): boolean {
    if (!value || value.isReplace !== true || !value.widget) return false;
    const el: HTMLElement | undefined = value.widget.containerEl;
    if (!el || typeof el.className !== 'string') return false;
    return el.className.includes('cm-table-widget');
}

function shouldSuppress(from: number, to: number, value: any): boolean {
    if (mode === 'off') return false;
    if (from >= to || !isTableWidgetDecoration(value)) return false;
    return true;
}

export function installTableWidgetSuppressor(
    _app: App,
    newMode: TableWidgetMode,
): () => void {
    mode = newMode;

    const uninstall = around(RangeSetBuilder.prototype as any, {
        add(orig: any) {
            return function (this: any, from: number, to: number, value: any) {
                if (shouldSuppress(from, to, value)) return;
                return orig.call(this, from, to, value);
            };
        },
        addInner(orig: any) {
            return function (this: any, from: number, to: number, value: any) {
                if (shouldSuppress(from, to, value)) return false;
                return orig.call(this, from, to, value);
            };
        },
    });

    return () => {
        mode = 'off';
        uninstall();
    };
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
