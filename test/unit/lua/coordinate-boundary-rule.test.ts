import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { COORD_LINE } from '../../fixtures/neovim-coordinate-contract';

const rule = path.resolve('.ast-grep/rules/neovim-coordinate-boundary.yml');
const cli = path.resolve('node_modules/.bin/ast-grep');
const suppression = '// ast-grep-ignore: neovim-coordinate-boundary';

function scanCoordinateRule(
    files: Record<string, string>,
): Array<{ file: string; text: string; ruleId: string }> {
    const dir = mkdtempSync('/tmp/opencode/coordinate-rule-');
    try {
        mkdirSync(path.join(dir, 'src/lua'), { recursive: true });
        for (const [file, text] of Object.entries(files))
            writeFileSync(path.join(dir, 'src/lua', file), text);
        let output: string;
        try {
            output = execFileSync(
                cli,
                ['scan', '--rule', rule, '--json=compact', 'src/lua'],
                { cwd: dir, encoding: 'utf8' },
            );
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !('stdout' in error) ||
                typeof error.stdout !== 'string'
            )
                throw error;
            output = error.stdout;
        }
        return JSON.parse(output);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// Verbatim defective callback expressions and surrounding registration shapes.
const shipped = {
    'fn.ts': `const fixture = ${JSON.stringify(COORD_LINE)};
registry.set('col', (state) => {
    const expr = readString(state, 1);
    if (expr === '.') { lua.lua_pushnumber(state, callbacks.getCursorCol()); return 1; }
    lua.lua_pushnumber(state, 0); return 1;
});`,
    'api.ts': `lua.lua_pushjsfunction(L, (state: lua_State) => {
    requireWindowZero(state, 1, 'nvim_win_get_cursor');
    const pos = callbacks.getCursorPosition?.();
    lua.lua_pushnumber(state, pos.col - 1); return 1;
});
lua.lua_setfield(L, apiIndex, to_luastring('nvim_win_get_cursor'));
lua.lua_pushjsfunction(L, (state: lua_State) => {
    requireBufferZero(state, 1, 'nvim_buf_get_mark');
    const pos = callbacks.getMarkPos?.(name);
    lua.lua_pushnumber(state, pos.line + 1);
    lua.lua_pushnumber(state, pos.ch); return 1;
});
lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_mark'));`,
};

const hostExceptions = [
    'nvim_get_current_line',
    'nvim_del_current_line',
    'nvim_set_current_line',
    'get_cursor',
    'set_cursor',
];
const deferredExceptions = [
    'winsaveview',
    'winrestview',
    'wincol',
    'searchpos',
];

function suppressionInventory(source: string): string[] {
    const file = ts.createSourceFile(
        'source.ts',
        source,
        ts.ScriptTarget.ES2021,
        true,
    );
    const owners = new Map<number, string>();
    function visit(node: ts.Node) {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression)
        ) {
            const method = node.expression.name.text;
            let name: string | undefined;
            if (method === 'set' && ts.isStringLiteral(node.arguments[0]!))
                name = node.arguments[0].text;
            if (
                method === 'lua_pushjsfunction' &&
                ts.isExpressionStatement(node.parent) &&
                ts.isBlock(node.parent.parent)
            ) {
                const statements = node.parent.parent.statements;
                const next = statements[statements.indexOf(node.parent) + 1];
                if (
                    next &&
                    ts.isExpressionStatement(next) &&
                    ts.isCallExpression(next.expression)
                ) {
                    const arg = next.expression.arguments[2];
                    if (
                        arg &&
                        ts.isCallExpression(arg) &&
                        arg.arguments[0] &&
                        ts.isStringLiteral(arg.arguments[0])
                    )
                        name = arg.arguments[0].text;
                }
            }
            if (name) {
                const first = file.getLineAndCharacterOfPosition(
                    node.getStart(),
                ).line;
                const last = file.getLineAndCharacterOfPosition(node.end).line;
                for (let line = first; line <= last; line++)
                    owners.set(line, name);
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    return source
        .split('\n')
        .flatMap((line, index) =>
            line.includes(suppression) ? [owners.get(index) ?? 'unowned'] : [],
        );
}

describe('coordinate boundary shipped defects', () => {
    it('reports three shipped callback leaks by name', () => {
        expect(
            scanCoordinateRule(shipped)
                .map((finding) => finding.text)
                .sort(),
        ).toEqual(
            [
                'callbacks.getCursorCol',
                'callbacks.getCursorPosition',
                'callbacks.getMarkPos',
            ].sort(),
        );
    });
    it('restoring the old mark alone produces one diagnostic', () => {
        expect(
            scanCoordinateRule({
                'api.ts':
                    'const pos = callbacks.getMarkPos?.(name); lua.lua_pushnumber(state, pos.ch);',
            }).length,
        ).toBe(1);
    });
});

describe('coordinate boundary directional and host exceptions', () => {
    it.each([
        'callbacks.getCursorCol()',
        'callbacks?.getCursorPosition?.()',
        'callbacks["getMarkPos"](name)',
        'callbacks?.["setCursorPosition"]?.(1,2)',
        'const get = callbacks.getCursorCol',
    ])('matches %s', (code) => {
        expect(scanCoordinateRule({ 'fn.ts': code }).length).toBe(1);
    });
    it('adapter-backed handlers and host definitions have zero diagnostics', () => {
        expect(
            scanCoordinateRule({
                'coordinates.ts': 'const col = host.getCursorCol();',
                'loader.ts':
                    'const callbacks = { getCursorCol: () => editor.getCursor().ch + 1 };',
                'obsidian-api.ts': readFileSync(
                    'src/lua/obsidian-api.ts',
                    'utf8',
                ),
                'fn.ts':
                    "registry.set('col', state => pushCoordinateResult(state, coordinates.expressionByte(readCoordinateArgument(state,1))));",
            }).length,
        ).toBe(0);
    });
});

describe('coordinate boundary suppression inventory', () => {
    it('permits only enumerated actual handler identities', () => {
        const owners = ['api.ts', 'fn.ts', 'obsidian-api.ts'].flatMap((name) =>
            suppressionInventory(readFileSync(`src/lua/${name}`, 'utf8')),
        );
        expect(owners.sort()).toEqual(
            [
                'nvim_get_current_line',
                'nvim_del_current_line',
                'nvim_set_current_line',
                'get_cursor',
                'set_cursor',
                'winsaveview',
                'wincol',
                'searchpos',
            ].sort(),
        );
    });
    it('has zero unauthorized active-handler exceptions', () => {
        const owners = ['api.ts', 'fn.ts', 'obsidian-api.ts'].flatMap((name) =>
            suppressionInventory(readFileSync(`src/lua/${name}`, 'utf8')),
        );
        expect(
            owners.filter(
                (name) =>
                    !hostExceptions.includes(name) &&
                    !deferredExceptions.includes(name),
            ),
        ).toEqual([]);
    });
});
