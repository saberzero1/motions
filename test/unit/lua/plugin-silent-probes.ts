import type { DemandProbe } from './plugin-demand-harness';
import { demandProbes } from './plugin-demand-probes';

export const silentProbes: Record<
    string,
    { source: string; owner: string; probe: DemandProbe }
> = {
    'vim.paste': {
        source: 'src/lua/stdlib.ts:810-814',
        owner: 'Deferred paste dispatch',
        probe: {
            code: "local accepted=vim.paste({'inserted'},-1); return tostring(accepted) .. ':' .. vim.fn.getline(1)",
            silentResults: ['true:é→𝄞界\tZ'],
        },
    },
    'vim.deprecate': {
        source: 'src/lua/stdlib.ts:816-819',
        owner: 'Deferred deprecation notices',
        probe: {
            code: "return packed(vim.deprecate('old','new','1.0','audit',false))",
            silentResults: [''],
        },
    },
    'vim.diff': {
        source: 'src/lua/stdlib.ts:821-825',
        owner: 'Deferred diff API',
        probe: { code: "return vim.diff('old','new')", silentResults: [''] },
    },
    'vim.wait': {
        source: 'src/lua/stdlib.ts:827-832',
        owner: 'Deferred condition polling',
        probe: {
            code: "local calls=0; local ok=vim.wait(10,function() calls=calls+1; return calls>=2 end,1); return tostring(ok) .. ':' .. calls",
            silentResults: ['false:1'],
        },
    },
    'vim.str_byteindex': {
        source: 'src/lua/stdlib.ts:1055-1059',
        owner: 'Phase 5b',
        probe: demandProbes['vim.str_byteindex']!,
    },
    'vim.str_utfindex': {
        source: 'src/lua/stdlib.ts:1060-1064',
        owner: 'Phase 5b',
        probe: demandProbes['vim.str_utfindex']!,
    },
    'vim.str_utf_start': {
        source: 'src/lua/stdlib.ts:1065-1069',
        owner: 'Phase 5b',
        probe: { code: 'return vim.str_utf_start(S,7)', silentResults: ['0'] },
    },
    'vim.str_utf_end': {
        source: 'src/lua/stdlib.ts:1070-1074',
        owner: 'Phase 5b',
        probe: { code: 'return vim.str_utf_end(S,7)', silentResults: ['0'] },
    },
    'vim.str_utf_pos': {
        source: 'src/lua/stdlib.ts:1075-1079',
        owner: 'Phase 5b',
        probe: {
            code: 'return vim.json.encode(vim.str_utf_pos(S))',
            silentResults: ['[]'],
        },
    },
    'vim.iconv': {
        source: 'src/lua/stdlib.ts:1080-1084',
        owner: 'Deferred encoding API',
        probe: {
            code: "return vim.iconv('é','utf-8','latin1')",
            silentResults: ['é'],
        },
    },
    'vim.uri_decode': {
        source: 'src/lua/stdlib.ts:1086-1090',
        owner: 'Deferred URI APIs',
        probe: {
            code: "return vim.uri_decode('a%20b')",
            silentResults: ['a%20b'],
        },
    },
    'vim.uri_encode': {
        source: 'src/lua/stdlib.ts:1091-1095',
        owner: 'Deferred URI APIs',
        probe: { code: "return vim.uri_encode('a b')", silentResults: ['a b'] },
    },
    'vim.uri_from_bufnr': {
        source: 'src/lua/stdlib.ts:1096-1100',
        owner: 'Deferred URI APIs',
        probe: { code: 'return vim.uri_from_bufnr(0)', silentResults: [''] },
    },
    'vim.uri_from_fname': {
        source: 'src/lua/stdlib.ts:1101-1105',
        owner: 'Deferred URI APIs',
        probe: {
            code: "return vim.uri_from_fname('/a b')",
            silentResults: ['file:///a b'],
        },
    },
    'vim.uri_to_bufnr': {
        source: 'src/lua/stdlib.ts:1106-1110',
        owner: 'Deferred URI APIs',
        probe: {
            code: "return vim.uri_to_bufnr('file:///missing')",
            silentResults: ['0'],
        },
    },
    'vim.uri_to_fname': {
        source: 'src/lua/stdlib.ts:1111-1114',
        owner: 'Deferred URI APIs',
        probe: {
            code: "return vim.uri_to_fname('file:///a%20b')",
            silentResults: ['file:///a%20b'],
        },
    },
    'vim.treesitter.get_captures_at_pos': {
        source: 'src/lua/treesitter/api.ts:363-367',
        owner: 'Deferred treesitter highlighting',
        probe: {
            code: 'return vim.json.encode(vim.treesitter.get_captures_at_pos(0,0,0))',
            silentResults: ['[]'],
        },
    },
    'vim.treesitter.get_captures_at_cursor': {
        source: 'src/lua/treesitter/api.ts:369-373',
        owner: 'Deferred treesitter highlighting',
        probe: {
            code: 'return vim.json.encode(vim.treesitter.get_captures_at_cursor(0))',
            silentResults: ['[]'],
        },
    },
    'vim.treesitter.start': {
        source: 'src/lua/treesitter/api.ts:375-379',
        owner: 'Deferred treesitter highlighting',
        probe: {
            code: "return packed(vim.treesitter.start(0,'markdown'))",
            silentResults: ['nil'],
        },
    },
    'vim.treesitter.stop': {
        source: 'src/lua/treesitter/api.ts:381-384',
        owner: 'Deferred treesitter highlighting',
        probe: {
            code: 'return packed(vim.treesitter.stop(0))',
            silentResults: [''],
        },
    },
    'vim.treesitter.foldexpr': {
        source: 'src/lua/treesitter/api.ts:386-390',
        owner: 'Deferred treesitter folds',
        probe: {
            code: 'return vim.treesitter.foldexpr(1)',
            silentResults: ['0'],
        },
    },
    'vim.treesitter.select': {
        source: 'src/lua/treesitter/api.ts:392-395',
        owner: 'Deferred treesitter UI',
        probe: {
            code: 'return packed(vim.treesitter.select())',
            silentResults: [''],
        },
    },
    'vim.treesitter.inspect_tree': {
        source: 'src/lua/treesitter/api.ts:397-400',
        owner: 'Deferred treesitter UI',
        probe: {
            code: 'return packed(vim.treesitter.inspect_tree())',
            silentResults: [''],
        },
    },
    'vim.treesitter.query.add_directive': {
        source: 'src/lua/treesitter/query-api.ts:372-395',
        owner: 'Deferred Lua directive callbacks',
        probe: {
            code: "local called=0; vim.treesitter.query.add_directive('demand-audit!',function() called=called+1 end); local tree=vim.treesitter.get_string_parser('x','markdown'); local q=vim.treesitter.query.parse('markdown','((paragraph) @audit (#demand-audit!))'); for _ in q:iter_captures(tree:root(),'x') do end; return called",
            silentResults: ['0'],
        },
    },
    'vim.treesitter.query.edit': {
        source: 'src/lua/treesitter/query-api.ts:397-398',
        owner: 'Deferred query UI',
        probe: {
            code: "return packed(vim.treesitter.query.edit('markdown','textobjects'))",
            silentResults: [''],
        },
    },
    'vim.treesitter.query.lint': {
        source: 'src/lua/treesitter/query-api.ts:400-404',
        owner: 'Deferred query diagnostics',
        probe: {
            code: "return vim.json.encode(vim.treesitter.query.lint(0,{lang='markdown'}))",
            silentResults: ['[]'],
        },
    },
    'vim.treesitter.query.omnifunc': {
        source: 'src/lua/treesitter/query-api.ts:406-410',
        owner: 'Deferred query completion',
        probe: {
            code: "return vim.treesitter.query.omnifunc(1,'')",
            silentResults: ['0'],
        },
    },
    'io.read': {
        source: 'src/lua/io-shim.ts:388-392',
        owner: 'Deferred stdin; not plugin demand',
        probe: { code: "return packed(io.read('*a'))", silentResults: ['nil'] },
    },
    'io.tmpfile': {
        source: 'src/lua/io-shim.ts:444-447',
        owner: 'Deferred I/O; not plugin demand',
        probe: { code: 'return packed(io.tmpfile())', silentResults: [''] },
    },
    'io.input': {
        source: 'src/lua/io-shim.ts:449-452',
        owner: 'Deferred I/O; not plugin demand',
        probe: { code: 'return packed(io.input())', silentResults: [''] },
    },
    'io.output': {
        source: 'src/lua/io-shim.ts:454-457',
        owner: 'Deferred I/O; not plugin demand',
        probe: { code: 'return packed(io.output())', silentResults: [''] },
    },
};
