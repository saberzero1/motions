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
import { getAnimatedCursorConfig, getCursorShapeForMode } from './config';
import { getCmAdapterFromEditorView } from '../vim-api';

const STALE_THRESHOLD_MS = 100;

function coordsToRect(
    view: EditorView,
    pos: number,
    scrollRect: DOMRect,
    scrollLeft: number,
    scrollTop: number,
): CursorRect | null {
    const coords = view.coordsAtPos(pos, 1);
    if (!coords) return null;

    const left = coords.left - scrollRect.left + scrollLeft;
    const top = coords.top - scrollRect.top + scrollTop;
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
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private smooth = new SmoothCursor();
    private smear = new SmearPhysics();
    private resizeObserver: ResizeObserver;
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
    private active = false;
    private composing = false;
    private destroyed = false;

    constructor(private view: EditorView) {
        this.canvas = view.scrollDOM.createEl('canvas', {
            cls: 'vim-motions-animated-cursor-canvas',
            attr: { role: 'presentation', 'aria-hidden': 'true' },
        });
        this.ctx = this.canvas.getContext('2d')!;
        this.sizeCanvas();

        this.resizeObserver = new ResizeObserver(() => this.sizeCanvas());
        this.resizeObserver.observe(view.scrollDOM);

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

    private sizeCanvas(): void {
        if (this.destroyed) return;
        const { clientWidth, clientHeight } = this.view.scrollDOM;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = clientWidth * dpr;
        this.canvas.height = clientHeight * dpr;
        this.canvas.style.width = clientWidth + 'px';
        this.canvas.style.height = clientHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

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
            getAnimatedCursorManager().wake();
        } else if (scrollChanged) {
            const selectionHead = vu.state.selection.main.head;
            if (selectionHead === this.cachedDocPos) {
                // Scroll only — snap, no trail
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
    }

    private snapOnNextTick = false;

    tick(dt: number): void {
        if (this.destroyed || this.composing) {
            this.active = false;
            return;
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

        this.draw(config, useSmear, useSmooth);

        if (useSmear) {
            this.active = !this.smear.isConverged();
        } else if (useSmooth) {
            this.active = !this.smooth.isConverged();
        } else {
            this.active = false;
        }
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
            return 'normal';
        } catch {
            return undefined;
        }
    }

    private refreshTarget(): void {
        try {
            const pos = this.view.state.selection.main.head;
            const scrollDOM = this.view.scrollDOM;
            const scrollRect = scrollDOM.getBoundingClientRect();
            const scrollLeft = scrollDOM.scrollLeft;
            const scrollTop = scrollDOM.scrollTop;

            const rect = coordsToRect(
                this.view,
                pos,
                scrollRect,
                scrollLeft,
                scrollTop,
            );
            if (!rect) return;

            this.cachedRect = rect;
            this.cachedDocPos = pos;
            this.cachedScrollTop = scrollTop;
            this.cachedScrollLeft = scrollLeft;
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
        _config: unknown,
        useSmear: boolean,
        useSmooth: boolean,
    ): void {
        const { clientWidth, clientHeight } = this.view.scrollDOM;
        this.ctx.clearRect(0, 0, clientWidth, clientHeight);

        if (!this.cachedRect) return;
        const charInfo =
            this.currentShape === 'block' ? this.blockChar : undefined;

        if (useSmear) {
            drawSmearCursor(
                this.ctx,
                this.smear.getQuad(),
                this.cachedRect,
                this.currentShape,
                this.accentColor,
                charInfo,
            );
        } else {
            const rect = useSmooth ? this.smooth.current() : this.cachedRect;
            drawCursorShape(
                this.ctx,
                rect,
                this.currentShape,
                this.accentColor,
                charInfo,
            );
        }
    }

    destroy(): void {
        this.destroyed = true;
        getAnimatedCursorManager().deregister(this);
        this.resizeObserver.disconnect();
        this.view.scrollDOM.removeEventListener(
            'compositionstart',
            this.onCompositionStart,
        );
        this.view.scrollDOM.removeEventListener(
            'compositionend',
            this.onCompositionEnd,
        );
        this.canvas.remove();
    }
}

export function createAnimatedCursorExtension(): Extension {
    return ViewPlugin.fromClass(CursorController);
}
