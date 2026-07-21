import { describe, expect, it, beforeEach } from 'vitest';

import { SmoothCursor } from '../../src/vim/animated-cursor/smooth-cursor';
import { SmearPhysics } from '../../src/vim/animated-cursor/physics';
import {
    getCursorShapeForMode,
    setCursorShapes,
} from '../../src/vim/animated-cursor/config';
import type { CursorRect } from '../../src/vim/animated-cursor/types';

const rect = (
    left: number,
    top: number,
    width: number,
    height: number,
): CursorRect => ({ left, top, width, height });

describe('SmoothCursor', () => {
    let sc: SmoothCursor;

    beforeEach(() => {
        sc = new SmoothCursor();
    });

    describe('setTarget()', () => {
        it('snaps on first call', () => {
            sc.setTarget(rect(100, 200, 8, 20));
            expect(sc.current()).toEqual(rect(100, 200, 8, 20));
        });

        it('does NOT snap on subsequent calls', () => {
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 200, 8, 20));
            const cur = sc.current();
            expect(cur.left).toBe(0);
            expect(cur.top).toBe(0);
        });
    });

    describe('tick()', () => {
        it('moves current toward target with exponential decay', () => {
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 200, 8, 20));
            sc.tick(0.016, 0.5);
            const cur = sc.current();
            expect(cur.left).toBeGreaterThan(0);
            expect(cur.left).toBeLessThan(100);
        });

        it('is approximately frame-rate independent', () => {
            const sc2 = new SmoothCursor();
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 0, 8, 20));
            sc2.setTarget(rect(0, 0, 8, 20));
            sc2.setTarget(rect(100, 0, 8, 20));

            sc.tick(0.016, 0.5);
            sc2.tick(0.008, 0.5);
            sc2.tick(0.008, 0.5);

            expect(sc.current().left).toBeCloseTo(sc2.current().left, 0);
        });

        it('with smoothness=0 converges within a few ticks', () => {
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 200, 8, 20));
            // rate = 60, lerp per tick at dt=0.1 ≈ 0.998 → converges rapidly
            for (let i = 0; i < 3; i++) sc.tick(0.1, 0);
            const cur = sc.current();
            expect(cur.left).toBeCloseTo(100, 0);
            expect(cur.top).toBeCloseTo(200, 0);
        });

        it('with smoothness=0.9 moves very slowly', () => {
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 200, 8, 20));
            sc.tick(0.016, 0.9);
            const cur = sc.current();
            // rate = 60 * 0.1 = 6, lerp ≈ 0.095 → moves ~9.5px
            expect(cur.left).toBeLessThan(15);
            expect(cur.top).toBeLessThan(30);
        });
    });

    describe('snap()', () => {
        it('sets current to target immediately', () => {
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 200, 8, 20));
            sc.snap();
            expect(sc.current()).toEqual(rect(100, 200, 8, 20));
        });
    });

    describe('isConverged()', () => {
        it('returns true when within 0.5px on all axes', () => {
            sc.setTarget(rect(100, 200, 8, 20));
            expect(sc.isConverged()).toBe(true);
        });

        it('returns false when any axis is >0.5px from target', () => {
            sc.setTarget(rect(0, 0, 8, 20));
            sc.setTarget(rect(100, 200, 8, 20));
            expect(sc.isConverged()).toBe(false);
        });
    });

    describe('current()', () => {
        it('returns the current interpolated position', () => {
            sc.setTarget(rect(50, 75, 10, 25));
            sc.setTarget(rect(150, 175, 10, 25));
            sc.tick(0.016, 0.5);
            const cur = sc.current();
            expect(cur.left).toBeGreaterThan(50);
            expect(cur.left).toBeLessThan(150);
        });
    });

    describe('reset()', () => {
        it('clears all state', () => {
            sc.setTarget(rect(100, 200, 8, 20));
            sc.reset();
            expect(sc.current()).toEqual(rect(0, 0, 0, 0));
            sc.setTarget(rect(50, 60, 8, 20));
            expect(sc.current()).toEqual(rect(50, 60, 8, 20));
        });
    });
});

describe('SmearPhysics', () => {
    let sp: SmearPhysics;

    const stiffness = 0.3;
    const trailingStiffness = 0.1;
    const damping = 0.6;
    const maxLength = 300;

    function tickN(n: number, dt = 1 / 60): void {
        for (let i = 0; i < n; i++) {
            sp.tick(dt, stiffness, trailingStiffness, damping, maxLength);
        }
    }

    beforeEach(() => {
        sp = new SmearPhysics();
    });

    describe('setTarget()', () => {
        it('snaps quad on first call', () => {
            sp.setTarget(rect(10, 20, 8, 16));
            const q = sp.getQuad();
            expect(q.tl.x).toBe(10);
            expect(q.tl.y).toBe(20);
            expect(q.tr.x).toBe(18);
            expect(q.br.y).toBe(36);
        });

        it('does NOT snap on subsequent calls', () => {
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(100, 200, 8, 16));
            const q = sp.getQuad();
            expect(q.tl.x).toBe(0);
            expect(q.tl.y).toBe(0);
        });
    });

    describe('tick()', () => {
        it('moves corners toward target via spring-damper', () => {
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(100, 0, 8, 16));
            tickN(1);
            const q = sp.getQuad();
            expect(q.tl.x).toBeGreaterThan(0);
            expect(q.tl.x).toBeLessThan(100);
        });

        it('head corner converges faster than tail corner', () => {
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(200, 0, 8, 16));
            tickN(5);
            const q = sp.getQuad();
            const tcx = 204;
            const tcy = 8;
            const distTL = Math.hypot(q.tl.x - tcx, q.tl.y - tcy);
            const distTR = Math.hypot(q.tr.x - tcx, q.tr.y - tcy);
            const distBR = Math.hypot(q.br.x - tcx, q.br.y - tcy);
            const distBL = Math.hypot(q.bl.x - tcx, q.bl.y - tcy);
            const dists = [distTL, distTR, distBR, distBL];
            const minD = Math.min(...dists);
            const maxD = Math.max(...dists);
            expect(minD).toBeLessThan(maxD);
        });
    });

    describe('isConverged()', () => {
        it('returns true when all corners within threshold', () => {
            sp.setTarget(rect(10, 20, 8, 16));
            expect(sp.isConverged()).toBe(true);
        });

        it('returns false during active spring animation', () => {
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(100, 200, 8, 16));
            expect(sp.isConverged()).toBe(false);
        });
    });

    describe('snap()', () => {
        it('sets all corners to target immediately with zero velocity', () => {
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(50, 60, 8, 16));
            tickN(3);
            sp.snap();
            const q = sp.getQuad();
            expect(q.tl.x).toBe(50);
            expect(q.tl.y).toBe(60);
            expect(q.tr.x).toBe(58);
            expect(q.br.y).toBe(76);
            expect(q.tl.vx).toBe(0);
            expect(q.tl.vy).toBe(0);
            expect(q.br.vx).toBe(0);
            expect(q.br.vy).toBe(0);
        });
    });

    describe('reset()', () => {
        it('clears state and sets initialized=false', () => {
            sp.setTarget(rect(100, 200, 8, 16));
            sp.reset();
            const q = sp.getQuad();
            expect(q.tl.x).toBe(0);
            expect(q.tl.y).toBe(0);
            sp.setTarget(rect(50, 60, 8, 16));
            expect(sp.getQuad().tl.x).toBe(50);
        });
    });

    describe('max length clamping', () => {
        it('trail cannot exceed maxLength pixels', () => {
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(1000, 0, 8, 16));
            const shortMax = 50;
            for (let i = 0; i < 3; i++) {
                sp.tick(
                    1 / 60,
                    stiffness,
                    trailingStiffness,
                    damping,
                    shortMax,
                );
            }
            const q = sp.getQuad();
            const corners = [q.tl, q.tr, q.br, q.bl] as const;
            let maxDist = 0;
            for (let i = 0; i < corners.length; i++) {
                for (let j = i + 1; j < corners.length; j++) {
                    const a = corners[i]!;
                    const b = corners[j]!;
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (d > maxDist) maxDist = d;
                }
            }
            expect(maxDist).toBeLessThanOrEqual(shortMax + 20);
        });
    });

    describe('frame-rate independence', () => {
        it('produces similar results at different dt values', () => {
            const sp2 = new SmearPhysics();
            sp.setTarget(rect(0, 0, 8, 16));
            sp.setTarget(rect(100, 0, 8, 16));
            sp2.setTarget(rect(0, 0, 8, 16));
            sp2.setTarget(rect(100, 0, 8, 16));
            for (let i = 0; i < 10; i++) {
                sp.tick(
                    1 / 60,
                    stiffness,
                    trailingStiffness,
                    damping,
                    maxLength,
                );
            }
            for (let i = 0; i < 20; i++) {
                sp2.tick(
                    1 / 120,
                    stiffness,
                    trailingStiffness,
                    damping,
                    maxLength,
                );
            }
            const q1 = sp.getQuad();
            const q2 = sp2.getQuad();
            expect(q1.tl.x).toBeCloseTo(q2.tl.x, -2);
        });
    });

    describe('volume shrinkage', () => {
        it('quad narrows perpendicular to motion direction', () => {
            sp.setTarget(rect(0, 0, 20, 20));
            sp.setTarget(rect(200, 0, 20, 20));
            tickN(3);
            const q = sp.getQuad();
            const topWidth = Math.abs(q.tr.y - q.tl.y);
            const bottomWidth = Math.abs(q.br.y - q.bl.y);
            const avgPerpSpread = (topWidth + bottomWidth) / 2;
            expect(avgPerpSpread).toBeLessThan(20);
        });
    });
});

describe('getCursorShapeForMode', () => {
    beforeEach(() => {
        setCursorShapes({
            normal: 'block',
            insert: 'bar',
            visual: 'block',
            replace: 'underline',
            operatorPending: 'underline',
        });
    });

    it('returns block for normal mode', () => {
        expect(getCursorShapeForMode('normal')).toBe('block');
    });

    it('returns bar for insert mode', () => {
        expect(getCursorShapeForMode('insert')).toBe('bar');
    });

    it('returns block for visual mode', () => {
        expect(getCursorShapeForMode('visual')).toBe('block');
    });

    it('returns block for visual line mode', () => {
        expect(getCursorShapeForMode('visual line')).toBe('block');
    });

    it('returns block for visual block mode', () => {
        expect(getCursorShapeForMode('visual block')).toBe('block');
    });

    it('returns underline for replace mode', () => {
        expect(getCursorShapeForMode('replace')).toBe('underline');
    });

    it('returns underline for operator-pending', () => {
        expect(getCursorShapeForMode('operator-pending')).toBe('underline');
    });

    it('returns block for undefined mode', () => {
        expect(getCursorShapeForMode(undefined)).toBe('block');
    });

    it('returns block for unknown mode string', () => {
        expect(getCursorShapeForMode('unknown-mode')).toBe('block');
    });

    it('respects custom shapes via setCursorShapes', () => {
        setCursorShapes({
            normal: 'hollow',
            insert: 'underline',
            visual: 'bar',
            replace: 'block',
            operatorPending: 'bar',
        });
        expect(getCursorShapeForMode('normal')).toBe('hollow');
        expect(getCursorShapeForMode('insert')).toBe('underline');
        expect(getCursorShapeForMode('visual')).toBe('bar');
        expect(getCursorShapeForMode('replace')).toBe('block');
        expect(getCursorShapeForMode('operator-pending')).toBe('bar');
    });
});
