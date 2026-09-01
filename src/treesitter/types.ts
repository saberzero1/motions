import type { Node, Tree, Language } from 'web-tree-sitter';

export interface TreeSitterState {
    tree: Tree | null;
    language: Language;
    languageName: string;
}

export interface ParseResult {
    tree: Tree;
    languageName: string;
}

export type FiletypeLangMap = Map<string, string>;
export type LangFiletypeMap = Map<string, Set<string>>;

export { type Node, type Tree, type Language };
