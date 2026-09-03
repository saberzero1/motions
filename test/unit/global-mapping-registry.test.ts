import { describe, expect, it } from 'vitest';
import { normalizeKeyEvent } from '../../src/workspace/global-mapping-registry';

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

describe('normalizeKeyEvent', () => {
    describe('plain keys', () => {
        it('returns single character as-is', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('f'))).toBe('f');
        });

        it('returns uppercase character as-is', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('F'))).toBe('F');
        });

        it('returns multi-char key name as-is', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('ArrowDown'))).toBe(
                'ArrowDown',
            );
        });
    });

    describe('special key normalization', () => {
        it('normalizes Enter to <CR>', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('Enter'))).toBe('<CR>');
        });

        it('normalizes Escape to <Esc>', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('Escape'))).toBe('<Esc>');
        });

        it('normalizes Backspace to <BS>', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('Backspace'))).toBe('<BS>');
        });

        it('normalizes Tab to <Tab>', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('Tab'))).toBe('<Tab>');
        });

        it('normalizes Space to <Space>', () => {
            expect(normalizeKeyEvent(fakeKeyEvent(' '))).toBe('<Space>');
        });
    });

    describe('Ctrl modifier (C-)', () => {
        it('produces <C-f> for Ctrl+f', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('f', { ctrlKey: true })),
            ).toBe('<C-f>');
        });

        it('produces <C-Tab> for Ctrl+Tab', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('Tab', { ctrlKey: true })),
            ).toBe('<C-Tab>');
        });
    });

    describe('Alt modifier (A-)', () => {
        it('produces <A-f> for Alt+f', () => {
            expect(normalizeKeyEvent(fakeKeyEvent('f', { altKey: true }))).toBe(
                '<A-f>',
            );
        });

        it('produces <A-Tab> for Alt+Tab', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('Tab', { altKey: true })),
            ).toBe('<A-Tab>');
        });
    });

    describe('Meta modifier (M-)', () => {
        it('produces <M-f> for Meta+f (without Ctrl)', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('f', { metaKey: true })),
            ).toBe('<M-f>');
        });

        it('does not produce M- when Ctrl is also held', () => {
            expect(
                normalizeKeyEvent(
                    fakeKeyEvent('f', { ctrlKey: true, metaKey: true }),
                ),
            ).toBe('<C-f>');
        });
    });

    describe('Shift modifier (S-)', () => {
        it('produces <S-Tab> for Shift+Tab', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('Tab', { shiftKey: true })),
            ).toBe('<S-Tab>');
        });

        it('produces <S-CR> for Shift+Enter', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('Enter', { shiftKey: true })),
            ).toBe('<S-CR>');
        });

        it('produces <S-Space> for Shift+Space', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent(' ', { shiftKey: true })),
            ).toBe('<S-Space>');
        });

        it('does not produce S- for shifted single-char keys', () => {
            expect(
                normalizeKeyEvent(fakeKeyEvent('F', { shiftKey: true })),
            ).toBe('F');
        });
    });

    describe('modifier combinations', () => {
        it('produces <C-A-f> for Ctrl+Alt+f', () => {
            expect(
                normalizeKeyEvent(
                    fakeKeyEvent('f', { ctrlKey: true, altKey: true }),
                ),
            ).toBe('<C-A-f>');
        });

        it('produces <C-S-Tab> for Ctrl+Shift+Tab', () => {
            expect(
                normalizeKeyEvent(
                    fakeKeyEvent('Tab', {
                        ctrlKey: true,
                        shiftKey: true,
                    }),
                ),
            ).toBe('<C-S-Tab>');
        });

        it('produces <A-S-Tab> for Alt+Shift+Tab', () => {
            expect(
                normalizeKeyEvent(
                    fakeKeyEvent('Tab', { altKey: true, shiftKey: true }),
                ),
            ).toBe('<A-S-Tab>');
        });
    });
});
