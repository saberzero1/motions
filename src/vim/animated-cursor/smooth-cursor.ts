import type { CursorRect } from './types';

const POSITION_EPSILON = 0.5;
const BASE_SPEED = 60;
const MIN_DT = 0.001;
const MAX_DT = 0.1;

export class SmoothCursor {
    private cx = 0;
    private cy = 0;
    private cw = 0;
    private ch = 0;
    private tx = 0;
    private ty = 0;
    private tw = 0;
    private th = 0;
    private initialized = false;

    setTarget(rect: CursorRect): void {
        this.tx = rect.left;
        this.ty = rect.top;
        this.tw = rect.width;
        this.th = rect.height;
        if (!this.initialized) {
            this.cx = this.tx;
            this.cy = this.ty;
            this.cw = this.tw;
            this.ch = this.th;
            this.initialized = true;
        }
    }

    tick(dt: number, smoothness: number): CursorRect {
        const clampedDt = Math.max(MIN_DT, Math.min(dt, MAX_DT));
        const rate = BASE_SPEED * (1 - smoothness);
        const lerp = 1 - Math.exp(-rate * clampedDt);

        this.cx += (this.tx - this.cx) * lerp;
        this.cy += (this.ty - this.cy) * lerp;
        this.cw += (this.tw - this.cw) * lerp;
        this.ch += (this.th - this.ch) * lerp;

        return { left: this.cx, top: this.cy, width: this.cw, height: this.ch };
    }

    snap(): void {
        this.cx = this.tx;
        this.cy = this.ty;
        this.cw = this.tw;
        this.ch = this.th;
    }

    isConverged(): boolean {
        return (
            Math.abs(this.cx - this.tx) < POSITION_EPSILON &&
            Math.abs(this.cy - this.ty) < POSITION_EPSILON &&
            Math.abs(this.cw - this.tw) < POSITION_EPSILON &&
            Math.abs(this.ch - this.th) < POSITION_EPSILON
        );
    }

    current(): CursorRect {
        return { left: this.cx, top: this.cy, width: this.cw, height: this.ch };
    }

    reset(): void {
        this.cx = this.cy = this.cw = this.ch = 0;
        this.tx = this.ty = this.tw = this.th = 0;
        this.initialized = false;
    }
}
