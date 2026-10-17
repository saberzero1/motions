import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

// Specs reach the plugin through `app as unknown as { plugins: { plugins:
// Record<string, T> } }`, where T is written by hand. Strict type-checking
// cannot catch a mistake in T, because T is an assertion about the plugin
// rather than a reading of it: a member that does not exist still compiles and
// silently evaluates to undefined at runtime.
//
// That is not hypothetical. `treesitter.e2e.ts` declared `luaLoadResult`, which
// the plugin has never had, so its `getLuaConfigError()` returned null
// unconditionally and all 12 of its tests passed against a Lua body of
// `this is not valid lua @@@ ###`.

const REPO_ROOT = resolve(__dirname, '../..');

// Members of obsidian's Plugin/Component base classes that specs legitimately
// reach. Kept explicit because src/main.ts is parsed syntactically, without a
// type checker that would resolve the base classes.
const OBSIDIAN_PLUGIN_MEMBERS = new Set([
    'app',
    'manifest',
    'addCommand',
    'addRibbonIcon',
    'addSettingTab',
    'addStatusBarItem',
    'loadData',
    'onload',
    'onunload',
    'register',
    'registerDomEvent',
    'registerEditorExtension',
    'registerEvent',
    'registerInterval',
    'registerView',
    'saveData',
    'unload',
]);

function collectFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) collectFiles(full, out);
        else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.ES2021,
        true,
    );
}

/** Names declared on the default-exported plugin class in src/main.ts. */
function pluginMembers(): Set<string> {
    const source = parse(join(REPO_ROOT, 'src/main.ts'));
    const names = new Set<string>();
    for (const statement of source.statements) {
        if (!ts.isClassDeclaration(statement)) continue;
        const isDefaultExport = statement.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
        );
        if (!isDefaultExport) continue;
        for (const member of statement.members) {
            const name = member.name;
            if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name)))
                names.add(name.text);
        }
    }
    return names;
}

/**
 * Members this guard can read a name from.
 *
 * `MethodSignature` as well as `PropertySignature`, because a handle declared
 * `getNestedTableStats(): Stats;` parses as the former. Filtering it out made
 * the plugin handle invisible in 9 table specs — the guard checked nothing at
 * all for them, while its own `declaredPluginMembers().length > 50` self-check
 * still passed, because unrelated `settings`/`saveSettings` property
 * signatures elsewhere kept the count above the floor.
 */
function isNamedTypeMember(
    member: ts.TypeElement,
): member is ts.PropertySignature | ts.MethodSignature {
    return ts.isPropertySignature(member) || ts.isMethodSignature(member);
}

function membersOfTypeLiteral(node: ts.TypeLiteralNode): string[] {
    return node.members
        .filter(isNamedTypeMember)
        .map((m) => m.name)
        .filter((n): n is ts.Identifier | ts.StringLiteral =>
            Boolean(n && (ts.isIdentifier(n) || ts.isStringLiteral(n))),
        )
        .map((n) => n.text);
}

/** Resolves a `Record<string, T>` value type to the member names T declares. */
function membersOfRecordValue(
    node: ts.TypeNode,
    source: ts.SourceFile,
): string[] {
    if (ts.isTypeLiteralNode(node)) return membersOfTypeLiteral(node);
    if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName))
        return [];
    const target = node.typeName.text;
    for (const statement of source.statements) {
        if (
            ts.isInterfaceDeclaration(statement) &&
            statement.name.text === target
        ) {
            return statement.members
                .filter(isNamedTypeMember)
                .map((m) => m.name)
                .filter((n): n is ts.Identifier | ts.StringLiteral =>
                    Boolean(n && (ts.isIdentifier(n) || ts.isStringLiteral(n))),
                )
                .map((n) => n.text);
        }
        if (
            ts.isTypeAliasDeclaration(statement) &&
            statement.name.text === target &&
            ts.isTypeLiteralNode(statement.type)
        ) {
            return membersOfTypeLiteral(statement.type);
        }
    }
    return [];
}

interface Declared {
    file: string;
    line: number;
    member: string;
}

/**
 * True for the inner `plugins` of `{ plugins: { plugins: Record<string, T> } }`
 * — Obsidian's registry. An unrelated `plugins: Record<string, T>` field, such
 * as the Lua-plugin audit artifact in plugin-api-demand.test.ts, is not nested
 * this way and describes something else entirely.
 */
function isObsidianPluginRegistry(node: ts.PropertySignature): boolean {
    const literal = node.parent;
    if (!literal || !ts.isTypeLiteralNode(literal)) return false;
    const outer = literal.parent;
    return Boolean(
        outer &&
        ts.isPropertySignature(outer) &&
        outer.name &&
        ts.isIdentifier(outer.name) &&
        outer.name.text === 'plugins',
    );
}

/**
 * Every member name declared for the plugin handle in `plugins: Record<string,
 * T>`, which is how specs describe the plugin to the type system.
 */
function declaredPluginMembers(): Declared[] {
    const files = collectFiles(join(REPO_ROOT, 'test'));
    const found: Declared[] = [];
    for (const file of files) {
        const source = parse(file);
        const visit = (node: ts.Node): void => {
            if (
                ts.isPropertySignature(node) &&
                node.name &&
                ts.isIdentifier(node.name) &&
                node.name.text === 'plugins' &&
                isObsidianPluginRegistry(node) &&
                node.type &&
                ts.isTypeReferenceNode(node.type) &&
                ts.isIdentifier(node.type.typeName) &&
                node.type.typeName.text === 'Record' &&
                node.type.typeArguments?.length === 2
            ) {
                const value = node.type.typeArguments[1];
                if (value) {
                    const line =
                        source.getLineAndCharacterOfPosition(node.getStart())
                            .line + 1;
                    for (const member of membersOfRecordValue(value, source))
                        found.push({
                            file: relative(REPO_ROOT, file),
                            line,
                            member,
                        });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return found;
}

/**
 * `browser.executeObsidian(cb)` returns whatever `cb` returns, so a trailing
 * `as boolean` on a callback that can also return `{ error: string }` narrows
 * the failure branch away: the object is truthy, and the assertion reads a
 * pass. 109 callbacks in the suite have such a branch, and none is currently
 * cast to a primitive. This keeps it that way.
 */
function errorBranchesCastAway(): string[] {
    const found: string[] = [];
    for (const file of collectFiles(join(REPO_ROOT, 'test'))) {
        const source = parse(file);
        const visit = (node: ts.Node): void => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'executeObsidian'
            ) {
                const callback = node.arguments[0];
                if (callback && returnsErrorObject(callback)) {
                    const cast = enclosingCast(node);
                    const isPrimitive =
                        cast?.kind === ts.SyntaxKind.BooleanKeyword ||
                        cast?.kind === ts.SyntaxKind.StringKeyword ||
                        cast?.kind === ts.SyntaxKind.NumberKeyword;
                    if (cast && isPrimitive) {
                        const line =
                            source.getLineAndCharacterOfPosition(
                                node.getStart(),
                            ).line + 1;
                        found.push(
                            `${relative(REPO_ROOT, file)}:${line} casts an {error} branch to ${cast.getText()}`,
                        );
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return found;
}

function returnsErrorObject(callback: ts.Node): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (
            ts.isReturnStatement(node) &&
            node.expression &&
            ts.isObjectLiteralExpression(node.expression) &&
            node.expression.properties.some(
                (p) =>
                    p.name &&
                    ts.isIdentifier(p.name) &&
                    p.name.text === 'error',
            )
        )
            found = true;
        ts.forEachChild(node, visit);
    };
    visit(callback);
    return found;
}

/** The `T` of `(await browser.executeObsidian(...)) as T`, if present. */
function enclosingCast(call: ts.CallExpression): ts.TypeNode | undefined {
    let node: ts.Node = call;
    while (
        node.parent &&
        (ts.isAwaitExpression(node.parent) ||
            ts.isParenthesizedExpression(node.parent))
    )
        node = node.parent;
    return node.parent && ts.isAsExpression(node.parent)
        ? node.parent.type
        : undefined;
}

describe('spec plugin handles describe the real plugin', () => {
    it('finds the plugin class and the spec declarations it must match', () => {
        // Guards the parser itself: a rename that silently returned nothing
        // would make every assertion below vacuous.
        expect(pluginMembers().size).toBeGreaterThan(100);
        expect(declaredPluginMembers().length).toBeGreaterThan(50);
    });

    it('declares no plugin member that src/main.ts does not have', () => {
        const real = pluginMembers();
        const invented = declaredPluginMembers().filter(
            (d) =>
                !real.has(d.member) && !OBSIDIAN_PLUGIN_MEMBERS.has(d.member),
        );
        expect(
            invented.map((d) => `${d.file}:${d.line} declares '${d.member}'`),
        ).toEqual([]);
    });
});

describe('executeObsidian failure branches survive their cast', () => {
    it('casts no {error} return path to a primitive', () => {
        expect(errorBranchesCastAway()).toEqual([]);
    });
});
