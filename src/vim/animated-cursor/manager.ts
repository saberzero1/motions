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

/**
 * The canvas the cursors of one window's editors are drawn on. Each window,
 * the main one and every pop-out, has a document of its own, and an editor's
 * coordinates are its own window's, so each gets its own canvas.
 */
interface Surface {
    doc: Document;
    win: Window;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    resizeObserver: ResizeObserver;
    themeObserver: MutationObserver;
    dprQuery: MediaQueryList;
    onDprChange: () => void;
    onVisibilityChange: () => void;
    width: number;
    height: number;
    dirtyRegion: DirtyRect | null;
    prevDirtyRegion: DirtyRect | null;
}

export class AnimatedCursorManager {
    /** Each controller, with the document of the editor it draws for. */
    private controllers = new Map<Tickable, Document>();
    private surfaces = new Map<Document, Surface>();
    /** The surface being drawn, which `markDirty()` applies to. */
    private drawing: Surface | null = null;
    private rafId: number | null = null;
    /** The window `rafId` was requested from, to cancel it there. */
    private rafWin: Window | null = null;
    private lastTime = 0;
    private lastLoopTime = 0;
    private lastFrameTime = 0;
    private running = false;
    private wakeRequested = false;
    private gear: Gear = 'stopped';
    private warmTimerId: number | null = null;
    private heartbeatId: number | null = null;
    private tickErrorLogged = false;
    private crossingHandoff: CellCrossingHandoff | null = null;
    private crossingTokenCounter = 0;

    register(controller: Tickable, doc: Document): void {
        if (this.controllers.size >= MAX_CONTROLLERS) {
            console.warn(
                `Vim Motions: animated cursor controller limit reached (${MAX_CONTROLLERS}). ` +
                    'New editor will not get animated cursor.',
            );
            return;
        }
        this.controllers.set(controller, doc);
        devAssert(
            this.controllers.size <= MAX_CONTROLLERS,
            `Controller count (${this.controllers.size}) exceeds MAX_CONTROLLERS (${MAX_CONTROLLERS})`,
        );
        this.ensureSurface(doc);
        this.wake();
    }

    deregister(controller: Tickable): void {
        const doc = this.controllers.get(controller);
        this.controllers.delete(controller);
        if (doc && ![...this.controllers.values()].includes(doc)) {
            this.removeSurface(doc);
        }
        if (this.controllers.size === 0) {
            this.stop();
        }
    }

    wake(): void {
        this.cancelWarmTimer();
        // A wake arriving while a frame is in flight would otherwise be lost:
        // `running` is still true so this returns early, and that frame then
        // parks the loop because nothing was active when it ticked — before
        // the state the wake announced had been read. The flag survives into
        // `scheduleNext()` and buys one more frame.
        this.wakeRequested = true;
        if (this.running) return;
        this.gear = 'hot';
        this.running = true;
        this.tickErrorLogged = false;
        this.lastTime = performance.now();
        this.requestFrame();
        this.startHeartbeat();
    }

    /**
     * The next frame, from the window that has focus. A hidden or occluded
     * window gets no animation frames, so a pop-out's cursor would freeze
     * while the main window is minimised.
     */
    private requestFrame(): void {
        let win: Window = window;
        for (const surface of this.surfaces.values()) {
            if (surface.doc.hasFocus()) {
                win = surface.win;
                break;
            }
        }
        this.rafWin = win;
        this.rafId = win.requestAnimationFrame((t) => this.loop(t));
    }

    private ensureSurface(doc: Document): void {
        if (this.surfaces.has(doc)) return;
        const win = doc.defaultView ?? window;
        const container =
            doc.querySelector<HTMLElement>('.app-container') ?? doc.body;
        const canvas = container.createEl('canvas', {
            cls: 'vim-motions-animated-cursor-canvas',
            attr: { role: 'presentation', 'aria-hidden': 'true' },
        });
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn(
                'Vim Motions: failed to get 2d context for animated cursor canvas.',
            );
            canvas.remove();
            return;
        }
        const surface: Surface = {
            doc,
            win,
            canvas,
            ctx,
            resizeObserver: new ResizeObserver(() => this.sizeCanvas(surface)),
            themeObserver: new MutationObserver(() => {
                themeDirty = true;
            }),
            dprQuery: win.matchMedia(
                `(resolution: ${win.devicePixelRatio}dppx)`,
            ),
            onDprChange: () => this.sizeCanvas(surface),
            // Re-wake the rAF loop when the page becomes visible again.
            // Chromium pauses rAF for hidden/occluded tabs; on Windows 11 the
            // occlusion tracker is more aggressive than on Linux, so re-waking
            // on visibility change is essential.
            onVisibilityChange: () => {
                if (!doc.hidden && this.controllers.size > 0) {
                    this.wake();
                }
            },
            width: 0,
            height: 0,
            dirtyRegion: null,
            prevDirtyRegion: null,
        };
        this.surfaces.set(doc, surface);
        this.sizeCanvas(surface);
        surface.resizeObserver.observe(doc.documentElement);
        surface.themeObserver.observe(doc.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
        surface.dprQuery.addEventListener('change', surface.onDprChange);
        doc.addEventListener('visibilitychange', surface.onVisibilityChange);
    }

    private removeSurface(doc: Document): void {
        const surface = this.surfaces.get(doc);
        if (!surface) return;
        this.surfaces.delete(doc);
        if (this.drawing === surface) this.drawing = null;
        doc.removeEventListener('visibilitychange', surface.onVisibilityChange);
        surface.resizeObserver.disconnect();
        surface.themeObserver.disconnect();
        surface.dprQuery.removeEventListener('change', surface.onDprChange);
        surface.canvas.remove();
    }

    private sizeCanvas(surface: Surface): void {
        const { canvas, ctx, win } = surface;
        const dpr = win.devicePixelRatio || 1;
        const w = win.innerWidth;
        const h = win.innerHeight;
        surface.width = w;
        surface.height = h;
        // Round to avoid fractional backing-store sizes on Windows displays
        // with 125 %/150 % scaling (devicePixelRatio 1.25/1.5).  Without
        // rounding, the non-integer canvas dimensions cause sub-pixel
        // aliasing and continuous compositor re-uploads.
        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);
        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            surface.prevDirtyRegion = null;
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
                this.requestFrame();
                return;
            }
            this.lastFrameTime = now;
        }

        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        if (this.surfaces.size === 0) {
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
            for (const surface of this.surfaces.values()) {
                this.checkCanvasSize(surface);
                const ctx = surface.ctx;
                const p = surface.prevDirtyRegion;
                if (p) {
                    ctx.clearRect(p.x, p.y, p.w, p.h);
                } else {
                    ctx.clearRect(0, 0, surface.width, surface.height);
                }
                surface.dirtyRegion = null;
                this.drawing = surface;
                for (const [c, doc] of this.controllers) {
                    if (doc !== surface.doc) continue;
                    c.tick(dt, ctx);
                    if (c.isActive()) anyActive = true;
                    if (c.needsBlink()) anyNeedsBlink = true;
                }
                this.drawing = null;
                // Set by markDirty() during tick(), which TypeScript does not see.
                const d = surface.dirtyRegion as DirtyRect | null;
                surface.prevDirtyRegion = d
                    ? { x: d.x, y: d.y, w: d.w, h: d.h }
                    : null;
            }
        } catch (e: unknown) {
            this.drawing = null;
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

    private checkCanvasSize(surface: Surface): void {
        const dpr = surface.win.devicePixelRatio || 1;
        const pw = Math.round(surface.width * dpr);
        const ph = Math.round(surface.height * dpr);
        if (surface.canvas.width !== pw || surface.canvas.height !== ph) {
            this.sizeCanvas(surface);
        }
    }

    /** Marks a region of the surface being drawn as painted this frame. */
    markDirty(x: number, y: number, w: number, h: number): void {
        const surface = this.drawing;
        if (!surface) return;
        const PAD = 2;
        const px = x - PAD;
        const py = y - PAD;
        const pw = w + PAD * 2;
        const ph = h + PAD * 2;
        if (!surface.dirtyRegion) {
            surface.dirtyRegion = { x: px, y: py, w: pw, h: ph };
            return;
        }
        const d = surface.dirtyRegion;
        const nx = Math.min(d.x, px);
        const ny = Math.min(d.y, py);
        d.w = Math.max(d.x + d.w, px + pw) - nx;
        d.h = Math.max(d.y + d.h, py + ph) - ny;
        d.x = nx;
        d.y = ny;
    }

    private scheduleNext(anyActive: boolean, anyNeedsBlink: boolean): void {
        if (this.wakeRequested) {
            this.wakeRequested = false;
            anyActive = true;
        }
        if (anyActive) {
            this.gear = 'hot';
            this.requestFrame();
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
                this.requestFrame();
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
            (this.rafWin ?? window).cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this.rafWin = null;
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
        for (const doc of [...this.surfaces.keys()]) this.removeSurface(doc);
    }
}

let managerInstance: AnimatedCursorManager | null = null;

export function getAnimatedCursorManager(): AnimatedCursorManager {
    if (!managerInstance) {
        managerInstance = new AnimatedCursorManager();
    }
    return managerInstance;
}

/**
 * The manager if one exists, without creating it.
 *
 * Teardown destroys the manager before CodeMirror destroys the controllers:
 * `teardownVimSubsystems()` runs ahead of the `updateOptions()` that removes
 * the extension. A controller's `destroy()` therefore runs after the manager
 * is gone, and reaching for `getAnimatedCursorManager()` there would build a
 * fresh one purely to deregister from it.
 */
export function peekAnimatedCursorManager(): AnimatedCursorManager | null {
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
