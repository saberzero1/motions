import { describe, expect, it } from 'vitest';
import { matchesPickerKey } from '../../../src/picker/types';

function fakeKeyEvent(
    key: string,
    modifiers: {
        ctrlKey?: boolean;
        altKey?: boolean;
        shiftKey?: boolean;
        metaKey?: boolean;
    } = {},
): KeyboardEvent {
    return {
        key,
        ctrlKey: modifiers.ctrlKey ?? false,
        altKey: modifiers.altKey ?? false,
        shiftKey: modifiers.shiftKey ?? false,
        metaKey: modifiers.metaKey ?? false,
    } as unknown as KeyboardEvent;
}

describe('matchesPickerKey', () => {
    describe('plain keys (no modifiers)', () => {
        it('matches a plain key', () => {
            expect(matchesPickerKey(fakeKeyEvent('Enter'), ['Enter'])).toBe(
                true,
            );
        });

        it('does not match when modifier is held but spec is plain', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { ctrlKey: true }), ['j']),
            ).toBe(false);
        });

        it('does not match when alt is held but spec is plain', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { altKey: true }), ['j']),
            ).toBe(false);
        });

        it('does not match wrong key', () => {
            expect(matchesPickerKey(fakeKeyEvent('k'), ['j'])).toBe(false);
        });
    });

    describe('Ctrl modifier (C-)', () => {
        it('matches C-j when ctrl is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { ctrlKey: true }), ['C-j']),
            ).toBe(true);
        });

        it('matches C-j when meta is held (macOS Cmd)', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { metaKey: true }), ['C-j']),
            ).toBe(true);
        });

        it('does not match C-j without modifier', () => {
            expect(matchesPickerKey(fakeKeyEvent('j'), ['C-j'])).toBe(false);
        });

        it('does not match C-j when only alt is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { altKey: true }), ['C-j']),
            ).toBe(false);
        });
    });

    describe('Alt modifier (A-)', () => {
        it('matches A-j when alt is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { altKey: true }), ['A-j']),
            ).toBe(true);
        });

        it('matches A-k when alt is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('k', { altKey: true }), ['A-k']),
            ).toBe(true);
        });

        it('does not match A-j without alt', () => {
            expect(matchesPickerKey(fakeKeyEvent('j'), ['A-j'])).toBe(false);
        });

        it('does not match A-j when only ctrl is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { ctrlKey: true }), ['A-j']),
            ).toBe(false);
        });

        it('does not match A-j when wrong key with alt', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('k', { altKey: true }), ['A-j']),
            ).toBe(false);
        });
    });

    describe('Shift modifier (S-)', () => {
        it('matches S-Tab when shift is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('Tab', { shiftKey: true }), [
                    'S-Tab',
                ]),
            ).toBe(true);
        });

        it('does not match S-Tab without shift', () => {
            expect(matchesPickerKey(fakeKeyEvent('Tab'), ['S-Tab'])).toBe(
                false,
            );
        });
    });

    describe('Meta modifier (M-)', () => {
        it('matches M-j when meta is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { metaKey: true }), ['M-j']),
            ).toBe(true);
        });

        it('does not match M-j without meta', () => {
            expect(matchesPickerKey(fakeKeyEvent('j'), ['M-j'])).toBe(false);
        });

        it('does not match M-j when only ctrl is held', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { ctrlKey: true }), ['M-j']),
            ).toBe(false);
        });
    });

    describe('modifier combinations', () => {
        it('matches C-A-j when both ctrl and alt are held', () => {
            expect(
                matchesPickerKey(
                    fakeKeyEvent('j', { ctrlKey: true, altKey: true }),
                    ['C-A-j'],
                ),
            ).toBe(true);
        });

        it('does not match C-A-j with only ctrl', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { ctrlKey: true }), [
                    'C-A-j',
                ]),
            ).toBe(false);
        });

        it('does not match C-A-j with only alt', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { altKey: true }), [
                    'C-A-j',
                ]),
            ).toBe(false);
        });

        it('matches C-S-j when both ctrl and shift are held', () => {
            expect(
                matchesPickerKey(
                    fakeKeyEvent('j', { ctrlKey: true, shiftKey: true }),
                    ['C-S-j'],
                ),
            ).toBe(true);
        });

        it('matches A-S-j when both alt and shift are held', () => {
            expect(
                matchesPickerKey(
                    fakeKeyEvent('j', { altKey: true, shiftKey: true }),
                    ['A-S-j'],
                ),
            ).toBe(true);
        });
    });

    describe('multiple specs (first match wins)', () => {
        it('matches when any spec matches', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('j', { altKey: true }), [
                    'C-j',
                    'A-j',
                ]),
            ).toBe(true);
        });

        it('matches plain key from mixed list', () => {
            expect(
                matchesPickerKey(fakeKeyEvent('ArrowDown'), [
                    'ArrowDown',
                    'C-n',
                    'A-j',
                ]),
            ).toBe(true);
        });

        it('returns false when no spec matches', () => {
            expect(matchesPickerKey(fakeKeyEvent('x'), ['C-j', 'A-j'])).toBe(
                false,
            );
        });
    });

    describe('real-world pick_keymap scenario', () => {
        it('Alt-j matches moveDown with A-j and C-j specs', () => {
            const moveDown = ['A-j', 'C-j'];
            expect(
                matchesPickerKey(fakeKeyEvent('j', { altKey: true }), moveDown),
            ).toBe(true);
        });

        it('Alt-k matches moveUp with A-k and C-k specs', () => {
            const moveUp = ['A-k', 'C-k'];
            expect(
                matchesPickerKey(fakeKeyEvent('k', { altKey: true }), moveUp),
            ).toBe(true);
        });

        it('Ctrl-j still works alongside A-j', () => {
            const moveDown = ['A-j', 'C-j'];
            expect(
                matchesPickerKey(
                    fakeKeyEvent('j', { ctrlKey: true }),
                    moveDown,
                ),
            ).toBe(true);
        });
    });
});
