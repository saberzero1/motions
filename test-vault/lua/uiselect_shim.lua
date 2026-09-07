-- Reproduces the override idiom used by dressing.nvim, telescope-ui-select
-- and snacks: capture the original, replace the field, optionally delegate
-- back. The idiom is what is under test, not any particular plugin.
local M = {}

M.original = nil
M.calls = 0

--- Replace vim.ui.select entirely, never delegating.
function M.hijack()
    M.original = M.original or vim.ui.select
    vim.ui.select = function(items, opts, on_choice)
        M.calls = M.calls + 1
        on_choice(items[1], 1)
    end
end

--- dressing.nvim style: wrap, then delegate to the host implementation.
function M.wrap()
    M.original = M.original or vim.ui.select
    vim.ui.select = function(items, opts, on_choice)
        M.calls = M.calls + 1
        return M.original(items, opts, on_choice)
    end
end

function M.restore()
    if M.original then
        vim.ui.select = M.original
        M.original = nil
    end
end

return M
