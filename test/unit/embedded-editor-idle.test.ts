import { describe, expect, it } from 'vitest';
import { isVimIdle } from '../../src/editors/embeddable-editor';

describe('isVimIdle', () => {
    it('returns true when vim state is null', () => {
        expect(isVimIdle(null)).toBe(true);
    });

    it('returns true when vim state is undefined', () => {
        expect(isVimIdle(undefined)).toBe(true);
    });

    it('returns true in idle normal mode', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: { keyBuffer: [] },
            }),
        ).toBe(true);
    });

    it('returns false in insert mode', () => {
        expect(isVimIdle({ mode: 'insert' })).toBe(false);
    });

    it('returns false in visual mode', () => {
        expect(isVimIdle({ mode: 'visual' })).toBe(false);
    });

    it('returns false in replace mode', () => {
        expect(isVimIdle({ mode: 'replace' })).toBe(false);
    });

    it('returns false when operator is pending', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: { operator: 'delete', keyBuffer: [] },
            }),
        ).toBe(false);
    });

    it('returns false when surround state is active', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: { keyBuffer: [] },
                surroundState: { active: true },
            }),
        ).toBe(false);
    });

    it('returns false when key buffer has partial sequence', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: { keyBuffer: ['g'] },
            }),
        ).toBe(false);
    });

    it('returns false when expecting literal next character', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: { keyBuffer: [] },
                expectLiteralNext: true,
            }),
        ).toBe(false);
    });

    it('returns false when multiple sub-states are active', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: { operator: 'change', keyBuffer: ['c'] },
                expectLiteralNext: true,
            }),
        ).toBe(false);
    });

    it('returns true when inputState is undefined', () => {
        expect(isVimIdle({ mode: 'normal' })).toBe(true);
    });

    it('returns true when keyBuffer is undefined', () => {
        expect(
            isVimIdle({
                mode: 'normal',
                inputState: {},
            }),
        ).toBe(true);
    });
});
