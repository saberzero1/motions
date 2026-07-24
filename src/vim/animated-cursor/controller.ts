import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { SmoothCursor } from './smooth-cursor';
import { SmearPhysics } from './physics';
import {
    drawCursorShape,
    drawSmearCursor,
    resolveAccentColor,
    type BlockCharInfo,
} from './renderer';
import { getAnimatedCursorManager, type Tickable } from './manager';
import type { CursorRect, CursorShape } from './types';
import {
    getAnimatedCursorConfig,
    getCursorShapeForMode,
    isAnimatedCursorPausedForView,
} from './config';
import { getCmAdapterFromEditorView } from '../vim-api';
import {
    setCursorSuppressedForView,
    clearCursorSuppressedForView,
} from '@replit/codemirror-vim';

const STALE_THRESHOLD_MS = 100;

function coordsToRect(view: EditorView, pos: number): CursorRect | null {
    const coords = view.coordsAtPos(pos, 1);
    if (!coords) return null;

    const pane = view.scrollDOM.getBoundingClientRect();
    if (
        coords.left < pane.left - 1 ||
        coords.left > pane.right + 1 ||
        coords.top < pane.top - 1 ||
        coords.bottom > pane.bottom + 1
    ) {
        return null;
    }

    const left = coords.left;
    const top = coords.top;
    const height = coords.bottom - coords.top;

    let width: number;
    const nextPos = Math.min(pos + 1, view.state.doc.length);
    if (nextPos > pos) {
        const nextCoords = view.coordsAtPos(nextPos, -1);
        if (nextCoords && Math.abs(nextCoords.top - coords.top) < 2) {
            width = Math.abs(nextCoords.left - coords.left);
        } else {
            width = 8;
        }
    } else {
        width = 8;
    }
    width = Math.max(width, 2);

    return { left, top, width, height };
}

class CursorController implements Tickable {
    private smooth = new SmoothCursor();
    private smear = new SmearPhysics();
    private accentColor = '#7f6df2';
    private currentShape: CursorShape = 'block';
    private blockChar: BlockCharInfo | undefined;
    private cachedRect: CursorRect | null = null;
    private cachedShapeRect: CursorRect | null = null;
    private cachedDocPos = -1;
    private cachedScrollTop = 0;
    private cachedScrollLeft = 0;
    private cachedTime = 0;
    private needsPositionUpdate = true;
    private lastMoveTime = 0;
    private blinkEpoch = 0;
    private active = false;
    private composing = false;
    private destroyed = false;

    constructor(private view: EditorView) {
        setCursorSuppressedForView(view, true);

        view.scrollDOM.addEventListener(
            'compositionstart',
            this.onCompositionStart,
        );
        view.scrollDOM.addEventListener(
            'compositionend',
            this.onCompositionEnd,
        );

        this.accentColor = resolveAccentColor(view.dom);

        getAnimatedCursorManager().register(this);
    }

    private onCompositionStart = (): void => {
        this.composing = true;
    };
    private onCompositionEnd = (): void => {
        this.composing = false;
        this.needsPositionUpdate = true;
        getAnimatedCursorManager().wake();
    };

    update(vu: ViewUpdate): void {
        if (this.destroyed) return;

        const config = getAnimatedCursorConfig();
        if (config.enabled) {
            if (
                !this.view.dom.classList.contains('vim-motions-animated-cursor')
            ) {
                this.view.dom.classList.add('vim-motions-animated-cursor');
            }
        } else {
            this.view.dom.classList.remove('vim-motions-animated-cursor');
            return;
        }

        const scrollTop = this.view.scrollDOM.scrollTop;
        const scrollLeft = this.view.scrollDOM.scrollLeft;
        const scrollChanged =
            scrollTop !== this.cachedScrollTop ||
            scrollLeft !== this.cachedScrollLeft;

        if (vu.selectionSet) {
            this.needsPositionUpdate = true;
            this.active = true;
            this.lastMoveTime = performance.now();
            getAnimatedCursorManager().wake();
        } else if (scrollChanged) {
            const selectionHead = vu.state.selection.main.head;
            if (selectionHead === this.cachedDocPos) {
                this.needsPositionUpdate = true;
                this.active = true;
                this.snapOnNextTick = true;
                getAnimatedCursorManager().wake();
            } else {
                this.needsPositionUpdate = true;
                this.active = true;
                getAnimatedCursorManager().wake();
            }
        }

        this.cachedScrollTop = scrollTop;
        this.cachedScrollLeft = scrollLeft;

        if (vu.selectionSet) {
            this.accentColor = resolveAccentColor(this.view.dom);
        }

        if (vu.focusChanged) {
            this.active = this.view.hasFocus;
            if (this.view.hasFocus) {
                this.lastMoveTime = performance.now();
                getAnimatedCursorManager().wake();
            }
        }
    }

    private snapOnNextTick = false;
    private wasPaused = false;

    tick(dt: number, ctx: CanvasRenderingContext2D): void {
        const paused = isAnimatedCursorPausedForView(this.view);
        if (this.destroyed || this.composing || !this.view.hasFocus || paused) {
            this.wasPaused = paused;
            this.active = false;
            return;
        }
        if (this.wasPaused) {
            this.wasPaused = false;
            this.snapOnNextTick = true;
            this.needsPositionUpdate = true;
        }

        const config = getAnimatedCursorConfig();
        if (!config.enabled) {
            this.active = false;
            return;
        }

        if (this.needsPositionUpdate) {
            this.refreshTarget();
            this.needsPositionUpdate = false;
        }

        if (!this.cachedRect) {
            this.active = false;
            return;
        }

        const now = performance.now();
        if (now - this.cachedTime > STALE_THRESHOLD_MS) {
            this.refreshTarget();
        }

        const liveShape = getCursorShapeForMode(this.resolveVimMode());
        if (liveShape !== this.currentShape && this.cachedRect) {
            this.currentShape = liveShape;
            const shapeRect = this.shapeAdjustedRect(
                this.cachedRect,
                liveShape,
            );
            this.cachedShapeRect = shapeRect;
            this.smooth.setTarget(shapeRect);
            this.smear.setTarget(shapeRect);
            this.smooth.snap();
            this.smear.snap();
        }

        const reducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches;

        const useSmear = config.smearTrail && !reducedMotion;
        const useSmooth = config.smoothCursor && !reducedMotion && !useSmear;

        if (this.snapOnNextTick || reducedMotion) {
            this.smooth.snap();
            this.smear.snap();
            this.snapOnNextTick = false;
        } else if (useSmear) {
            if (this.cachedShapeRect) {
                this.smear.setTarget(this.cachedShapeRect);
            }
            this.smear.tick(
                dt,
                config.stiffness,
                config.trailingStiffness,
                config.damping,
                config.maxLength,
            );
        } else if (useSmooth) {
            this.smooth.tick(dt, config.smoothness);
        }

        this.draw(ctx, config, useSmear, useSmooth);

        const animating = useSmear
            ? !this.smear.isConverged()
            : useSmooth
              ? !this.smooth.isConverged()
              : false;
        this.active = animating || this.view.hasFocus;
    }

    isActive(): boolean {
        return this.active;
    }

    private shapeAdjustedRect(
        rect: CursorRect,
        shape: CursorShape,
    ): CursorRect {
        switch (shape) {
            case 'bar':
                return {
                    left: rect.left,
                    top: rect.top,
                    width: 2,
                    height: rect.height,
                };
            case 'underline':
                return {
                    left: rect.left,
                    top: rect.top + rect.height - 2,
                    width: rect.width,
                    height: 2,
                };
            default:
                return rect;
        }
    }

    private computeBlinkAlpha(): number {
        if (!this.view.hasFocus) return 1;
        const BLINK_RATE = 1200;
        const RESET_DELAY = 600;
        const HALF_BLINK = BLINK_RATE / 2;
        const now = performance.now();
        if (now - this.lastMoveTime < RESET_DELAY) return 1;
        if (this.blinkEpoch < this.lastMoveTime + RESET_DELAY) {
            this.blinkEpoch = this.lastMoveTime + RESET_DELAY - HALF_BLINK;
        }
        const phase = ((now - this.blinkEpoch) % BLINK_RATE) / BLINK_RATE;
        return phase < 0.5 ? 1 : 0;
    }

    private resolveBlockChar(pos: number): BlockCharInfo | undefined {
        try {
            const doc = this.view.state.doc;
            if (pos >= doc.length) return undefined;
            const char = doc.sliceString(pos, pos + 1);
            if (!char || char === '\n' || char === '\r') return undefined;

            const domAtPos = this.view.domAtPos(pos);
            let node: Node | null = domAtPos.node;
            while (node && !node.instanceOf(HTMLElement)) {
                node = node.parentNode;
            }
            if (!node) return undefined;

            const style = getComputedStyle(node);
            const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const textColor =
                getComputedStyle(this.view.dom)
                    .getPropertyValue('--text-on-accent')
                    .trim() ||
                style.backgroundColor ||
                '#ffffff';

            return { char, font, textColor };
        } catch {
            return undefined;
        }
    }

    private resolveVimMode(): string | undefined {
        try {
            const adapter = getCmAdapterFromEditorView(this.view);
            if (!adapter) return undefined;
            const cmState = adapter.state as Record<string, unknown>;
            const vim = cmState.vim as Record<string, unknown> | undefined;
            if (!vim) return undefined;
            if (vim.insertMode && cmState.overwrite) return 'replace';
            if (vim.insertMode) return 'insert';
            if (vim.visualMode) {
                if (vim.visualLine) return 'visual line';
                if (vim.visualBlock) return 'visual block';
                return 'visual';
            }
            const inputState = vim.inputState as
                | Record<string, unknown>
                | undefined;
            if (inputState?.operator) return 'operator-pending';
            return 'normal';
        } catch {
            return undefined;
        }
    }

    private refreshTarget(): void {
        try {
            const sel = this.view.state.selection.main;
            let pos = sel.head;
            if (sel.anchor < sel.head && pos < this.view.state.doc.length) {
                const ch = this.view.state.doc.sliceString(pos, pos + 1);
                if (ch !== '\n') pos--;
            }
            const rect = coordsToRect(this.view, pos);
            if (!rect) return;

            this.cachedRect = rect;
            this.cachedDocPos = pos;
            this.cachedScrollTop = this.view.scrollDOM.scrollTop;
            this.cachedScrollLeft = this.view.scrollDOM.scrollLeft;
            this.cachedTime = performance.now();

            const vimMode = this.resolveVimMode();
            const newShape = getCursorShapeForMode(vimMode);
            const shapeChanged = newShape !== this.currentShape;
            this.currentShape = newShape;
            this.blockChar = this.resolveBlockChar(pos);

            const shapeRect = this.shapeAdjustedRect(rect, this.currentShape);
            this.cachedShapeRect = shapeRect;
            this.smooth.setTarget(shapeRect);
            this.smear.setTarget(shapeRect);
            if (shapeChanged) {
                this.smooth.snap();
                this.smear.snap();
            }
        } catch {
            // View may be destroyed during async operations
        }
    }

    private draw(
        ctx: CanvasRenderingContext2D,
        _config: unknown,
        useSmear: boolean,
        useSmooth: boolean,
    ): void {
        const paneRect = this.view.scrollDOM.getBoundingClientRect();
        ctx.save();
        ctx.beginPath();
        ctx.rect(paneRect.left, paneRect.top, paneRect.width, paneRect.height);
        ctx.clip();

        if (!this.cachedRect) {
            ctx.restore();
            return;
        }

        const blinkAlpha = this.computeBlinkAlpha();
        if (blinkAlpha <= 0) {
            ctx.restore();
            return;
        }
        ctx.globalAlpha = blinkAlpha;

        const charInfo =
            this.currentShape === 'block' ? this.blockChar : undefined;

        if (useSmear) {
            drawSmearCursor(
                ctx,
                this.smear.getQuad(),
                this.cachedRect,
                this.currentShape,
                this.accentColor,
                charInfo,
            );
        } else {
            const rect = useSmooth ? this.smooth.current() : this.cachedRect;
            drawCursorShape(
                ctx,
                rect,
                this.currentShape,
                this.accentColor,
                charInfo,
            );
        }
        ctx.restore();
    }

    destroy(): void {
        this.destroyed = true;
        clearCursorSuppressedForView(this.view);
        getAnimatedCursorManager().deregister(this);
        this.view.scrollDOM.removeEventListener(
            'compositionstart',
            this.onCompositionStart,
        );
        this.view.scrollDOM.removeEventListener(
            'compositionend',
            this.onCompositionEnd,
        );
    }
}

export function createAnimatedCursorExtension(): Extension {
    return ViewPlugin.fromClass(CursorController);
}
