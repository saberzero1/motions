local provider_ns = vim.api.nvim_create_namespace("vim_motions_rpc_provider")
local mirror_buf = ...
local visible = {}

local structural_mappings = {
    "]h", "[h",
    "]1", "[1", "]2", "[2", "]3", "[3",
    "]4", "[4", "]5", "[5", "]6", "[6",
    "]l", "[l", "]n", "[n",
}

local textobject_mappings = {
    "i*", "a*", "i_", "a_", "i`", "a`", "i$", "a$", "i~", "a~",
    "il", "al", "it", "at",
    "iC", "aC", "iB", "aB", "io", "ao",
    "i|", "a|", "ir", "ar",
}

local function teardown_structural_mappings(buf)
    for _, lhs in ipairs(structural_mappings) do
        for _, mode in ipairs({ "n", "x", "o" }) do
            pcall(vim.keymap.del, mode, lhs, { buffer = buf })
        end
    end
end

local function teardown_textobject_mappings(buf)
    for _, lhs in ipairs(textobject_mappings) do
        for _, mode in ipairs({ "x", "o" }) do
            pcall(vim.keymap.del, mode, lhs, { buffer = buf })
        end
    end
end

if vim_motions_rpc_companion_teardown then
    vim_motions_rpc_companion_teardown(mirror_buf)
end

function vim_motions_rpc_companion_teardown(buf)
    teardown_structural_mappings(buf)
    teardown_textobject_mappings(buf)
end

local heading_query = vim.treesitter.query.parse("markdown", "(atx_heading) @heading")
local list_query = vim.treesitter.query.parse("markdown", "(list_item) @item")
local link_query = vim.treesitter.query.parse(
    "markdown_inline",
    "[(shortcut_link) (inline_link)] @link"
)

local function markdown_root()
    local parser = vim.treesitter.get_parser(mirror_buf, "markdown")
    return parser:parse()[1]:root()
end

local function query_capture_target(query, capture_name, forward, accept, column)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local cursor_row = cursor[1] - 1
    local candidates = {}
    for id, node in query:iter_captures(markdown_root(), mirror_buf, 0, -1) do
        if query.captures[id] == capture_name then
            local row, col = node:start()
            if accept(node, row, col) then
                candidates[#candidates + 1] = { row = row, col = column(node, row, col) }
            end
        end
    end
    if not forward then
        local reversed = {}
        for index = #candidates, 1, -1 do
            reversed[#reversed + 1] = candidates[index]
        end
        candidates = reversed
    end
    local remaining = vim.v.count1
    for _, target in ipairs(candidates) do
        if (forward and target.row > cursor_row) or (not forward and target.row < cursor_row) then
            remaining = remaining - 1
            if remaining == 0 then
                return target
            end
        end
    end
end

local function heading_target(forward, level)
    return query_capture_target(
        heading_query,
        "heading",
        forward,
        function(node)
            if not level then
                return true
            end
            local marker = node:named_child(0)
            return marker and marker:type() == "atx_h" .. level .. "_marker"
        end,
        function()
            return 0
        end
    )
end

local function heading_motion(forward, level)
    local target = heading_target(forward, level)
    if target then
        vim.api.nvim_win_set_cursor(0, { target.row + 1, target.col })
        vim.rpcnotify(0, "vim_motions_cursor", mirror_buf, target.row + 1, target.col)
    end
end

local function heading_operator_motion(forward)
    local target = heading_target(forward)
    if not target then
        return vim.keycode("<Esc>")
    end
    local register = vim.v.register
    local register_prefix = register == '"' and "" or '"' .. register
    local operator = vim.v.operator == "c" and "d" or vim.v.operator
    local motion = forward
            and tostring(target.row) .. "G"
        or "v" .. tostring(target.row + 1) .. "G0"
    return vim.keycode("<Esc>")
        .. register_prefix
        .. operator
        .. motion
end

local function list_indent(line)
    local indent = line:match("^(%s*)[-*+] ")
    if indent then
        return #indent
    end
    indent = line:match("^(%s*)%d+[.)] ")
    return indent and #indent or nil
end

local function list_motion(forward)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local current = vim.api.nvim_buf_get_lines(mirror_buf, cursor[1] - 1, cursor[1], false)[1] or ""
    local indent = list_indent(current)
    if not indent then
        return
    end
    local target = query_capture_target(
        list_query,
        "item",
        forward,
        function(_, _, col)
            return col == indent
        end,
        function()
            return indent + 2
        end
    )
    if target then
        vim.api.nvim_win_set_cursor(0, { target.row + 1, target.col })
        vim.rpcnotify(0, "vim_motions_cursor", mirror_buf, target.row + 1, target.col)
    end
end

local function link_candidates()
    local candidates = {}
    local lines = vim.api.nvim_buf_get_lines(mirror_buf, 0, -1, false)
    for row, line in ipairs(lines) do
        local parser = vim.treesitter.get_string_parser(line, "markdown_inline")
        local root = parser:parse()[1]:root()
        for id, node in link_query:iter_captures(root, line, 0, -1) do
            if link_query.captures[id] == "link" then
                local _, start_col, _, end_col = node:range()
                if node:type() == "inline_link" then
                    candidates[#candidates + 1] = { row = row - 1, col = start_col }
                elseif line:sub(start_col, start_col) == "[" and line:sub(end_col + 1, end_col + 1) == "]" then
                    candidates[#candidates + 1] = { row = row - 1, col = start_col - 1 }
                end
            end
        end
    end
    return candidates
end

local function link_motion(forward)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local cursor_row = cursor[1] - 1
    local cursor_col = cursor[2]
    local candidates = link_candidates()
    if not forward then
        local reversed = {}
        for index = #candidates, 1, -1 do
            reversed[#reversed + 1] = candidates[index]
        end
        candidates = reversed
    end
    local remaining = vim.v.count1
    for _, target in ipairs(candidates) do
        local beyond = target.row > cursor_row or (target.row == cursor_row and target.col > cursor_col)
        local before = target.row < cursor_row or (target.row == cursor_row and target.col < cursor_col)
        if (forward and beyond) or (not forward and before) then
            remaining = remaining - 1
            if remaining == 0 then
                vim.api.nvim_win_set_cursor(0, { target.row + 1, target.col })
                vim.rpcnotify(0, "vim_motions_cursor", mirror_buf, target.row + 1, target.col)
                return
            end
        end
    end
end

local function map_motion(lhs, callback, modes, nowait)
    vim.keymap.set(modes or { "n", "x", "o" }, lhs, callback, {
        buffer = mirror_buf,
        desc = "vim-motions-rpc-structural:" .. lhs,
        nowait = nowait,
        silent = true,
    })
end

map_motion("]h", function()
    heading_motion(true)
end, { "n", "x" })
map_motion("[h", function()
    heading_motion(false)
end, { "n", "x" })
vim.keymap.set("o", "]h", function()
    return heading_operator_motion(true)
end, {
    buffer = mirror_buf,
    desc = "vim-motions-rpc-structural:]h",
    expr = true,
    nowait = true,
    silent = true,
})
vim.keymap.set("o", "[h", function()
    return heading_operator_motion(false)
end, {
    buffer = mirror_buf,
    desc = "vim-motions-rpc-structural:[h",
    expr = true,
    nowait = true,
    silent = true,
})
for level = 1, 6 do
    map_motion("]h" .. level, function()
        heading_motion(true, level)
    end, { "n", "x" })
    map_motion("[h" .. level, function()
        heading_motion(false, level)
    end, { "n", "x" })
    map_motion("]" .. level, function()
        heading_motion(true, level)
    end)
    map_motion("[" .. level, function()
        heading_motion(false, level)
    end)
end
map_motion("]l", function()
    list_motion(true)
end)
map_motion("[l", function()
    list_motion(false)
end)
map_motion("]n", function()
    link_motion(true)
end)
map_motion("[n", function()
    link_motion(false)
end)

local function position_before(row_a, col_a, row_b, col_b)
    return row_a < row_b or (row_a == row_b and col_a < col_b)
end

local function range_contains(range, row, col, inner)
    local start_row = range[1]
    local start_col = range[2]
    local end_row = range[3]
    local end_col = range[4]
    if inner then
        return not position_before(row, col, start_row, start_col)
            and position_before(row, col, end_row, end_col)
    end
    return not position_before(row, col, start_row, start_col)
        and position_before(row, col, end_row, end_col)
end

local function range_size(range)
    return (range[3] - range[1]) * 1000000 + range[4] - range[2]
end

local function node_range(node)
    local start_row, start_col, end_row, end_col = node:range()
    return { start_row, start_col, end_row, end_col }
end

local function walk_nodes(node, callback)
    callback(node)
    for child_index = 0, node:named_child_count() - 1 do
        local child = node:named_child(child_index)
        if child then
            walk_nodes(child, callback)
        end
    end
end

local function smallest_containing_node(root, types, row, col, accept)
    local best
    walk_nodes(root, function(node)
        if types[node:type()] then
            local range = node_range(node)
            if range_contains(range, row, col, false) and (not accept or accept(node, range)) then
                if not best or range_size(range) < range_size(best.range) then
                    best = { node = node, range = range }
                end
            end
        end
    end)
    return best
end

local function buffer_text()
    return table.concat(vim.api.nvim_buf_get_lines(mirror_buf, 0, -1, false), "\n")
end

local function inline_root()
    local parser = vim.treesitter.get_string_parser(buffer_text(), "markdown_inline")
    return parser:parse()[1]:root()
end

local function line_text(row)
    return vim.api.nvim_buf_get_lines(mirror_buf, row, row + 1, false)[1] or ""
end

local function exact_delimiter_range(types, delimiter, inner)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local row = cursor[1] - 1
    local col = cursor[2]
    local delimiter_length = #delimiter
    local candidate = smallest_containing_node(inline_root(), types, row, col, function(_, range)
        local opening = line_text(range[1]):sub(range[2] + 1, range[2] + delimiter_length)
        local closing = line_text(range[3]):sub(range[4] - delimiter_length + 1, range[4])
        if opening ~= delimiter or closing ~= delimiter then
            return false
        end
        local char = delimiter:sub(1, 1)
        local opening_line = line_text(range[1])
        local closing_line = line_text(range[3])
        if opening_line:sub(range[2], range[2]) == char
            or opening_line:sub(range[2] + delimiter_length + 1, range[2] + delimiter_length + 1) == char
            or closing_line:sub(range[4] - delimiter_length, range[4] - delimiter_length) == char
            or closing_line:sub(range[4] + 1, range[4] + 1) == char
        then
            return false
        end
        if not inner then
            return true
        end
        local inner_range = {
            range[1], range[2] + delimiter_length,
            range[3], range[4] - delimiter_length,
        }
        return position_before(inner_range[1], inner_range[2], inner_range[3], inner_range[4])
            and range_contains(inner_range, row, col, true)
    end)
    if not candidate then
        return nil
    end
    local range = candidate.range
    if inner then
        return { range[1], range[2] + delimiter_length, range[3], range[4] - delimiter_length }
    end
    return range
end

local function asterisk_range(inner)
    return exact_delimiter_range({ strong_emphasis = true }, "**", inner)
        or exact_delimiter_range({ emphasis = true }, "*", inner)
end

local function underscore_range(inner)
    return exact_delimiter_range({ strong_emphasis = true }, "__", inner)
        or exact_delimiter_range({ emphasis = true }, "_", inner)
end

local function code_span_range(inner)
    return exact_delimiter_range({ code_span = true }, "`", inner)
end

local function math_range(inner)
    return exact_delimiter_range({ latex_block = true }, "$$", inner)
        or exact_delimiter_range({ latex_block = true }, "$", inner)
end

local function strikethrough_range(inner)
    return exact_delimiter_range({ strikethrough = true }, "~~", inner)
end

local function link_range(inner)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local row = cursor[1] - 1
    local col = cursor[2]
    local candidate = smallest_containing_node(
        inline_root(),
        { inline_link = true, full_reference_link = true, collapsed_reference_link = true, shortcut_link = true },
        row,
        col
    )
    if not candidate then
        return nil
    end
    local outer = candidate.range
    local line = line_text(outer[1])
    if candidate.node:type() == "shortcut_link"
        and outer[1] == outer[3]
        and line:sub(outer[2], outer[2]) == "["
        and line:sub(outer[4] + 1, outer[4] + 1) == "]"
    then
        outer = { outer[1], outer[2] - 1, outer[3], outer[4] + 1 }
    end
    if not inner then
        return outer
    end
    local text
    walk_nodes(candidate.node, function(node)
        if not text and node:type() == "link_text" then
            text = node_range(node)
        end
    end)
    if text then return text end
    if line:sub(outer[2] + 1, outer[2] + 2) == "[[" then
        return { outer[1], outer[2] + 2, outer[3], outer[4] - 2 }
    end
end

local function native_tag_range(inner)
    local cursor = vim.api.nvim_win_get_cursor(0)
    vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
    vim.cmd("normal! v" .. (inner and "it" or "at"))
    vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
    local start = vim.fn.getpos("'<")
    local ending = vim.fn.getpos("'>")
    vim.api.nvim_win_set_cursor(0, cursor)
    if start[2] == 0 or ending[2] == 0 then
        return nil
    end
    local end_row = ending[2] - 1
    local end_col = ending[3] - 1
    local byte = line_text(end_row):byte(end_col + 1)
    local width = byte and (byte < 0x80 and 1 or byte < 0xE0 and 2 or byte < 0xF0 and 3 or 4) or 0
    return { start[2] - 1, start[3] - 1, end_row, end_col + width }
end

local function containing_markdown_node(types)
    local cursor = vim.api.nvim_win_get_cursor(0)
    return smallest_containing_node(markdown_root(), types, cursor[1] - 1, cursor[2])
end

local function code_fence_range(inner)
    local candidate = containing_markdown_node({ fenced_code_block = true })
    if not candidate then
        return nil
    end
    local range = candidate.range
    local close_row = range[4] == 0 and range[3] - 1 or range[3]
    if inner then
        local start_row = range[1] + 1
        local end_row = close_row - 1
        if start_row > end_row then
            return nil
        end
        return { start_row, 0, end_row, #line_text(end_row) }
    end
    return { range[1], 0, close_row, #line_text(close_row) }
end

local function quote_depth(line)
    local prefix = line:match("^([%s>]*)") or ""
    local _, depth = prefix:gsub(">", "")
    return depth
end

local function quote_prefix_length(line, depth)
    local index = 1
    local seen = 0
    while index <= #line and line:sub(index, index) == " " do
        index = index + 1
    end
    while index <= #line and seen < depth do
        local char = line:sub(index, index)
        if char == ">" then
            seen = seen + 1
            index = index + 1
        elseif char == " " then
            index = index + 1
        else
            break
        end
    end
    if line:sub(index, index) == " " then
        index = index + 1
    end
    return index - 1
end

local function blockquote_bounds()
    local candidate = containing_markdown_node({ block_quote = true })
    if not candidate then
        return nil
    end
    local cursor_row = vim.api.nvim_win_get_cursor(0)[1] - 1
    local depth = quote_depth(line_text(cursor_row))
    if depth == 0 then
        return nil
    end
    local outer = candidate.node
    while outer:parent() and outer:parent():type() == "block_quote" do
        outer = outer:parent()
    end
    local range = node_range(outer)
    local first = range[1]
    local last = range[4] == 0 and range[3] - 1 or range[3]
    local start_row = cursor_row
    while start_row > first and quote_depth(line_text(start_row - 1)) >= depth do
        start_row = start_row - 1
    end
    local end_row = cursor_row
    while end_row < last and quote_depth(line_text(end_row + 1)) >= depth do
        end_row = end_row + 1
    end
    return { start_row = start_row, end_row = end_row, depth = depth }
end

local function blockquote_range(inner)
    local bounds = blockquote_bounds()
    if not bounds then
        return nil
    end
    if inner then
        return {
            bounds.start_row,
            quote_prefix_length(line_text(bounds.start_row), bounds.depth),
            bounds.end_row,
            #line_text(bounds.end_row),
        }
    end
    local after_depth = quote_depth(line_text(bounds.end_row + 1))
    if after_depth > 0 then
        return { bounds.start_row, 0, bounds.end_row + 1, 0 }
    end
    local before_depth = bounds.start_row > 0 and quote_depth(line_text(bounds.start_row - 1)) or 0
    if before_depth > 0 then
        return {
            bounds.start_row - 1,
            #line_text(bounds.start_row - 1),
            bounds.end_row,
            #line_text(bounds.end_row),
        }
    end
    return { bounds.start_row, 0, bounds.end_row, #line_text(bounds.end_row) }
end

local function callout_bounds()
    if not containing_markdown_node({ block_quote = true }) then
        return nil
    end
    local cursor_row = vim.api.nvim_win_get_cursor(0)[1] - 1
    local start_row = cursor_row
    while start_row >= 0 do
        local line = line_text(start_row)
        if line:match("^(%s*>)%s*%[!.+%]") then
            break
        end
        if quote_depth(line) == 0 then
            return nil
        end
        start_row = start_row - 1
    end
    if start_row < 0 then
        return nil
    end
    local end_row = start_row
    local line_count = vim.api.nvim_buf_line_count(mirror_buf)
    while end_row + 1 < line_count and quote_depth(line_text(end_row + 1)) > 0 do
        end_row = end_row + 1
    end
    return { start_row = start_row, end_row = end_row }
end

local function callout_range(inner)
    local bounds = callout_bounds()
    if not bounds then
        return nil
    end
    if inner then
        local start_row = bounds.start_row + 1
        if start_row > bounds.end_row then
            return nil
        end
        return {
            start_row,
            quote_prefix_length(line_text(start_row), 1),
            bounds.end_row,
            #line_text(bounds.end_row),
        }
    end
    return { bounds.start_row, 0, bounds.end_row, #line_text(bounds.end_row) }
end

local function unescaped_pipes(line)
    local pipes = {}
    for index = 1, #line do
        if line:sub(index, index) == "|" then
            local slashes = 0
            local previous = index - 1
            while previous > 0 and line:sub(previous, previous) == "\\" do
                slashes = slashes + 1
                previous = previous - 1
            end
            if slashes % 2 == 0 then
                pipes[#pipes + 1] = index - 1
            end
        end
    end
    return pipes
end

local function table_range(inner, whole_row)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local row = cursor[1] - 1
    local col = cursor[2]
    local candidate = containing_markdown_node({ pipe_table_row = true, pipe_table_cell = true })
    if not candidate then
        return nil
    end
    local line = line_text(row)
    if not line:match("^%s*|") then
        return nil
    end
    local pipes = unescaped_pipes(line)
    if #pipes < 2 then
        return nil
    end
    if whole_row then
        if inner then
            return { row, pipes[1] + 1, row, pipes[#pipes] }
        end
        return { row, 0, row, #line }
    end
    for index = #pipes - 1, 1, -1 do
        if pipes[index] <= col and pipes[index + 1] then
            local ending = inner and pipes[index + 1] or pipes[index + 1] + 1
            return { row, pipes[index] + 1, row, ending }
        end
    end
end

local function previous_character_position(row, col)
    if col == 0 then
        if row == 0 then
            return nil
        end
        return { row - 1, #line_text(row - 1) }
    end
    local line = line_text(row)
    local previous = col - 1
    while previous > 0 and line:byte(previous + 1) >= 0x80 and line:byte(previous + 1) < 0xC0 do
        previous = previous - 1
    end
    return { row, previous }
end

local function select_textobject_range(range, apply_operator)
    if not range or not position_before(range[1], range[2], range[3], range[4]) then
        return
    end
    local operator = vim.v.operator
    local register = vim.v.register
    local count = vim.v.count1
    local original_cursor = vim.api.nvim_win_get_cursor(0)
    vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
    if apply_operator then
        local ending = previous_character_position(range[3], range[4])
        if not ending then
            return
        end
        local ok, err = xpcall(function()
            vim.api.nvim_win_set_cursor(0, { range[1] + 1, range[2] })
            vim.cmd("normal! v")
            vim.api.nvim_win_set_cursor(0, { ending[1] + 1, ending[2] })
            local register_prefix = register == '"' and "" or '"' .. register
            -- The fork's custom text-object motions receive the combined count once;
            -- they do not expand their returned range. Consume it here and never
            -- prefix it onto the reissued visual operator.
            if count < 1 then
                error("invalid text object count")
            end
            local effective_operator = operator == "c" and "d" or operator
            vim.cmd("normal! " .. register_prefix .. effective_operator)
            if operator == "c" then
                vim.api.nvim_win_set_cursor(0, { range[1] + 1, range[2] })
                vim.cmd("startinsert")
            end
        end, debug.traceback)
        if not ok then
            error(err)
        end
        if operator == "y" then
            local restored = previous_character_position(original_cursor[1] - 1, original_cursor[2])
            if restored then
                vim.api.nvim_win_set_cursor(0, { restored[1] + 1, restored[2] })
            end
        end
        return
    end
    local ending = range[4] == 0 and { range[3], 0 }
        or previous_character_position(range[3], range[4])
    if not ending then
        return
    end
    vim.api.nvim_win_set_cursor(0, { range[1] + 1, range[2] })
    vim.cmd("normal! v")
    vim.api.nvim_win_set_cursor(0, { ending[1] + 1, ending[2] })
end

local textobjects = {
    ["i*"] = function() return asterisk_range(true) end,
    ["a*"] = function() return asterisk_range(false) end,
    ["i_"] = function() return underscore_range(true) end,
    ["a_"] = function() return underscore_range(false) end,
    ["i`"] = function() return code_span_range(true) end,
    ["a`"] = function() return code_span_range(false) end,
    ["i$"] = function() return math_range(true) end,
    ["a$"] = function() return math_range(false) end,
    ["i~"] = function() return strikethrough_range(true) end,
    ["a~"] = function() return strikethrough_range(false) end,
    ["il"] = function() return link_range(true) end,
    ["al"] = function() return link_range(false) end,
    ["it"] = function() return native_tag_range(true) end,
    ["at"] = function() return native_tag_range(false) end,
    ["iC"] = function() return code_fence_range(true) end,
    ["aC"] = function() return code_fence_range(false) end,
    ["iB"] = function() return blockquote_range(true) end,
    ["aB"] = function() return blockquote_range(false) end,
    ["io"] = function() return callout_range(true) end,
    ["ao"] = function() return callout_range(false) end,
    ["i|"] = function() return table_range(true, false) end,
    ["a|"] = function() return table_range(false, false) end,
    ["ir"] = function() return table_range(true, true) end,
    ["ar"] = function() return table_range(false, true) end,
}

for lhs, range_for_object in pairs(textobjects) do
    vim.keymap.set("o", lhs, function()
        select_textobject_range(range_for_object(), true)
    end, {
        buffer = mirror_buf,
        desc = "vim-motions-rpc-textobject:" .. lhs,
        nowait = true,
        silent = true,
    })
    vim.keymap.set("x", lhs, function()
        select_textobject_range(range_for_object(), false)
    end, {
        buffer = mirror_buf,
        desc = "vim-motions-rpc-textobject:" .. lhs,
        nowait = true,
        silent = true,
    })
end

local write_read_group = vim.api.nvim_create_augroup("vim_motions_rpc_write_read", { clear = true })

local fold_aliases = {
    foldnext = "zj",
    foldprev = "zk",
    foldstart = "[z",
    foldend = "]z",
    folddelete = "zd",
    foldeliminate = "zE",
    foldall = "zM",
    unfoldall = "zR",
    foldmore = "zm",
    foldless = "zr",
}

for name, keys in pairs(fold_aliases) do
    local command = name:sub(1, 1):upper() .. name:sub(2)
    pcall(vim.api.nvim_del_user_command, command)
    vim.api.nvim_create_user_command(command, function(opts)
        local count = opts.count > 0 and tostring(opts.count) or ""
        vim.cmd("normal! " .. count .. keys)
    end, { count = true, desc = "vim-motions-rpc-fold:" .. name })
    vim.cmd(string.format(
        "cnoreabbrev <expr> %s getcmdtype() ==# ':' && getcmdpos() == %d ? '%s' : '%s'",
        name,
        #name + 1,
        command,
        name
    ))
end

vim.api.nvim_create_autocmd("BufWriteCmd", {
    group = write_read_group,
    buffer = mirror_buf,
    callback = function()
        vim.rpcnotify(0, "vim_motions_write", mirror_buf)
        vim.bo[mirror_buf].modified = false
    end,
})

vim.api.nvim_create_autocmd("BufReadCmd", {
    group = write_read_group,
    buffer = mirror_buf,
    callback = function()
        vim.rpcnotify(0, "vim_motions_read", mirror_buf)
        vim.bo[mirror_buf].modified = false
    end,
})

local function include_range(buf, first, last)
    local current = visible[buf]
    if current then
        current.first = math.min(current.first, first)
        current.last = math.max(current.last, last)
    else
        visible[buf] = { first = first, last = last }
    end
end

vim.api.nvim_set_decoration_provider(provider_ns, {
    on_start = function()
        visible = {}
        if #vim.api.nvim_list_uis() == 0 then
            return false
        end
        return true
    end,
    on_win = function(_, _, buf, first, last)
        include_range(buf, first, last)
        return true
    end,
    on_range = function(_, _, buf, first, _, last, _)
        include_range(buf, first, last)
        return true
    end,
    on_end = function()
        for buf, range in pairs(visible) do
            local ok, extmarks = pcall(
                vim.api.nvim_buf_get_extmarks,
                buf,
                -1,
                { range.first, 0 },
                { range.last, -1 },
                { details = true, overlap = true }
            )
            if ok then
                local forwarded = {}
                for _, mark in ipairs(extmarks) do
                    local details = mark[4] or {}
                    local ns_id = details.ns_id
                    if ns_id and ns_id ~= provider_ns then
                        forwarded[#forwarded + 1] = {
                            ns_id = ns_id,
                            id = mark[1],
                            row = mark[2],
                            col = mark[3],
                            end_row = details.end_row,
                            end_col = details.end_col,
                            hl_group = details.hl_group,
                            virt_text = details.virt_text,
                            virt_text_pos = details.virt_text_pos,
                            priority = details.priority,
                        }
                    end
                end
                local folds = {}
                local line_count = vim.api.nvim_buf_line_count(buf)
                local last = math.min(range.last, line_count - 1)
                for row = math.max(0, range.first), last do
                    local line = row + 1
                    folds[#folds + 1] = {
                        row = row,
                        closed = vim.fn.foldclosed(line),
                        closed_end = vim.fn.foldclosedend(line),
                        level = vim.fn.foldlevel(line),
                    }
                end
                vim.rpcnotify(0, "vim_motions_extmarks", buf, forwarded, {
                    first = math.max(0, range.first),
                    last = last,
                    lines = folds,
                })
            end
        end
        local floats = {}
        for _, win in ipairs(vim.api.nvim_list_wins()) do
            local config_ok, config = pcall(vim.api.nvim_win_get_config, win)
            if config_ok and config.relative and config.relative ~= "" then
                local buf_ok, buf = pcall(vim.api.nvim_win_get_buf, win)
                local lines_ok, lines = false, {}
                local extmarks_ok, extmarks = false, {}
                if buf_ok then
                    lines_ok, lines = pcall(vim.api.nvim_buf_get_lines, buf, 0, -1, false)
                    extmarks_ok, extmarks = pcall(
                        vim.api.nvim_buf_get_extmarks,
                        buf,
                        -1,
                        { 0, 0 },
                        { -1, -1 },
                        { details = true, overlap = true }
                    )
                end
                if buf_ok and lines_ok and extmarks_ok then
                    local forwarded = {}
                    for _, mark in ipairs(extmarks) do
                        local details = mark[4] or {}
                        local ns_id = details.ns_id
                        if ns_id and ns_id ~= provider_ns then
                            forwarded[#forwarded + 1] = {
                                ns_id = ns_id,
                                id = mark[1],
                                row = mark[2],
                                col = mark[3],
                                end_row = details.end_row,
                                end_col = details.end_col,
                                hl_group = details.hl_group,
                                virt_text = details.virt_text,
                                virt_text_pos = details.virt_text_pos,
                                priority = details.priority,
                            }
                        end
                    end
                    local origin = { row = 0, col = 0 }
                    if config.relative == "win" then
                        local position_ok, position = pcall(
                            vim.api.nvim_win_get_position,
                            config.win or 0
                        )
                        if position_ok then
                            origin = { row = position[1], col = position[2] }
                        end
                    end
                    floats[#floats + 1] = {
                        win = win,
                        buf = buf,
                        config = config,
                        origin = origin,
                        lines = lines,
                        extmarks = forwarded,
                    }
                end
            end
        end
        vim.rpcnotify(0, "vim_motions_floats", floats)
    end,
})

return provider_ns
