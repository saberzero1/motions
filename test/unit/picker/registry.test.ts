import { describe, expect, it, beforeEach } from 'vitest';
import { pickerRegistry } from '../../../src/picker/registry';
import type { PickerSource } from '../../../src/picker/types';
import type { App } from 'obsidian';

function stubSource(name: string): PickerSource {
    return {
        name,
        placeholder: `${name}…`,
        items: () => [],
        onSelect: () => {},
    };
}

describe('PickerRegistry', () => {
    beforeEach(() => {
        for (const source of pickerRegistry.getAll()) {
            pickerRegistry.register({ ...source });
        }
    });

    it('registers and retrieves a source by name', () => {
        const source = stubSource('test-source');
        pickerRegistry.register(source);
        expect(pickerRegistry.get('test-source')).toBe(source);
    });

    it('returns undefined for unregistered source', () => {
        expect(pickerRegistry.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing source with same name', () => {
        const first = stubSource('dup');
        const second = stubSource('dup');
        second.placeholder = 'replaced';
        pickerRegistry.register(first);
        pickerRegistry.register(second);
        expect(pickerRegistry.get('dup')?.placeholder).toBe('replaced');
    });

    it('getAll returns all registered sources', () => {
        const a = stubSource('src-a');
        const b = stubSource('src-b');
        pickerRegistry.register(a);
        pickerRegistry.register(b);
        const all = pickerRegistry.getAll();
        const names = all.map((s) => s.name);
        expect(names).toContain('src-a');
        expect(names).toContain('src-b');
    });
});
