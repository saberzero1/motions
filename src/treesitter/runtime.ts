import { Parser, Language, type Tree } from 'web-tree-sitter';
import treeSitterWasm from '../../node_modules/web-tree-sitter/web-tree-sitter.wasm';
import markdownWasm from './grammars/tree-sitter-markdown.wasm';
import htmlWasm from './grammars/tree-sitter-html.wasm';

type GrammarName = string;

const BUNDLED_GRAMMARS: ReadonlyMap<GrammarName, Uint8Array> = new Map([
    ['markdown', markdownWasm],
    ['html', htmlWasm],
]);

let initPromise: Promise<void> | null = null;
let initialized = false;

const languages = new Map<GrammarName, Language>();
const parsers = new Map<GrammarName, Parser>();

async function ensureInit(): Promise<void> {
    if (initialized) return;
    if (initPromise) return initPromise;
    initPromise = Parser.init({
        wasmBinary: treeSitterWasm.buffer,
        locateFile: () => '',
    }).then(() => {
        initialized = true;
    });
    return initPromise;
}

export async function loadLanguage(name: GrammarName): Promise<Language> {
    await ensureInit();

    const cached = languages.get(name);
    if (cached) return cached;

    const bundled = BUNDLED_GRAMMARS.get(name);
    if (!bundled) {
        throw new Error(
            `Grammar "${name}" is not bundled. ` +
                `Available: ${[...BUNDLED_GRAMMARS.keys()].join(', ')}`,
        );
    }

    const language = await Language.load(bundled);
    languages.set(name, language);
    return language;
}

export function getOrCreateParser(name: GrammarName): Parser {
    const existing = parsers.get(name);
    if (existing) return existing;

    const language = languages.get(name);
    if (!language) {
        throw new Error(
            `Language "${name}" not loaded. Call loadLanguage("${name}") first.`,
        );
    }

    const parser = new Parser();
    parser.setLanguage(language);
    parsers.set(name, parser);
    return parser;
}

export function getLanguage(name: GrammarName): Language | undefined {
    return languages.get(name);
}

export function isLanguageLoaded(name: GrammarName): boolean {
    return languages.has(name);
}

export function isBundledGrammar(name: GrammarName): boolean {
    return BUNDLED_GRAMMARS.has(name);
}

export function getBundledGrammarNames(): string[] {
    return [...BUNDLED_GRAMMARS.keys()];
}

export function destroyAll(): void {
    for (const parser of parsers.values()) {
        parser.delete();
    }
    parsers.clear();
    languages.clear();
    initialized = false;
    initPromise = null;
}

export function parseString(
    name: GrammarName,
    text: string,
    oldTree?: Tree,
): Tree {
    const parser = getOrCreateParser(name);
    const tree = parser.parse(text, oldTree ?? undefined);
    if (!tree) {
        throw new Error(`Failed to parse with grammar "${name}"`);
    }
    return tree;
}

export { Parser, Language, type Tree };
export type { GrammarName };
