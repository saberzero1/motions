import { devAssert } from '../../util/invariant';
import type { CursorRect, Tickable } from './types';
import { cleanupReducedMotionListener } from './config';

/** Token-keyed position handoff for cross-cell cursor animation. */
export interface CellCrossingHandoff {
    token: number;
    rect: CursorRect;
    time: number;
}

const HANDOFF_TTL_MS = 200;

const MAX_CONTROLLERS = 16;

/**
 * Interval (ms) for the heartbeat timer that detects a stalled rAF loop
 * and re-wakes it.  On Windows 11 the OS can throttle or pause
 * requestAnimationFrame via Efficiency Mode, window-occlusion tracking
 * (`CalculateNativeWinOcclusion`), or high-resolution timer suppression
 * for background processes — all of which can silently kill the rAF loop
 * without throwing an error.  The heartbeat catches this and restarts.
 */
const HEARTBEAT_INTERVAL_MS = 500;

let themeDirty = false;

export function isThemeDirty(): boolean {
    return themeDirty;
}

export function clearThemeDirty(): void {
    themeDirty = false;
}

const BLINK_HALF_CYCLE = 600;
const HOT_FRAME_MIN_MS = 16;

type Gear = 'hot' | 'warm' | 'stopped';

interface DirtyRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class AnimatedCursorManager {
    private controllers = new Set<Tickable>();
    private rafId: number | null = null;
    private lastTime = 0;
    private lastLoopTime = 0;
    private lastFrameTime = 0;
    private running = false;
    private gear: Gear = 'stopped';
    private warmTimerId: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private themeObserver: MutationObserver | null = null;
    private dprQuery: MediaQueryList | null = null;
    private onDprChange: (() => void) | null = null;
    private heartbeatId: number | null = null;
    private tickErrorLogged = false;
    private onVisibilityChange: (() => void) | null = null;
    private crossingHandoff: CellCrossingHandoff | null = null;
    private crossingTokenCounter = 0;
    private cachedViewportWidth = 0;
    private cachedViewportHeight = 0;
    private dirtyRegion: DirtyRect | null = null;
    private prevDirtyRegion: DirtyRect | null = null;

    register(controller: Tickable): void {
        if (this.controllers.size >= MAX_CONTROLLERS) {
            console.warn(
                `Vim Motions: animated cursor controller limit reached (${MAX_CONTROLLERS}). ` +
                    'New editor will not get animated cursor.',
            );
            return;
        }
        this.controllers.add(controller);
        devAssert(
            this.controllers.size <= MAX_CONTROLLERS,
            `Controller count (${this.controllers.size}) exceeds MAX_CONTROLLERS (${MAX_CONTROLLERS})`,
        );
        this.ensureCanvas();
        this.wake();
    }

    deregister(controller: Tickable): void {
        this.controllers.delete(controller);
        if (this.controllers.size === 0) {
            this.stop();
            this.removeCanvas();
        }
    }

    wake(): void {
        this.cancelWarmTimer();
        if (this.running) return;
        this.gear = 'hot';
        this.running = true;
        this.tickErrorLogged = false;
        this.lastTime = performance.now();
        this.rafId = window.requestAnimationFrame((t) => this.loop(t));
        this.startHeartbeat();
    }

    private ensureCanvas(): void {
        if (this.canvas) return;
        const doc = document;
        const container =
            doc.querySelector<HTMLElement>('.app-container') ?? doc.body;
        this.canvas = container.createEl('canvas', {
            cls: 'vim-motions-animated-cursor-canvas',
            attr: { role: 'presentation', 'aria-hidden': 'true' },
        });
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            console.warn(
                'Vim Motions: failed to get 2d context for animated cursor canvas.',
            );
            this.canvas.remove();
            this.canvas = null;
            return;
        }
        this.sizeCanvas();
        this.resizeObserver = new ResizeObserver(() => this.sizeCanvas());
        this.resizeObserver.observe(doc.documentElement);

        this.themeObserver = new MutationObserver(() => {
            themeDirty = true;
        });
        this.themeObserver.observe(doc.body, {
            attributes: true,
            attributeFilter: ['class'],
        });

        this.onDprChange = () => this.sizeCanvas();
        this.dprQuery = window.matchMedia(
            `(resolution: ${window.devicePixelRatio}dppx)`,
        );
        this.dprQuery.addEventListener('change', this.onDprChange);

        // Re-wake the rAF loop when the page becomes visible again.
        // Chromium pauses rAF for hidden/occluded tabs; on Windows 11 the
        // occlusion tracker is more aggressive than on Linux, so re-waking
        // on visibility change is essential.
        this.onVisibilityChange = () => {
            if (!doc.hidden && this.controllers.size > 0) {
                this.wake();
            }
        };
        doc.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    private removeCanvas(): void {
        this.stopHeartbeat();
        if (this.onVisibilityChange) {
            document.removeEventListener(
                'visibilitychange',
                this.onVisibilityChange,
            );
            this.onVisibilityChange = null;
        }
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.themeObserver?.disconnect();
        this.themeObserver = null;
        if (this.dprQuery && this.onDprChange) {
            this.dprQuery.removeEventListener('change', this.onDprChange);
            this.dprQuery = null;
            this.onDprChange = null;
        }
        this.canvas?.remove();
        this.canvas = null;
        this.ctx = null;
    }

    private sizeCanvas(): void {
        if (!this.canvas || !this.ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.cachedViewportWidth = w;
        this.cachedViewportHeight = h;
        // Round to avoid fractional backing-store sizes on Windows displays
        // with 125 %/150 % scaling (devicePixelRatio 1.25/1.5).  Without
        // rounding, the non-integer canvas dimensions cause sub-pixel
        // aliasing and continuous compositor re-uploads.
        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);
        if (this.canvas.width !== pw || this.canvas.height !== ph) {
            this.canvas.width = pw;
            this.canvas.height = ph;
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.prevDirtyRegion = null;
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;
        this.lastLoopTime = performance.now();

        // Frame-rate cap: on 120Hz+ displays, skip frame if < 16ms since
        // last draw — cursor animation gains nothing above ~62.5fps.
        if (this.gear === 'hot') {
            const now = performance.now();
            if (now - this.lastFrameTime < HOT_FRAME_MIN_MS) {
                this.rafId = window.requestAnimationFrame((t) => this.loop(t));
                return;
            }
            this.lastFrameTime = now;
        }

        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        if (!this.ctx) {
            this.running = false;
            this.rafId = null;
            return;
        }

        // Wrap the entire frame so a transient error (e.g. a null coord
        // during window refocus, a detached DOM node mid-layout) can never
        // kill the rAF loop permanently — that is the "cursor disappears
        // until plugin reload" failure mode cursor-smith documented.
        let anyActive = false;
        let anyNeedsBlink = false;
        try {
            this.checkCanvasSize();

            if (this.prevDirtyRegion) {
                const p = this.prevDirtyRegion;
                this.ctx.clearRect(p.x, p.y, p.w, p.h);
            } else {
                this.ctx.clearRect(
                    0,
                    0,
                    this.cachedViewportWidth,
                    this.cachedViewportHeight,
                );
            }
            this.dirtyRegion = null;

            for (const c of this.controllers) {
                c.tick(dt, this.ctx);
                if (c.isActive()) anyActive = true;
                if (c.needsBlink()) anyNeedsBlink = true;
            }

            this.snapshotDirtyRegion();
        } catch (e: unknown) {
            if (!this.tickErrorLogged) {
                this.tickErrorLogged = true;
                console.error(
                    'Vim Motions: animated cursor tick error (loop kept alive):',
                    e,
                );
            }
            // Treat errored frames as active so the loop keeps running
            // and can recover on the next frame.
            anyActive = true;
        }

        this.scheduleNext(anyActive, anyNeedsBlink);
    }

    private checkCanvasSize(): void {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.round(this.cachedViewportWidth * dpr);
        const ph = Math.round(this.cachedViewportHeight * dpr);
        if (this.canvas.width !== pw || this.canvas.height !== ph) {
            this.sizeCanvas();
        }
    }

    private snapshotDirtyRegion(): void {
        const d = this.dirtyRegion;
        if (d) {
            this.prevDirtyRegion = { x: d.x, y: d.y, w: d.w, h: d.h };
        } else {
            this.prevDirtyRegion = null;
        }
    }

    markDirty(x: number, y: number, w: number, h: number): void {
        const PAD = 2;
        const px = x - PAD;
        const py = y - PAD;
        const pw = w + PAD * 2;
        const ph = h + PAD * 2;
        if (!this.dirtyRegion) {
            this.dirtyRegion = { x: px, y: py, w: pw, h: ph };
            return;
        }
        const d = this.dirtyRegion;
        const nx = Math.min(d.x, px);
        const ny = Math.min(d.y, py);
        d.w = Math.max(d.x + d.w, px + pw) - nx;
        d.h = Math.max(d.y + d.h, py + ph) - ny;
        d.x = nx;
        d.y = ny;
    }

    private scheduleNext(anyActive: boolean, anyNeedsBlink: boolean): void {
        if (anyActive) {
            this.gear = 'hot';
            this.rafId = window.requestAnimationFrame((t) => this.loop(t));
        } else if (anyNeedsBlink) {
            this.gear = 'warm';
            this.running = false;
            this.rafId = null;
            this.stopHeartbeat();
            this.warmTimerId = window.setTimeout(() => {
                this.warmTimerId = null;
                this.running = true;
                this.gear = 'warm';
                this.lastTime = performance.now();
                this.rafId = window.requestAnimationFrame((t) => this.loop(t));
            }, BLINK_HALF_CYCLE);
        } else {
            this.gear = 'stopped';
            this.running = false;
            this.rafId = null;
            this.stopHeartbeat();
        }
    }

    private cancelWarmTimer(): void {
        if (this.warmTimerId !== null) {
            window.clearTimeout(this.warmTimerId);
            this.warmTimerId = null;
        }
    }

    /**
     * Safety-net timer that detects when the rAF loop has stalled (due to
     * OS-level throttling, Efficiency Mode, sleep/wake, etc.) and restarts
     * it.  Unlike rAF, setInterval is not suppressed by Chromium's
     * occlusion tracker on Windows.
     */
    private startHeartbeat(): void {
        if (this.heartbeatId !== null) return;
        this.heartbeatId = window.setInterval(() => {
            if (this.controllers.size === 0) {
                this.stopHeartbeat();
                return;
            }
            // Detect OS-level rAF suppression: loop says it's running
            // but hasn't actually fired for 2× the heartbeat interval.
            if (
                this.running &&
                performance.now() - this.lastLoopTime >
                    HEARTBEAT_INTERVAL_MS * 2
            ) {
                this.running = false;
                this.wake();
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatId !== null) {
            window.clearInterval(this.heartbeatId);
            this.heartbeatId = null;
        }
    }

    private stop(): void {
        this.running = false;
        this.gear = 'stopped';
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.cancelWarmTimer();
        this.stopHeartbeat();
    }

    createCrossingToken(): number {
        return ++this.crossingTokenCounter;
    }

    storeCrossingHandoff(token: number, rect: CursorRect): void {
        this.crossingHandoff = { token, rect, time: performance.now() };
    }

    consumeCrossingHandoff(token: number): CursorRect | null {
        const h = this.crossingHandoff;
        if (!h || h.token !== token) return null;
        if (performance.now() - h.time > HANDOFF_TTL_MS) {
            this.crossingHandoff = null;
            return null;
        }
        this.crossingHandoff = null;
        return h.rect;
    }

    destroy(): void {
        this.stop();
        this.controllers.clear();
        this.removeCanvas();
    }
}

let managerInstance: AnimatedCursorManager | null = null;

export function getAnimatedCursorManager(): AnimatedCursorManager {
    if (!managerInstance) {
        managerInstance = new AnimatedCursorManager();
    }
    return managerInstance;
}

export function destroyAnimatedCursorManager(): void {
    managerInstance?.destroy();
    managerInstance = null;
    cleanupReducedMotionListener();
}

let pendingCrossingToken: number | null = null;

export function signalCellCrossing(): void {
    const mgr = getAnimatedCursorManager();
    pendingCrossingToken = mgr.createCrossingToken();
}

export function getPendingCrossingToken(): number | null {
    return pendingCrossingToken;
}

export function clearPendingCrossingToken(): void {
    pendingCrossingToken = null;
}
