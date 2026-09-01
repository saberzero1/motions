import { Parser, type Tree, type Node } from 'web-tree-sitter';
import { QueryWrapper } from './query';
import {
    resolveInjections,
    injectionRangesToIncludedRanges,
    type InjectionRange,
} from './injection';
import { getLanguage, isLanguageLoaded } from './runtime';

export type LanguageTreeCallback = (...args: unknown[]) => void;

interface LanguageTreeCallbacks {
    changedtree: LanguageTreeCallback[];
    bytes: LanguageTreeCallback[];
    child_added: LanguageTreeCallback[];
    child_removed: LanguageTreeCallback[];
}

export class LanguageTree {
    private _lang: string;
    private _source: string;
    private _parser: Parser;
    private _tree: Tree | null = null;
    private _children = new Map<string, LanguageTree>();
    private _parent: LanguageTree | null = null;
    private _regions: InjectionRange[][] = [];
    private _valid = false;
    private _callbacks: LanguageTreeCallbacks = {
        changedtree: [],
        bytes: [],
        child_added: [],
        child_removed: [],
    };
    private _injectionQuery: QueryWrapper | null = null;

    constructor(source: string, lang: string, parent?: LanguageTree) {
        this._lang = lang;
        this._source = source;
        this._parent = parent ?? null;

        const language = getLanguage(lang);
        if (!language) throw new Error(`Language "${lang}" not loaded`);

        this._parser = new Parser();
        this._parser.setLanguage(language);
    }

    parse(): Map<number, Tree> {
        const trees = new Map<number, Tree>();

        if (!this._valid) {
            const oldTree = this._tree;

            if (this._regions.length > 0 && this._regions[0]) {
                const included = injectionRangesToIncludedRanges(
                    this._regions[0],
                );
                if (included.length > 0) {
                    this._tree =
                        this._parser.parse(this._source, oldTree ?? undefined, {
                            includedRanges: included,
                        }) ?? null;
                } else {
                    this._tree =
                        this._parser.parse(
                            this._source,
                            oldTree ?? undefined,
                        ) ?? null;
                }
            } else {
                this._tree =
                    this._parser.parse(this._source, oldTree ?? undefined) ??
                    null;
            }

            if (oldTree && oldTree !== this._tree) oldTree.delete();
            this._valid = true;

            for (const cb of this._callbacks.changedtree) {
                cb([], this._tree);
            }
        }

        if (this._tree) {
            trees.set(0, this._tree);
            this.resolveChildInjections();
        }

        for (const [, child] of this._children) {
            const childTrees = child.parse();
            let idx = trees.size;
            for (const [, t] of childTrees) {
                trees.set(idx++, t);
            }
        }

        return trees;
    }

    private resolveChildInjections(): void {
        if (!this._tree) return;

        try {
            this._injectionQuery = this.loadInjectionQuery();
        } catch {
            return;
        }

        const injections = resolveInjections(
            this._tree.rootNode,
            this._source,
            this._injectionQuery,
        );

        const activeChildLangs = new Set<string>();

        for (const inj of injections) {
            if (!isLanguageLoaded(inj.language)) continue;
            activeChildLangs.add(inj.language);

            let child = this._children.get(inj.language);
            if (!child) {
                child = new LanguageTree(this._source, inj.language, this);
                this._children.set(inj.language, child);
                for (const cb of this._callbacks.child_added) cb(child);
            }

            child.setRegions([inj.ranges]);
            child.setSource(this._source);
            child.invalidate();
        }

        for (const [lang, child] of this._children) {
            if (!activeChildLangs.has(lang)) {
                child.destroy();
                this._children.delete(lang);
                for (const cb of this._callbacks.child_removed) cb(child);
            }
        }
    }

    private loadInjectionQuery(): QueryWrapper | null {
        const language = getLanguage(this._lang);
        if (!language) return null;

        try {
            return new QueryWrapper(language, '');
        } catch {
            return null;
        }
    }

    trees(): Map<number, Tree> {
        if (!this._valid) this.parse();
        const result = new Map<number, Tree>();
        if (this._tree) result.set(0, this._tree);
        return result;
    }

    lang(): string {
        return this._lang;
    }

    source(): string {
        return this._source;
    }

    children(): Map<string, LanguageTree> {
        return this._children;
    }

    parent(): LanguageTree | null {
        return this._parent;
    }

    isValid(): boolean {
        return this._valid;
    }

    includedRegions(): InjectionRange[][] {
        return this._regions;
    }

    contains(range: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
    }): boolean {
        if (this._regions.length === 0) return true;

        for (const regionGroup of this._regions) {
            for (const r of regionGroup) {
                const afterStart =
                    range.startRow > r.startPosition.row ||
                    (range.startRow === r.startPosition.row &&
                        range.startCol >= r.startPosition.column);
                const beforeEnd =
                    range.endRow < r.endPosition.row ||
                    (range.endRow === r.endPosition.row &&
                        range.endCol <= r.endPosition.column);
                if (afterStart && beforeEnd) return true;
            }
        }
        return false;
    }

    treeForRange(range: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
    }): Tree | null {
        for (const [, child] of this._children) {
            if (child.contains(range)) {
                const childTree = child.treeForRange(range);
                if (childTree) return childTree;
            }
        }
        return this._tree;
    }

    nodeForRange(range: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
    }): Node | null {
        const tree = this.treeForRange(range);
        if (!tree) return null;
        return tree.rootNode.descendantForPosition(
            { row: range.startRow, column: range.startCol },
            { row: range.endRow, column: range.endCol },
        );
    }

    namedNodeForRange(range: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
    }): Node | null {
        const tree = this.treeForRange(range);
        if (!tree) return null;
        return tree.rootNode.namedDescendantForPosition(
            { row: range.startRow, column: range.startCol },
            { row: range.endRow, column: range.endCol },
        );
    }

    languageForRange(range: {
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
    }): LanguageTree {
        for (const [, child] of this._children) {
            if (child.contains(range)) {
                return child.languageForRange(range);
            }
        }
        return this;
    }

    forEachTree(fn: (tree: Tree, ltree: LanguageTree) => void): void {
        if (this._tree) fn(this._tree, this);
        for (const [, child] of this._children) {
            child.forEachTree(fn);
        }
    }

    registerCbs(
        cbs: Partial<Record<keyof LanguageTreeCallbacks, LanguageTreeCallback>>,
        recursive?: boolean,
    ): void {
        for (const [key, cb] of Object.entries(cbs)) {
            const k = key.replace(/^on_/, '') as keyof LanguageTreeCallbacks;
            if (this._callbacks[k] && cb) {
                this._callbacks[k].push(cb);
            }
        }
        if (recursive) {
            for (const [, child] of this._children) {
                child.registerCbs(cbs, true);
            }
        }
    }

    invalidate(): void {
        this._valid = false;
        for (const [, child] of this._children) {
            child.invalidate();
        }
    }

    setSource(source: string): void {
        if (this._source !== source) {
            this._source = source;
            this._valid = false;
        }
    }

    setRegions(regions: InjectionRange[][]): void {
        this._regions = regions;
    }

    destroy(): void {
        for (const [, child] of this._children) {
            child.destroy();
        }
        this._children.clear();
        if (this._tree) {
            this._tree.delete();
            this._tree = null;
        }
        this._parser.delete();
        this._injectionQuery?.delete();
        this._injectionQuery = null;
    }

    rootNode(): Node | null {
        if (!this._valid) this.parse();
        return this._tree?.rootNode ?? null;
    }
}
