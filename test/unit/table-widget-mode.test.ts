import { afterEach, describe, expect, it } from 'vitest';
import { effectiveTableWidgetMode } from '../../src/vim/table/gates';
import {
    _resetExternalVimMode,
    setExternalVimMode,
} from '../../src/vim/external-mode';

describe('the table widget mode in effect', () => {
    afterEach(() => _resetExternalVimMode());

    it('auto is reveal with the Neovim backend and native without', () => {
        expect([
            effectiveTableWidgetMode('auto', true),
            effectiveTableWidgetMode('auto', false),
        ]).toEqual(['reveal', 'native']);
    });

    it('native, reveal and raw hold whatever owns the keys', () => {
        expect(
            ['native', 'reveal', 'raw'].flatMap((mode) => [
                effectiveTableWidgetMode(mode, true),
                effectiveTableWidgetMode(mode, false),
            ]),
        ).toEqual(['native', 'native', 'reveal', 'reveal', 'raw', 'raw']);
    });

    it('reads whether the backend owns the keys when not told', () => {
        const before = effectiveTableWidgetMode('auto');
        setExternalVimMode('normal');
        const connected = effectiveTableWidgetMode('auto');
        setExternalVimMode(null);
        expect([before, connected, effectiveTableWidgetMode('auto')]).toEqual([
            'native',
            'reveal',
            'native',
        ]);
    });

    it('treats an unknown value as native', () => {
        expect(effectiveTableWidgetMode('cursor', true)).toBe('native');
    });
});
