export interface Tickable {
    tick(dt: number, ctx: CanvasRenderingContext2D): void;
    isActive(): boolean;
}

const MAX_CONTROLLERS = 16;

export class AnimatedCursorManager {
    private controllers = new Set<Tickable>();
    private rafId: number | null = null;
    private lastTime = 0;
    private running = false;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;

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
        this.lastTime = performance.now();
        this.rafId = window.requestAnimationFrame((t) => this.loop(t));
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
    }

    private removeCanvas(): void {
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
        if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
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

        this.sizeCanvas();
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        let anyActive = false;
        for (const c of this.controllers) {
            c.tick(dt, this.ctx);
            if (c.isActive()) anyActive = true;
        }

        if (anyActive) {
            this.rafId = window.requestAnimationFrame((t) => this.loop(t));
        } else {
            this.running = false;
            this.rafId = null;
        }
    }

    private stop(): void {
        this.running = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
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
