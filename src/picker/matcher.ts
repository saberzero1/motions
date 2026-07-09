import type { PickerMatcher } from './types';
import { createUFuzzyMatcher } from './matcher-ufuzzy';
import { createObsidianMatcher } from './matcher-obsidian';

export type MatcherEngine = 'ufuzzy' | 'obsidian';

export interface ManagedMatcher extends PickerMatcher {
    dispose(): void;
}

function wrapStateless(matcher: PickerMatcher): ManagedMatcher {
    return {
        search: (query, items) => matcher.search(query, items),
        dispose() {},
    };
}

export function createMatcher(
    engine: MatcherEngine = 'ufuzzy',
): ManagedMatcher {
    if (engine === 'obsidian') {
        return wrapStateless(createObsidianMatcher());
    }

    return wrapStateless(createUFuzzyMatcher());
}
