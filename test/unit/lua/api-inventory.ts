import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { vi } from 'vitest';
import type { lua_State } from '../../../src/lib/fengari';
import { runLuaString } from './coordinate-harness';

function sourceFile(name: string, source: string) {
    return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
}

function visit(node: ts.Node, fn: (node: ts.Node) => void): void {
    fn(node);
    ts.forEachChild(node, (child) => visit(child, fn));
}

function unwrap(node: ts.Expression): ts.Expression {
    return ts.isAsExpression(node) || ts.isParenthesizedExpression(node)
        ? unwrap(node.expression)
        : node;
}

function stringArray(expression: ts.Expression | undefined): string[] {
    if (!expression) throw new Error('Missing registry array');
    const node = unwrap(expression);
    if (!ts.isArrayLiteralExpression(node))
        throw new Error('Unrecognized registry array syntax');
    return node.elements.map((item) => {
        if (!ts.isStringLiteral(item))
            throw new Error('Unresolved registry member');
        return item.text;
    });
}

function setMembers(expression: ts.Expression | undefined): string[] {
    if (
        !expression ||
        !ts.isNewExpression(expression) ||
        expression.expression.getText() !== 'Set'
    ) {
        throw new Error('Unrecognized registry Set syntax');
    }
    return stringArray(expression.arguments?.[0]);
}

function enclosingLoop(node: ts.Node): ts.ForOfStatement {
    for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isForOfStatement(parent)) return parent;
    }
    throw new Error('Unresolved dynamic registration outside a for-of loop');
}

/** Source membership cross-check only. Categories come from sandbox probes. */
export function collectApiInventory(
    source = readFileSync('src/lua/api.ts', 'utf8'),
) {
    const file = sourceFile('api.ts', source);
    const sets = new Map<string, Set<string>>();
    const registered = new Set<string>();
    const returnTypes = new Map<string, Set<string>>();
    visit(file, (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            if (
                [
                    'SUPPORTED_NVIM_API_FUNCTIONS',
                    'KNOWN_NVIM_API_FUNCTIONS',
                ].includes(node.name.text)
            ) {
                sets.set(node.name.text, new Set(setMembers(node.initializer)));
            }
            if (node.name.text === 'NVIM_API_RETURN_TYPES') {
                if (
                    !node.initializer ||
                    !ts.isObjectLiteralExpression(node.initializer)
                )
                    throw new Error('Unrecognized API return types');
                for (const prop of node.initializer.properties) {
                    if (!ts.isPropertyAssignment(prop))
                        throw new Error('Unrecognized API return type');
                    returnTypes.set(
                        prop.name.getText(file),
                        new Set(setMembers(prop.initializer)),
                    );
                }
            }
        }
        if (
            !ts.isCallExpression(node) ||
            node.expression.getText(file) !== 'lua.lua_setfield' ||
            node.arguments[1]?.getText(file) !== 'apiIndex'
        )
            return;
        const field = node.arguments[2];
        if (
            !field ||
            !ts.isCallExpression(field) ||
            field.expression.getText(file) !== 'to_luastring'
        )
            throw new Error('Unrecognized API registration');
        const arg = field.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
            registered.add(arg.text);
            return;
        }
        if (arg?.getText(file) !== 'name')
            throw new Error('Unresolved computed API registration');
        const loop = enclosingLoop(node);
        const tuples = unwrap(loop.expression);
        if (!ts.isArrayLiteralExpression(tuples))
            throw new Error('Unresolved API tuple registrations');
        for (const tuple of tuples.elements) {
            if (ts.isStringLiteral(tuple)) {
                registered.add(tuple.text);
                continue;
            }
            if (
                !ts.isArrayLiteralExpression(tuple) ||
                !tuple.elements[0] ||
                !ts.isStringLiteral(tuple.elements[0])
            )
                throw new Error('Unresolved API callback tuple');
            registered.add(tuple.elements[0].text);
        }
    });
    const supported = sets.get('SUPPORTED_NVIM_API_FUNCTIONS');
    const known = sets.get('KNOWN_NVIM_API_FUNCTIONS');
    if (!supported || !known || !returnTypes.size)
        throw new Error('API inventory definitions missing');
    return { supported, known, registered, returnTypes };
}

export function collectFnInventory(
    source = readFileSync('src/lua/fn.ts', 'utf8'),
) {
    const file = sourceFile('fn.ts', source);
    const sets = new Map<string, string[]>();
    const real = new Set<string>();
    const declared = new Set<string>();
    const conditional = new Map<string, string[]>();
    visit(file, (node) => {
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text.endsWith('ReturnFns')
        ) {
            sets.set(node.name.text, setMembers(node.initializer));
        }
        if (!ts.isCallExpression(node)) return;
        const callee = node.expression.getText(file);
        if (callee !== 'registry.set' && callee !== 'registerStub') return;
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
            (callee === 'registry.set' ? real : declared).add(arg.text);
            const conditions: string[] = [];
            for (let parent = node.parent; parent; parent = parent.parent) {
                if (ts.isIfStatement(parent))
                    conditions.push(parent.expression.getText(file));
            }
            if (conditions.length) conditional.set(arg.text, conditions);
        } else if (callee === 'registerStub') {
            const members = sets.get(
                enclosingLoop(node).expression.getText(file),
            );
            if (!members)
                throw new Error('Unresolved dynamic fn stub registration');
            for (const name of members) declared.add(name);
        } else if (node.getText(file) !== 'registry.set(name, handler)') {
            throw new Error('Unresolved dynamic fn real registration');
        }
    });
    return {
        real,
        declared,
        effective: new Set([...declared].filter((name) => !real.has(name))),
        conditional,
    };
}

/** Forwarding spies observe, but do not replace, the private dispatch data.
 * The invalid lookup consults the actual supported/known sets and fn registry.
 */
export function collectLiveRegistries(L: lua_State) {
    const probe = '__demand_inventory_probe__';
    const sets: Set<unknown>[] = [];
    const registries: Map<unknown, unknown>[] = [];
    const has = Set.prototype.has;
    const get = Map.prototype.get;
    const setSpy = vi.spyOn(Set.prototype, 'has').mockImplementation(function (
        this: Set<unknown>,
        value: unknown,
    ) {
        if (value === probe) sets.push(this);
        return has.call(this, value);
    });
    const mapSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
        this: Map<unknown, unknown>,
        key: unknown,
    ): unknown {
        if (key === probe) registries.push(this);
        return get.call(this, key);
    });
    try {
        runLuaString(
            L,
            `pcall(function() return vim.api.${probe} end); pcall(function() return vim.fn.${probe} end); return ''`,
        );
    } finally {
        setSpy.mockRestore();
        mapSpy.mockRestore();
    }
    const registry = registries[0];
    if (sets.length !== 2 || registries.length !== 1 || !registry)
        throw new Error(
            'Live dispatch shape changed; update inventory observation',
        );
    const names = (values: Iterable<unknown>) =>
        [...values]
            .map((value) => {
                if (typeof value !== 'string')
                    throw new Error('Registry key must be a string');
                return value;
            })
            .sort();
    const registered = runLuaString(
        L,
        "local names={}; for name in pairs(vim.api) do names[#names+1]=name end; table.sort(names); return table.concat(names,',')",
    ).split(',');
    return {
        supported: names(sets[0]!),
        known: names(sets[1]!),
        registered,
        fn: names(registry.keys()),
    };
}

/** Structural backstop across ALL Lua bindings, not a category oracle. Simple
 * constant-return/identity Lua shims and inert JS closures must be reviewed as
 * either observed silent placeholders or explicit legitimate host constants.
 */
export function collectSilentCandidates(root = 'src/lua'): string[] {
    const files = (path: string): string[] =>
        readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
            const child = `${path}/${entry.name}`;
            return entry.isDirectory()
                ? files(child)
                : child.endsWith('.ts')
                  ? [child]
                  : [];
        });
    const candidates = new Set<string>();
    for (const path of files(root)) {
        const source = readFileSync(path, 'utf8');
        // Embedded Lua implementations are real source too. Only whole
        // one-return bodies match; conditional real handlers do not.
        for (const match of source.matchAll(
            /function\s+(vim\.[\w.]+)\([^)]*\)\s*return\s+(0|\{\}|''|[a-zA-Z_]\w*|'file:\/\/'\s*\.\.\s*path)\s*end/g,
        ))
            candidates.add(`${path}#${match[1]}`);
        for (const match of source.matchAll(
            /function\s+(vim\.[\w.]+)\([^)]*\)\s*end/g,
        ))
            candidates.add(`${path}#${match[1]}`);
        for (const match of source.matchAll(
            /function\s+(vim\.[\w.]+)\([^)]*\)\s*if cond and cond\(\) then return true, -1 end\s*return false, -1\s*end/g,
        ))
            candidates.add(`${path}#${match[1]}`);
        const file = sourceFile(path, source);
        const inert = (fn: ts.Node): boolean => {
            if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))
                return false;
            if (!ts.isBlock(fn.body))
                return ts.isNumericLiteral(fn.body) && fn.body.text === '0';
            return (
                fn.body.statements.length > 0 &&
                fn.body.statements.every((statement) => {
                    if (ts.isReturnStatement(statement))
                        return (
                            !!statement.expression &&
                            ts.isNumericLiteral(statement.expression)
                        );
                    if (!ts.isExpressionStatement(statement)) return false;
                    const expression = statement.expression;
                    if (ts.isVoidExpression(expression))
                        return ts.isIdentifier(expression.expression);
                    if (
                        !ts.isCallExpression(expression) ||
                        ![
                            'lua.lua_newtable',
                            'lua.lua_pushnil',
                            'lua.lua_pushinteger',
                            'lua.lua_pushnumber',
                            'lua.lua_pushstring',
                            'lua.lua_pushboolean',
                        ].includes(expression.expression.getText(file))
                    )
                        return false;
                    return expression.arguments
                        .slice(1)
                        .every(
                            (arg) =>
                                ts.isNumericLiteral(arg) ||
                                [
                                    ts.SyntaxKind.TrueKeyword,
                                    ts.SyntaxKind.FalseKeyword,
                                ].includes(arg.kind) ||
                                (ts.isCallExpression(arg) &&
                                    arg.expression.getText(file) ===
                                        'to_luastring' &&
                                    !!arg.arguments[0] &&
                                    ts.isStringLiteral(arg.arguments[0])),
                        );
                })
            );
        };
        visit(file, (node) => {
            if (
                ts.isVariableDeclaration(node) &&
                node.type?.getText(file) === 'DirectiveHandler' &&
                node.initializer &&
                inert(node.initializer)
            )
                candidates.add(`${path}#DirectiveHandler`);
            if (
                ts.isCallExpression(node) &&
                node.expression.getText(file) === 'registry.set' &&
                node.arguments[0] &&
                ts.isStringLiteral(node.arguments[0]) &&
                node.arguments[1] &&
                inert(node.arguments[1])
            )
                candidates.add(`${path}#vim.fn.${node.arguments[0].text}`);
            if (
                !ts.isExpressionStatement(node) ||
                !ts.isCallExpression(node.expression) ||
                node.expression.expression.getText(file) !==
                    'lua.lua_pushjsfunction' ||
                !node.expression.arguments[1] ||
                !inert(node.expression.arguments[1])
            )
                return;
            if (!ts.isBlock(node.parent) && !ts.isSourceFile(node.parent))
                return;
            const next =
                node.parent.statements[
                    node.parent.statements.indexOf(node) + 1
                ];
            if (
                !next ||
                !ts.isExpressionStatement(next) ||
                !ts.isCallExpression(next.expression) ||
                next.expression.expression.getText(file) !== 'lua.lua_setfield'
            )
                return;
            const name = next.expression.arguments[2];
            if (
                !name ||
                !ts.isCallExpression(name) ||
                !name.arguments[0] ||
                !ts.isStringLiteral(name.arguments[0])
            )
                return;
            candidates.add(`${path}#${name.arguments[0].text}`);
        });
    }
    return [...candidates].sort();
}
