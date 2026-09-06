import type { CmAdapter } from '../types/vim-api';
import { getVisibleRange } from '../easymotion/targets';

export function getWindowInfo(cm: CmAdapter): Record<string, unknown> {
    const view = cm.cm6;
    const { fromLine, toLine } = getVisibleRange(cm);
    let topline = fromLine + 1;
    let botline = toLine + 1;
    if (view.visibleRanges.length === 0) {
        topline = view.state.doc.lineAt(view.viewport.from).number;
        botline = view.state.doc.lineAt(view.viewport.to).number;
    }

    // CM renders an overscan margin. Clip the rendered range to on-screen
    // blocks, without lineBlockAtHeight's Live Preview widget estimation bug.
    const scroll = view.scrollDOM;
    const top = scroll.getBoundingClientRect().top + scroll.clientTop;
    const bottom = top + scroll.clientHeight;
    const blocks = view.viewportLineBlocks.filter(
        (block) =>
            block.bottom + view.documentTop > top &&
            block.top + view.documentTop < bottom,
    );
    if (blocks.length > 0) {
        topline = Math.max(
            topline,
            view.state.doc.lineAt(blocks[0]!.from).number,
        );
        botline = Math.max(
            topline,
            Math.min(
                botline,
                view.state.doc.lineAt(blocks[blocks.length - 1]!.to).number,
            ),
        );
    }
    const charWidth = view.defaultCharacterWidth;
    const lineHeight = view.defaultLineHeight;
    const gutterWidth =
        view.dom.querySelector('.cm-gutters')?.getBoundingClientRect().width ??
        0;
    return {
        winid: 0,
        winnr: 1,
        bufnr: 0,
        tabnr: 1,
        winbar: 0,
        topline,
        botline,
        height:
            lineHeight > 0 ? Math.floor(scroll.clientHeight / lineHeight) : 0,
        width: charWidth > 0 ? Math.floor(scroll.clientWidth / charWidth) : 0,
        textoff: charWidth > 0 ? Math.ceil(gutterWidth / charWidth) : 0,
        winrow: 1,
        wincol: 1,
        terminal: 0,
        quickfix: 0,
        loclist: 0,
        variables: {},
    };
}
