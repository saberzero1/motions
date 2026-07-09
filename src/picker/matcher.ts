import { Platform } from 'obsidian';
import type { PickerMatcher } from './types';
import type { DisposableMatcher } from './matcher-nucleo';
import { createUFuzzyMatcher } from './matcher-ufuzzy';
import { createObsidianMatcher } from './matcher-obsidian';

export type MatcherEngine = 'auto' | 'nucleo' | 'ufuzzy' | 'obsidian';

export interface ManagedMatcher extends PickerMatcher {
    dispose(): void;
}

function wrapStateless(matcher: PickerMatcher): ManagedMatcher {
    return {
        search: (query, items) => matcher.search(query, items),
        dispose() {},
    };
}

export function createMatcher(engine: MatcherEngine = 'auto'): ManagedMatcher {
    const resolvedEngine =
        engine === 'auto' ? (Platform.isMobile ? 'ufuzzy' : 'nucleo') : engine;

    if (resolvedEngine === 'obsidian') {
        return wrapStateless(createObsidianMatcher());
    }

    if (resolvedEngine === 'nucleo') {
        try {
            /* eslint-disable @typescript-eslint/no-require-imports, no-undef -- dynamic import: nucleo is only loaded when selected */
            const { createNucleoMatcher } = require('./matcher-nucleo') as {
                createNucleoMatcher: () => DisposableMatcher | null;
            };
            /* eslint-enable @typescript-eslint/no-require-imports, no-undef -- end dynamic import */
            const nucleo = createNucleoMatcher();
            if (nucleo) return nucleo;
        } catch {
            // WASM loading failed — fall through to uFuzzy
        }
    }

    return wrapStateless(createUFuzzyMatcher());
}
