import { describe, it, expect } from 'vitest';
import { normalizeVimKey } from '../../src/ui/which-key';

describe('normalizeVimKey', () => {
    it('converts literal space to <Space>', () => {
        expect(normalizeVimKey(' ')).toBe('<Space>');
    });

    it('converts space in key sequence', () => {
        expect(normalizeVimKey(' ff')).toBe('<Space>ff');
    });

    it('converts multiple spaces', () => {
        expect(normalizeVimKey(' f ')).toBe('<Space>f<Space>');
    });

    it('preserves existing <Space> notation', () => {
        expect(normalizeVimKey('<Space>ff')).toBe('<Space>ff');
    });

    it('preserves other angle-bracket sequences', () => {
        expect(normalizeVimKey('<C-w>v')).toBe('<C-w>v');
        expect(normalizeVimKey('<CR>')).toBe('<CR>');
        expect(normalizeVimKey('<leader>f')).toBe('<leader>f');
    });

    it('handles mixed notation and literal spaces', () => {
        expect(normalizeVimKey('<C-w> ')).toBe('<C-w><Space>');
    });

    it('returns single-char keys unchanged', () => {
        expect(normalizeVimKey('f')).toBe('f');
        expect(normalizeVimKey('\\')).toBe('\\');
        expect(normalizeVimKey(',')).toBe(',');
    });

    it('returns empty string unchanged', () => {
        expect(normalizeVimKey('')).toBe('');
    });

    it('does not double-encode <Space>', () => {
        const once = normalizeVimKey(' ');
        const twice = normalizeVimKey(once);
        expect(twice).toBe('<Space>');
    });
});
