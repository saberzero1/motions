import type { PickerSource } from './types';

class PickerRegistry {
    private sources = new Map<string, PickerSource>();
    private builtinNames = new Set<string>();

    register(source: PickerSource, builtin = false): void {
        this.sources.set(source.name, source);
        if (builtin) {
            this.builtinNames.add(source.name);
        }
    }

    unregister(name: string): boolean {
        return this.sources.delete(name);
    }

    get(name: string): PickerSource | undefined {
        return this.sources.get(name);
    }

    has(name: string): boolean {
        return this.sources.has(name);
    }

    getAll(): PickerSource[] {
        return Array.from(this.sources.values());
    }

    getBuiltinNames(): ReadonlySet<string> {
        return this.builtinNames;
    }

    isBuiltin(name: string): boolean {
        return this.builtinNames.has(name);
    }
}

export const pickerRegistry = new PickerRegistry();
