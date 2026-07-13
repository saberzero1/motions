export interface SnippetDefinition {
    prefix: string | string[];
    body: string | string[];
    description?: string;
    context?: string;
    scope?: string;
}

export type SnippetFile = Record<string, SnippetDefinition>;

export interface SnippetEntry {
    id: string;
    name: string;
    prefixes: string[];
    body: string[];
    description: string;
    context?: string;
    source: 'bundled' | 'user' | 'lua';
    sourceFile?: string;
}

export interface PreprocessContext {
    filePath: string;
    clipboard: string;
    selectedText: string;
}
