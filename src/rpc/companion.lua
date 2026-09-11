local provider_ns = vim.api.nvim_create_namespace("vim_motions_rpc_provider")
local mirror_buf = ...
local visible = {}

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
    end,
})

return provider_ns
