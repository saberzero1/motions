import type { PickerItem, PickerMatch, PickerMatcher } from './types';
import {
    indicesToRanges,
    utf32ToUtf16Indices,
    buildHighlights,
    buildHaystack,
} from './matcher-utils';

interface NucleoMatcherInstance {
    setItems(items: string[]): void;
    matchLiteralIndexedWithIndices(
        pattern: string,
        kind: string | null,
        options: { maxResults?: number } | null,
    ): {
        indices: Uint32Array;
        scores: Uint32Array;
        charIndices: Uint32Array[];
    };
    free(): void;
}

interface NucleoModule {
    NucleoMatcher: new (
        items: string[],
        options?: {
            matchPaths?: boolean;
            caseMatching?: string;
            normalization?: string;
        } | null,
    ) => NucleoMatcherInstance;
    initSync(module: ArrayBuffer | Uint8Array): void;
}

let nucleoModule: NucleoModule | null = null;
let initAttempted = false;

function getNucleoModule(): NucleoModule | null {
    if (nucleoModule) return nucleoModule;
    if (initAttempted) return null;
    initAttempted = true;

    try {
        /* eslint-disable @typescript-eslint/no-require-imports, no-undef -- esbuild binary loader only works via require() in CJS output */
        const wasmBytes =
            require('nucleo-matcher-wasm/nucleo_wasm_bg.wasm') as Uint8Array;
        const mod = require('nucleo-matcher-wasm/web') as NucleoModule;
        /* eslint-enable @typescript-eslint/no-require-imports, no-undef -- end WASM require block */
        mod.initSync(wasmBytes);
        nucleoModule = mod;
        return mod;
    } catch (e) {
        console.warn(
            'nucleo-matcher-wasm: WASM initialization failed, falling back to uFuzzy',
            e,
        );
        return null;
    }
}

export interface DisposableMatcher extends PickerMatcher {
    dispose(): void;
}

export function createNucleoMatcher(): DisposableMatcher | null {
    const mod = getNucleoModule();
    if (!mod) return null;

    let nucleo: NucleoMatcherInstance | null = null;
    let lastItemCount = -1;

    return {
        search(query: string, items: PickerItem[]): PickerMatch[] {
            const haystack = items.map(buildHaystack);

            if (!nucleo) {
                nucleo = new mod.NucleoMatcher(haystack, {
                    matchPaths: true,
                    caseMatching: 'smart',
                    normalization: 'smart',
                });
                lastItemCount = items.length;
            } else if (items.length !== lastItemCount) {
                nucleo.setItems(haystack);
                lastItemCount = items.length;
            }

            if (!query) {
                return items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
            }

            const result = nucleo.matchLiteralIndexedWithIndices(
                query,
                'fuzzy',
                { maxResults: 500 },
            );

            const total = result.indices.length;
            const matches: PickerMatch[] = [];
            for (let i = 0; i < total; i++) {
                const itemIdx = result.indices[i]!;
                const item = items[itemIdx];
                if (!item) continue;
                const rawIndices = Array.from(result.charIndices[i] ?? []);
                const utf16Indices = utf32ToUtf16Indices(
                    haystack[itemIdx]!,
                    rawIndices,
                );
                const ranges = indicesToRanges(utf16Indices);
                const highlights = buildHighlights(item, ranges);
                matches.push({
                    item,
                    score: total - i,
                    highlights: highlights.label,
                    descHighlights:
                        highlights.desc.length > 0
                            ? highlights.desc
                            : undefined,
                });
            }
            return matches;
        },

        dispose(): void {
            if (nucleo) {
                nucleo.free();
                nucleo = null;
                lastItemCount = -1;
            }
        },
    };
}
