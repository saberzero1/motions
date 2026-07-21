import type { CursorRect, SmearQuad, SpringCorner } from './types';

const VELOCITY_EPSILON = 0.1;
const POSITION_EPSILON = 0.5;
const BASE_DT = 1 / 60;
const TRAILING_EXPONENT = 3;
const VOLUME_SHRINK_FACTOR = 0.7;

type CornerKey = 'tl' | 'tr' | 'br' | 'bl';
const CORNER_KEYS: CornerKey[] = ['tl', 'tr', 'br', 'bl'];

function corner(x: number, y: number): SpringCorner {
    return { x, y, vx: 0, vy: 0 };
}

function quadFromRect(r: CursorRect): SmearQuad {
    return {
        tl: corner(r.left, r.top),
        tr: corner(r.left + r.width, r.top),
        br: corner(r.left + r.width, r.top + r.height),
        bl: corner(r.left, r.top + r.height),
    };
}

function copyQuad(q: SmearQuad): SmearQuad {
    return {
        tl: { ...q.tl },
        tr: { ...q.tr },
        br: { ...q.br },
        bl: { ...q.bl },
    };
}

function dist(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}

export class SmearPhysics {
    private quad: SmearQuad;
    private targetRect: CursorRect = { left: 0, top: 0, width: 0, height: 0 };
    private initialized = false;

    constructor() {
        this.quad = quadFromRect(this.targetRect);
    }

    setTarget(rect: CursorRect): void {
        this.targetRect = rect;
        if (!this.initialized) {
            this.quad = quadFromRect(rect);
            this.initialized = true;
        }
    }

    tick(
        dt: number,
        stiffness: number,
        trailingStiffness: number,
        damping: number,
        maxLength: number,
    ): void {
        const target = quadFromRect(this.targetRect);
        const centerX =
            (target.tl.x + target.tr.x + target.br.x + target.bl.x) / 4;
        const centerY =
            (target.tl.y + target.tr.y + target.br.y + target.bl.y) / 4;

        // Compute per-corner distance to target center for stiffness assignment
        const distances: Record<CornerKey, number> = {
            tl: 0,
            tr: 0,
            br: 0,
            bl: 0,
        };
        let minDist = Infinity;
        let maxDist = 0;
        for (const key of CORNER_KEYS) {
            const c = this.quad[key];
            const d = dist(c.x, c.y, centerX, centerY);
            distances[key] = d;
            if (d < minDist) minDist = d;
            if (d > maxDist) maxDist = d;
        }

        const speedCorrection = dt / BASE_DT;
        const velocityConservation = Math.exp(
            Math.log(1 - damping) * speedCorrection,
        );
        const dampingCorrection = 1 / (1 + 2.5 * velocityConservation);

        const distRange = maxDist - minDist;

        for (const key of CORNER_KEYS) {
            const c = this.quad[key];
            const t = target[key];

            // Interpolate stiffness: head (closest) → stiffness, tail (farthest) → trailingStiffness
            let normalizedDist =
                distRange > 0.001 ? (distances[key] - minDist) / distRange : 0;
            const cornerStiffness =
                stiffness +
                (trailingStiffness - stiffness) *
                    Math.pow(normalizedDist, TRAILING_EXPONENT);

            const effectiveStiffness =
                1 -
                Math.exp(
                    Math.log(1 - cornerStiffness * dampingCorrection) *
                        speedCorrection,
                );

            c.vx += (t.x - c.x) * effectiveStiffness;
            c.vy += (t.y - c.y) * effectiveStiffness;
            c.x += c.vx;
            c.y += c.vy;
            c.vx *= velocityConservation;
            c.vy *= velocityConservation;
        }

        this.clampLength(maxLength);
        this.shrinkVolume();
    }

    private clampLength(maxLength: number): void {
        // Find head corner (closest to target center)
        const target = quadFromRect(this.targetRect);
        const cx = (target.tl.x + target.tr.x + target.br.x + target.bl.x) / 4;
        const cy = (target.tl.y + target.tr.y + target.br.y + target.bl.y) / 4;

        let headKey: CornerKey = 'tl';
        let headDist = Infinity;
        for (const key of CORNER_KEYS) {
            const d = dist(this.quad[key].x, this.quad[key].y, cx, cy);
            if (d < headDist) {
                headDist = d;
                headKey = key;
            }
        }

        const head = this.quad[headKey];
        let smearLength = 0;
        for (const key of CORNER_KEYS) {
            if (key === headKey) continue;
            const d = dist(this.quad[key].x, this.quad[key].y, head.x, head.y);
            if (d > smearLength) smearLength = d;
        }

        if (smearLength <= maxLength || smearLength < 0.001) return;

        const factor = maxLength / smearLength;
        for (const key of CORNER_KEYS) {
            if (key === headKey) continue;
            const c = this.quad[key];
            c.x = head.x + (c.x - head.x) * factor;
            c.y = head.y + (c.y - head.y) * factor;
        }
    }

    private shrinkVolume(): void {
        const q = this.quad;
        const cx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
        const cy = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;

        const target = quadFromRect(this.targetRect);
        const tcx = (target.tl.x + target.tr.x + target.br.x + target.bl.x) / 4;
        const tcy = (target.tl.y + target.tr.y + target.br.y + target.bl.y) / 4;

        const dx = tcx - cx;
        const dy = tcy - cy;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag < 3) return;

        // Normal perpendicular to motion direction
        const nx = -dy / mag;
        const ny = dx / mag;

        // Scale shrink by distance — full effect when far, none when close
        const shrinkIntensity = Math.min(1, mag / 30);
        const factor = 1 - (1 - VOLUME_SHRINK_FACTOR) * shrinkIntensity;

        for (const key of CORNER_KEYS) {
            const c = q[key];
            const relX = c.x - cx;
            const relY = c.y - cy;
            const projection = relX * nx + relY * ny;
            const shift = projection * (1 - factor);
            c.x -= nx * shift;
            c.y -= ny * shift;
        }
    }

    isConverged(): boolean {
        const target = quadFromRect(this.targetRect);
        for (const key of CORNER_KEYS) {
            const c = this.quad[key];
            const t = target[key];
            if (
                Math.abs(c.x - t.x) > POSITION_EPSILON ||
                Math.abs(c.y - t.y) > POSITION_EPSILON ||
                Math.abs(c.vx) > VELOCITY_EPSILON ||
                Math.abs(c.vy) > VELOCITY_EPSILON
            ) {
                return false;
            }
        }
        return true;
    }

    getQuad(): SmearQuad {
        return copyQuad(this.quad);
    }

    snap(): void {
        this.quad = quadFromRect(this.targetRect);
        for (const key of CORNER_KEYS) {
            this.quad[key].vx = 0;
            this.quad[key].vy = 0;
        }
    }

    reset(): void {
        this.targetRect = { left: 0, top: 0, width: 0, height: 0 };
        this.quad = quadFromRect(this.targetRect);
        this.initialized = false;
    }
}
