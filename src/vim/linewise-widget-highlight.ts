import { type Extension } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { getCmAdapterFromEditorView } from './vim-api';

const HIGHLIGHT_CLASS = 'cm-vim-linewise-widget-selection';

interface VimSel {
    anchor: { line: number; ch: number };
    head: { line: number; ch: number };
}

interface VimStateWithSel {
    visualMode: boolean;
    visualLine: boolean;
    sel: VimSel | null;
}

class LinewiseWidgetHighlight {
    private highlighted = new Set<HTMLElement>();

    update(update: ViewUpdate): void {
        const cm = getCmAdapterFromEditorView(update.view);
        const vim = cm?.state?.vim as unknown as VimStateWithSel | undefined;

        if (!vim?.visualMode || !vim.visualLine || !vim.sel) {
            this.cleanup();
            return;
        }

        const startLine = Math.min(vim.sel.anchor.line, vim.sel.head.line);
        const endLine = Math.max(vim.sel.anchor.line, vim.sel.head.line);
        const doc = update.view.state.doc;

        const stillActive = new Set<HTMLElement>();

        for (const child of Array.from(update.view.contentDOM.children)) {
            const el = child as HTMLElement;
            if (el.classList.contains('cm-line')) continue;
            if (el.classList.contains('cm-widgetBuffer')) continue;
            if (el.getBoundingClientRect().height === 0) continue;

            let widgetStartLine: number;
            let widgetEndLine: number;
            try {
                const posStart = update.view.posAtDOM(el, 0);
                const posEnd = update.view.posAtDOM(el, el.childNodes.length);
                widgetStartLine = doc.lineAt(posStart).number - 1;
                widgetEndLine = doc.lineAt(posEnd).number - 1;
            } catch {
                continue;
            }

            const overlaps =
                widgetStartLine <= endLine && widgetEndLine >= startLine;

            if (overlaps) {
                el.classList.add(HIGHLIGHT_CLASS);
                stillActive.add(el);
            } else {
                el.classList.remove(HIGHLIGHT_CLASS);
            }
        }

        for (const el of this.highlighted) {
            if (!stillActive.has(el)) {
                if (el.isConnected) el.classList.remove(HIGHLIGHT_CLASS);
            }
        }
        this.highlighted = stillActive;
    }

    private cleanup(): void {
        for (const el of this.highlighted) {
            if (el.isConnected) el.classList.remove(HIGHLIGHT_CLASS);
        }
        this.highlighted.clear();
    }

    destroy(): void {
        this.cleanup();
    }
}

export function linewiseWidgetHighlightExtension(): Extension {
    return ViewPlugin.fromClass(LinewiseWidgetHighlight);
}
