export interface Tickable {
    tick(dt: number): void;
    isActive(): boolean;
}

const MAX_CONTROLLERS = 8;

export class AnimatedCursorManager {
    private controllers = new Set<Tickable>();
    private rafId: number | null = null;
    private lastTime = 0;
    private running = false;

    register(controller: Tickable): void {
        if (this.controllers.size >= MAX_CONTROLLERS) return;
        this.controllers.add(controller);
        this.wake();
    }

    deregister(controller: Tickable): void {
        this.controllers.delete(controller);
        if (this.controllers.size === 0) this.stop();
    }

    wake(): void {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.rafId = window.requestAnimationFrame((t) => this.loop(t));
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        let anyActive = false;
        for (const c of this.controllers) {
            c.tick(dt);
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
