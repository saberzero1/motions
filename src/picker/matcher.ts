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
    return { search: matcher.search, dispose() {} };
}

export function createMatcher(engine: MatcherEngine = 'auto'): ManagedMatcher {
    const resolvedEngine =
        engine === 'auto' ? (Platform.isMobile ? 'ufuzzy' : 'nucleo') : engine;

    if (resolvedEngine === 'obsidian') {
        return wrapStateless(createObsidianMatcher());
    }

    if (resolvedEngine === 'nucleo') {
        try {
            const { createNucleoMatcher } = require('./matcher-nucleo') as {
                createNucleoMatcher: () => DisposableMatcher | null;
            };
            const nucleo = createNucleoMatcher();
            if (nucleo) return nucleo;
        } catch {
            // WASM loading failed — fall through to uFuzzy
        }
    }

    return wrapStateless(createUFuzzyMatcher());
}
