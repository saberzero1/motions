import { Query as TSQuery, type Node, type Language } from 'web-tree-sitter';
import { evaluatePredicate } from './predicates';
import { applyDirective, type Metadata } from './directives';

export interface PredicateStep {
    type: 'capture' | 'string';
    name: string;
    value: string;
}

export interface FilteredCapture {
    captureId: number;
    captureName: string;
    node: Node;
    patternIndex: number;
    metadata: Metadata;
}

export interface FilteredMatch {
    patternIndex: number;
    captures: Map<number, Node[]>;
    metadata: Metadata;
}

interface QueryOptions {
    startRow?: number;
    endRow?: number;
    startCol?: number;
    endCol?: number;
}

export class QueryWrapper {
    readonly captureNames: string[];
    private readonly tsQuery: TSQuery;
    private readonly predicates: Array<
        Array<{ operator: string; operands: PredicateStep[] }>
    >;

    constructor(language: Language, source: string) {
        this.tsQuery = new TSQuery(language, source);
        this.captureNames = [...this.tsQuery.captureNames];
        this.predicates = this.parsePredicates();
    }

    private parsePredicates(): Array<
        Array<{ operator: string; operands: PredicateStep[] }>
    > {
        const result: Array<
            Array<{ operator: string; operands: PredicateStep[] }>
        > = [];
        const patternCount = this.tsQuery.patternCount();

        for (let i = 0; i < patternCount; i++) {
            const rawPreds = this.tsQuery.predicatesForPattern(i);
            const parsed: Array<{
                operator: string;
                operands: PredicateStep[];
            }> = [];

            for (const pred of rawPreds) {
                const steps: PredicateStep[] = pred.operands.map((op) => {
                    if (op.type === 'capture') {
                        return {
                            type: 'capture' as const,
                            name: op.name,
                            value: '',
                        };
                    }
                    return {
                        type: 'string' as const,
                        name: '',
                        value: op.value,
                    };
                });
                parsed.push({ operator: pred.operator, operands: steps });
            }

            result.push(parsed);
        }

        return result;
    }

    iterCaptures(
        node: Node,
        source: string,
        options?: QueryOptions,
    ): FilteredCapture[] {
        const queryOpts = this.buildQueryOptions(options);
        const rawCaptures = this.tsQuery.captures(node, queryOpts);
        const result: FilteredCapture[] = [];

        for (const raw of rawCaptures) {
            const captureId = this.captureNames.indexOf(raw.name);
            const patternPreds = this.predicates[raw.patternIndex] ?? [];

            const captureMap = new Map<string, Node[]>();
            captureMap.set(raw.name, [raw.node]);

            let pass = true;
            const metadata: Metadata = {};

            for (const pred of patternPreds) {
                if (pred.operator.endsWith('!')) {
                    applyDirective(
                        pred.operator,
                        pred.operands,
                        metadata,
                        captureId,
                        this.captureNames,
                    );
                } else {
                    if (
                        !evaluatePredicate(
                            pred.operator,
                            pred.operands,
                            captureMap,
                            source,
                        )
                    ) {
                        pass = false;
                        break;
                    }
                }
            }

            if (pass) {
                result.push({
                    captureId,
                    captureName: raw.name,
                    node: raw.node,
                    patternIndex: raw.patternIndex,
                    metadata,
                });
            }
        }

        return result;
    }

    iterMatches(
        node: Node,
        source: string,
        options?: QueryOptions,
    ): FilteredMatch[] {
        const queryOpts = this.buildQueryOptions(options);
        const rawMatches = this.tsQuery.matches(node, queryOpts);
        const result: FilteredMatch[] = [];

        for (const raw of rawMatches) {
            const captureMap = new Map<string, Node[]>();
            const captureIdMap = new Map<number, Node[]>();

            for (const cap of raw.captures) {
                const captureId = this.captureNames.indexOf(cap.name);
                const existing = captureMap.get(cap.name) ?? [];
                existing.push(cap.node);
                captureMap.set(cap.name, existing);

                const idExisting = captureIdMap.get(captureId) ?? [];
                idExisting.push(cap.node);
                captureIdMap.set(captureId, idExisting);
            }

            const patternPreds = this.predicates[raw.patternIndex] ?? [];
            let pass = true;
            const metadata: Metadata = {};

            for (const pred of patternPreds) {
                if (pred.operator.endsWith('!')) {
                    applyDirective(
                        pred.operator,
                        pred.operands,
                        metadata,
                        0,
                        this.captureNames,
                    );
                } else {
                    if (
                        !evaluatePredicate(
                            pred.operator,
                            pred.operands,
                            captureMap,
                            source,
                        )
                    ) {
                        pass = false;
                        break;
                    }
                }
            }

            if (pass) {
                result.push({
                    patternIndex: raw.patternIndex,
                    captures: captureIdMap,
                    metadata,
                });
            }
        }

        return result;
    }

    disableCapture(name: string): void {
        this.tsQuery.disableCapture(name);
    }

    disablePattern(index: number): void {
        this.tsQuery.disablePattern(index);
    }

    patternCount(): number {
        return this.tsQuery.patternCount();
    }

    delete(): void {
        this.tsQuery.delete();
    }

    private buildQueryOptions(options?: QueryOptions): {
        startPosition?: { row: number; column: number };
        endPosition?: { row: number; column: number };
    } {
        const result: {
            startPosition?: { row: number; column: number };
            endPosition?: { row: number; column: number };
        } = {};
        if (options?.startRow !== undefined) {
            result.startPosition = {
                row: options.startRow,
                column: options.startCol ?? 0,
            };
        }
        if (options?.endRow !== undefined) {
            result.endPosition = {
                row: options.endRow,
                column: options.endCol ?? 0,
            };
        }
        return result;
    }
}

const queryCache = new Map<string, QueryWrapper>();

export function getCachedQuery(
    language: Language,
    source: string,
    cacheKey: string,
): QueryWrapper {
    const existing = queryCache.get(cacheKey);
    if (existing) return existing;
    const wrapper = new QueryWrapper(language, source);
    queryCache.set(cacheKey, wrapper);
    return wrapper;
}

export function clearQueryCache(): void {
    for (const q of queryCache.values()) q.delete();
    queryCache.clear();
}
