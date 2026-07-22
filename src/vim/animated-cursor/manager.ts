export interface Tickable {
    tick(dt: number, ctx: CanvasRenderingContext2D): void;
    isActive(): boolean;
}

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

export class AnimatedCursorManager {
    private controllers = new Set<Tickable>();
    private rafId: number | null = null;
    private lastTime = 0;
    private running = false;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private heartbeatId: number | null = null;
    private tickErrorLogged = false;
    private onVisibilityChange: (() => void) | null = null;

    register(controller: Tickable): void {
        if (this.controllers.size >= MAX_CONTROLLERS) {
            console.warn(
                `Vim Motions: animated cursor controller limit reached (${MAX_CONTROLLERS}). ` +
                    'New editor will not get animated cursor.',
            );
            return;
        }
        this.controllers.add(controller);
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
        if (this.running) return;
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
        this.canvas?.remove();
        this.canvas = null;
        this.ctx = null;
    }

    private sizeCanvas(): void {
        if (!this.canvas || !this.ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
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
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

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
        try {
            this.sizeCanvas();
            this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            for (const c of this.controllers) {
                c.tick(dt, this.ctx);
                if (c.isActive()) anyActive = true;
            }
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

        if (anyActive) {
            this.rafId = window.requestAnimationFrame((t) => this.loop(t));
        } else {
            this.running = false;
            this.rafId = null;
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
            // If the loop is supposed to be running but rAF hasn't fired
            // recently, something external killed it — restart.
            const stale =
                !this.running &&
                this.controllers.size > 0 &&
                this.canvas !== null;
            if (stale) {
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
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.stopHeartbeat();
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
}
