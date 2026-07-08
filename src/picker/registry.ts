import type { PickerSource } from './types';

class PickerRegistry {
    private sources = new Map<string, PickerSource>();

    register(source: PickerSource): void {
        this.sources.set(source.name, source);
    }

    get(name: string): PickerSource | undefined {
        return this.sources.get(name);
    }

    getAll(): PickerSource[] {
        return Array.from(this.sources.values());
    }
}

export const pickerRegistry = new PickerRegistry();
