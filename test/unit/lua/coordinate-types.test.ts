import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import path from 'node:path';

function compileAdapterUsage(statement: string): number[] {
    const file = path.resolve('test/unit/lua/coordinate-type-probe.ts');
    const code = `
        import { byteToUtf16, type ByteCol, type Utf16Col } from '../../../src/lua/coordinates';
        import { COORD_LINE } from '../../fixtures/neovim-coordinate-contract';
        import { lua, type lua_State } from '../../../src/lib/fengari';
        declare const L: lua_State;
        declare const hostCol: Utf16Col;
        declare const byteCol: ByteCol;
        ${statement};
    `;
    const options: ts.CompilerOptions = {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2021,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: ['node', 'obsidian', '@obsidian-typings/obsidian-public-latest'],
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
        name === file
            ? ts.createSourceFile(name, code, languageVersion, true)
            : getSourceFile(name, languageVersion, onError, shouldCreate);
    return ts
        .getPreEmitDiagnostics(ts.createProgram([file], options, host))
        .map((diagnostic) => diagnostic.code);
}

describe('coordinate adapter directionality', () => {
    it.each([
        ['wrong direction', 'byteToUtf16(COORD_LINE, hostCol)', [2345]],
        ['valid direction', 'byteToUtf16(COORD_LINE, byteCol)', []],
        [
            'Lua accepts the wrong unit as a number',
            'lua.lua_pushnumber(L, hostCol)',
            [],
        ],
    ] as const)('%s', (_name, code, expected) => {
        expect(compileAdapterUsage(code)).toEqual(expected);
    });
});
