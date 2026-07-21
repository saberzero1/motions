import type { CursorRect, CursorShape, SmearQuad } from './types';

const BAR_WIDTH = 2;
const UNDERLINE_HEIGHT = 2;
const HOLLOW_LINE_WIDTH = 1;

export interface BlockCharInfo {
    char: string;
    font: string;
    textColor: string;
}

export function drawCursorShape(
    ctx: CanvasRenderingContext2D,
    rect: CursorRect,
    shape: CursorShape,
    color: string,
    blockChar?: BlockCharInfo,
): void {
    ctx.save();
    switch (shape) {
        case 'block':
            ctx.fillStyle = color;
            ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
            if (blockChar?.char && blockChar.char !== '\n') {
                ctx.fillStyle = blockChar.textColor;
                ctx.font = blockChar.font;
                ctx.textBaseline = 'alphabetic';
                const metrics = ctx.measureText(blockChar.char);
                const ascent =
                    metrics.fontBoundingBoxAscent ??
                    metrics.actualBoundingBoxAscent ??
                    rect.height * 0.8;
                const descent =
                    metrics.fontBoundingBoxDescent ??
                    metrics.actualBoundingBoxDescent ??
                    rect.height * 0.2;
                const fontHeight = ascent + descent;
                const baseline =
                    rect.top + (rect.height - fontHeight) / 2 + ascent;
                ctx.fillText(blockChar.char, rect.left, baseline);
            }
            break;
        case 'bar':
            ctx.fillStyle = color;
            ctx.fillRect(rect.left, rect.top, BAR_WIDTH, rect.height);
            break;
        case 'underline':
            ctx.fillStyle = color;
            ctx.fillRect(
                rect.left,
                rect.top + rect.height - UNDERLINE_HEIGHT,
                rect.width,
                UNDERLINE_HEIGHT,
            );
            break;
        case 'hollow':
            ctx.strokeStyle = color;
            ctx.lineWidth = HOLLOW_LINE_WIDTH;
            ctx.strokeRect(
                rect.left + 0.5,
                rect.top + 0.5,
                rect.width - 1,
                rect.height - 1,
            );
            break;
    }
    ctx.restore();
}

export function drawSmearCursor(
    ctx: CanvasRenderingContext2D,
    quad: SmearQuad,
    targetRect: CursorRect,
    shape: CursorShape,
    color: string,
    blockChar?: BlockCharInfo,
): void {
    const { tl, tr, br, bl } = quad;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    if (shape === 'hollow') {
        ctx.strokeStyle = color;
        ctx.lineWidth = HOLLOW_LINE_WIDTH;
        ctx.stroke();
    } else {
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();

    if (shape === 'block' && blockChar?.char && blockChar.char !== '\n') {
        ctx.save();
        ctx.fillStyle = blockChar.textColor;
        ctx.font = blockChar.font;
        ctx.textBaseline = 'alphabetic';
        const metrics = ctx.measureText(blockChar.char);
        const ascent =
            metrics.fontBoundingBoxAscent ??
            metrics.actualBoundingBoxAscent ??
            targetRect.height * 0.8;
        const descent =
            metrics.fontBoundingBoxDescent ??
            metrics.actualBoundingBoxDescent ??
            targetRect.height * 0.2;
        const fontHeight = ascent + descent;
        const baseline =
            targetRect.top + (targetRect.height - fontHeight) / 2 + ascent;
        ctx.fillText(blockChar.char, targetRect.left, baseline);
        ctx.restore();
    }
}

export function resolveAccentColor(element: Element): string {
    const style = getComputedStyle(element);
    return style.getPropertyValue('--interactive-accent').trim() || '#7f6df2';
}
