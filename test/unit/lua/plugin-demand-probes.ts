import type { DemandProbe } from './plugin-demand-harness';

/** Each probe CALLS the live member (or exercises variable/option storage).
 * Nontrivial inputs distinguish the known inert answers from useful ones.
 * This contains no expected category list: the artifact freezes observations.
 */
export const demandProbes: Record<string, DemandProbe> = {
    'vim.api.nvim_buf_clear_namespace': {
        code: "local ns=vim.api.nvim_create_namespace('audit'); vim.api.nvim_buf_set_extmark(0,ns,0,1,{}); vim.api.nvim_buf_clear_namespace(0,ns,0,-1); return #vim.api.nvim_buf_get_extmarks(0,ns,0,-1,{})",
    },
    'vim.api.nvim_buf_del_extmark': {
        code: "local ns=vim.api.nvim_create_namespace('audit'); local id=vim.api.nvim_buf_set_extmark(0,ns,0,1,{}); return vim.api.nvim_buf_del_extmark(0,ns,id)",
    },
    'vim.api.nvim_buf_get_extmark_by_id': {
        code: "local ns=vim.api.nvim_create_namespace('audit'); local id=vim.api.nvim_buf_set_extmark(0,ns,0,13,{}); return vim.json.encode(vim.api.nvim_buf_get_extmark_by_id(0,ns,id,{}))",
        silentResults: ['[]'],
    },
    'vim.api.nvim_buf_get_lines': {
        code: 'return vim.json.encode(vim.api.nvim_buf_get_lines(0,0,1,true))',
        silentResults: ['[]'],
    },
    'vim.api.nvim_buf_get_mark': {
        code: "return vim.json.encode(vim.api.nvim_buf_get_mark(0,'a'))",
        silentResults: ['[]', '[0,0]'],
    },
    'vim.api.nvim_buf_get_text': {
        code: 'return vim.json.encode(vim.api.nvim_buf_get_text(0,0,5,0,9,{}))',
        silentResults: ['[]'],
    },
    'vim.api.nvim_buf_line_count': {
        code: 'return vim.api.nvim_buf_line_count(0)',
        silentResults: ['0'],
    },
    'vim.api.nvim_buf_set_extmark': {
        code: "local ns=vim.api.nvim_create_namespace('audit'); local id=vim.api.nvim_buf_set_extmark(0,ns,0,13,{}); return vim.json.encode(vim.api.nvim_buf_get_extmark_by_id(0,ns,id,{}))",
        silentResults: ['[]'],
    },
    'vim.api.nvim_buf_set_text': {
        code: "vim.api.nvim_buf_set_text(0,0,5,0,9,{'é'}); return vim.api.nvim_buf_get_lines(0,0,1,true)[1]",
    },
    'vim.api.nvim_create_augroup': {
        code: "return vim.api.nvim_create_augroup('DemandAudit',{})",
        silentResults: ['0'],
    },
    'vim.api.nvim_create_autocmd': {
        code: "return vim.api.nvim_create_autocmd('ColorScheme',{callback=function() end})",
        silentResults: ['0'],
    },
    'vim.api.nvim_create_namespace': {
        code: "return vim.api.nvim_create_namespace('one') ~= vim.api.nvim_create_namespace('two')",
        silentResults: ['false'],
    },
    'vim.api.nvim_echo': {
        code: "return vim.api.nvim_echo({{'audit message'}},false,{})",
        effect: 'notices',
    },
    'vim.api.nvim_get_current_buf': {
        code: 'return vim.api.nvim_get_current_buf()',
    },
    'vim.api.nvim_get_keymap': {
        code: "vim.keymap.set('n','zx','zz'); for _,m in ipairs(vim.api.nvim_get_keymap('n')) do if m.lhs=='zx' then return m.rhs end end; return ''",
        silentResults: [''],
    },
    'vim.api.nvim_set_hl': {
        code: "vim.api.nvim_set_hl(0,'DemandAudit',{bold=true}); return vim.api.nvim_get_hl(0,{name='DemandAudit'}).bold",
        silentResults: ['nil'],
    },
    'vim.api.nvim_win_get_cursor': {
        code: 'return vim.json.encode(vim.api.nvim_win_get_cursor(0))',
        silentResults: ['[]', '[0,0]'],
    },
    'vim.api.nvim_win_set_cursor': {
        code: 'vim.api.nvim_win_set_cursor(0,{1,9}); return vim.json.encode(vim.api.nvim_win_get_cursor(0))',
        silentResults: ['[3,13]'],
    },
    'vim.bo.commentstring': { code: 'return vim.bo.commentstring' },
    'vim.bo.expandtab': { code: 'return vim.bo.expandtab' },
    'vim.bo.filetype': { code: 'return vim.bo.filetype' },
    'vim.cmd': {
        code: "vim.cmd('echohl Question'); return 'dispatched'",
        effect: 'commands',
    },
    'vim.deepcopy': {
        code: 'local t={x={1}}; local c=vim.deepcopy(t); c.x[1]=2; return t.x[1]',
        silentResults: ['2', 'nil'],
    },
    'vim.defer_fn': {
        code: 'local timer=vim.defer_fn(function() end,1000); local active=timer:is_closing(); timer:close(); return active',
    },
    'vim.fn.append': {
        code: "vim.fn.append(1,'inserted'); return vim.fn.getline(2)",
    },
    'vim.fn.col': { code: "return vim.fn.col({1,'$'})", silentResults: ['0'] },
    'vim.fn.deletebufline': {
        code: 'local result=vim.fn.deletebufline(0,2); return result .. ":" .. vim.api.nvim_buf_line_count(0)',
    },
    'vim.fn.getcharstr': { code: 'return vim.fn.getcharstr()' },
    'vim.fn.getline': { code: 'return vim.fn.getline(1)', silentResults: [''] },
    'vim.fn.getpos': {
        code: 'return vim.json.encode(vim.fn.getpos("\'<"))',
        silentResults: ['[]', '[0,0,0,0]'],
    },
    'vim.fn.has': {
        code: "return vim.fn.has('nvim-0.11') .. ':' .. vim.fn.has('obsidian')",
    },
    'vim.fn.input': {
        code: "return vim.fn.input({prompt='audit: ',default='value'})",
    },
    'vim.fn.nextnonblank': {
        code: 'return vim.fn.nextnonblank(2)',
        silentResults: ['0'],
    },
    'vim.fn.shiftwidth': {
        code: 'return vim.fn.shiftwidth()',
        silentResults: ['0'],
    },
    'vim.fn.strcharpart': {
        code: "return vim.fn.strcharpart('é→𝄞界\tZ',2,1)",
        silentResults: [''],
    },
    'vim.fn.strdisplaywidth': {
        code: "return vim.fn.strdisplaywidth('é→𝄞界\tZ')",
        silentResults: ['0'],
    },
    'vim.fn.visualmode': {
        code: 'return vim.fn.visualmode()',
        silentResults: [''],
    },
    'vim.highlight.range': {
        code: "return vim.highlight.range(0,1,'Audit',{0,0},{0,1})",
    },
    'vim.hl.range': { code: "return vim.hl.range(0,1,'Audit',{0,0},{0,1})" },
    'vim.inspect': {
        code: 'return vim.inspect({x=1})',
        silentResults: ['', 'nil'],
    },
    'vim.is_callable': {
        code: 'return tostring(vim.is_callable(function() end)) .. ":" .. tostring(vim.is_callable(2))',
        silentResults: ['false:false', 'true:true'],
    },
    'vim.islist': {
        code: 'return tostring(vim.islist({1,2})) .. ":" .. tostring(vim.islist({x=1}))',
        silentResults: ['false:false', 'true:true'],
    },
    'vim.iter': {
        code: 'return vim.json.encode(vim.iter({{1},{2}}):flatten(math.huge):totable())',
        silentResults: ['[]'],
    },
    'vim.keymap.set': {
        code: "vim.keymap.set('n','zx','zz'); for _,m in ipairs(vim.api.nvim_get_keymap('n')) do if m.lhs=='zx' then return m.rhs end end; return ''",
        silentResults: [''],
    },
    'vim.list_extend': {
        code: 'return vim.json.encode(vim.list_extend({1},{2}))',
        silentResults: ['[]', '[1]'],
    },
    'vim.o.cmdheight': { code: 'return vim.o.cmdheight' },
    'vim.o.columns': { code: 'return vim.o.columns' },
    'vim.o.operatorfunc': {
        code: "vim.o.operatorfunc='v:lua.MiniSurround.add'; return vim.o.operatorfunc",
    },
    'vim.o.selection': { code: 'return vim.o.selection' },
    'vim.on_key': {
        code: 'local ns=vim.on_key(function() end); vim.on_key(nil,ns); return ns',
        silentResults: ['nil', '0'],
    },
    'vim.opt_local.comments': {
        code: 'return vim.json.encode(vim.opt_local.comments:get())',
    },
    'vim.pesc': { code: "return vim.pesc('(x)')", silentResults: ['(x)', ''] },
    'vim.split': {
        code: "return vim.json.encode(vim.split('a:b',':'))",
        silentResults: ['[]'],
    },
    'vim.str_byteindex': {
        code: "return packed(vim.str_byteindex(S,5)) .. ';' .. packed(vim.str_byteindex(S,'utf-16',5)) .. ';' .. packed(vim.str_byteindex(S,'utf-32',5))",
        silentResults: ['0;0;0'],
    },
    'vim.str_utfindex': {
        code: "return packed(vim.str_utfindex(S)) .. ';' .. packed(vim.str_utfindex(S,13)) .. ';' .. packed(vim.str_utfindex(S,'utf-16',13)) .. ';' .. packed(vim.str_utfindex(S,'utf-32',13))",
        silentResults: ['0;0;0;0'],
    },
    'vim.tbl_contains': {
        code: 'return tostring(vim.tbl_contains({1,2},2)) .. ":" .. tostring(vim.tbl_contains({1,2},3))',
        silentResults: ['false:false', 'true:true'],
    },
    'vim.tbl_deep_extend': {
        code: "return vim.json.encode(vim.tbl_deep_extend('force',{a={x=1}},{a={y=2}}).a)",
    },
    'vim.tbl_extend': {
        code: "return vim.json.encode(vim.tbl_extend('force',{a=1},{b=2}))",
    },
    'vim.tbl_filter': {
        code: 'return vim.json.encode(vim.tbl_filter(function(x) return x>1 end,{1,2}))',
        silentResults: ['[]', '[1,2]'],
    },
    'vim.tbl_isempty': {
        code: 'return tostring(vim.tbl_isempty({})) .. ":" .. tostring(vim.tbl_isempty({1}))',
        silentResults: ['false:false', 'true:true'],
    },
    'vim.tbl_keys': {
        code: 'local keys=vim.tbl_keys({a=1,b=2}); table.sort(keys); return table.concat(keys,",")',
        silentResults: [''],
    },
    'vim.tbl_map': {
        code: 'return vim.json.encode(vim.tbl_map(function(x) return x+1 end,{1,2}))',
        silentResults: ['[]', '[1,2]'],
    },
    'vim.treesitter.get_parser': {
        code: 'return type(vim.treesitter.get_parser(0,nil,{error=false}))',
        silentResults: ['nil'],
    },
    'vim.treesitter.get_range': {
        code: "local tree=vim.treesitter.get_string_parser('x','markdown'); return packed(vim.treesitter.get_range(tree:root(),0,{}))",
        silentResults: ['', '0'],
    },
    'vim.treesitter.language.get_lang': {
        code: "return vim.treesitter.language.get_lang('markdown')",
        silentResults: ['nil', ''],
    },
    'vim.treesitter.query.get': {
        code: "return type(vim.treesitter.query.get('markdown','textobjects'))",
        silentResults: ['nil'],
    },
    'vim.trim': {
        code: "return vim.trim('  x  ')",
        silentResults: ['  x  ', ''],
    },
    'vim.v.count1': { code: 'return vim.v.count1' },
    'vim.v.echospace': { code: 'return vim.v.echospace' },
};

for (const plugin of ['minisurround', 'minisplitjoin']) {
    for (const name of [
        `vim.g.${plugin}_disable`,
        `vim.b.${plugin}_disable`,
        `vim.b.${plugin}_config`,
    ]) {
        demandProbes[name] = {
            prepare: `${name} = 17`,
            code: `return ${name}`,
            silentResults: ['nil', '0'],
        };
    }
}
