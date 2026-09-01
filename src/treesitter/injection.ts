import type { Node } from 'web-tree-sitter';
import { QueryWrapper } from './query';

export interface InjectionRange {
    startIndex: number;
    endIndex: number;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
}

export interface InjectionResult {
    language: string;
    ranges: InjectionRange[];
    combined: boolean;
}

export function resolveInjections(
    rootNode: Node,
    source: string,
    injectionQuery: QueryWrapper | null,
): InjectionResult[] {
    if (!injectionQuery) return [];

    const byLang = new Map<
        string,
        { ranges: InjectionRange[]; combined: boolean }
    >();
    const captures = injectionQuery.iterCaptures(rootNode, source);

    for (const cap of captures) {
        const lang =
            (cap.metadata['injection.language'] as string | undefined) ??
            (cap.metadata['injection.content'] ? null : cap.captureName);
        if (!lang) continue;

        let entry = byLang.get(lang);
        if (!entry) {
            entry = {
                ranges: [],
                combined: cap.metadata['injection.combined'] === 'true',
            };
            byLang.set(lang, entry);
        }

        entry.ranges.push({
            startIndex: cap.node.startIndex,
            endIndex: cap.node.endIndex,
            startPosition: { ...cap.node.startPosition },
            endPosition: { ...cap.node.endPosition },
        });
    }

    const results: InjectionResult[] = [];
    for (const [language, entry] of byLang) {
        results.push({
            language,
            ranges: entry.ranges,
            combined: entry.combined,
        });
    }

    return results;
}

export function injectionRangesToIncludedRanges(
    ranges: InjectionRange[],
): Array<{
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    startIndex: number;
    endIndex: number;
}> {
    return ranges.map((r) => ({
        startPosition: r.startPosition,
        endPosition: r.endPosition,
        startIndex: r.startIndex,
        endIndex: r.endIndex,
    }));
}
