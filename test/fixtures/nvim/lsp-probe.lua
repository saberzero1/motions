-- Neovim configuration for test/specs/rpc-lsp-capability.e2e.ts.
--
-- Mirrors test/fixtures/nvim/init.lua and additionally registers an in-process
-- LSP server, so the suite needs no language-server binary and no network: the
-- real vim.lsp client, completion, hover and diagnostic code paths run, but the
-- transport is a Lua table rather than a child process.
--
-- This must run at startup rather than from the spec, because vim.lsp.enable()
-- attaches on FileType and skips buffers whose 'buftype' is already set. The
-- plugin issues `filetype detect` before it applies buftype=acwrite, so a
-- config-time enable is the only path that attaches -- which is exactly the
-- path a real user's init.lua takes.
vim.g.vim_motions_test_config = true
vim.opt.runtimepath:append(vim.fs.joinpath(vim.fn.getcwd(), 'test-vault'))

_G.vim_motions_lsp_events = {}

vim.g.vim_motions_lsp_hover_body = 'VIM_MOTIONS_HOVER_BODY'
vim.g.vim_motions_lsp_diagnostic = 'VIM_MOTIONS_LSP_DIAGNOSTIC'
vim.g.vim_motions_lsp_items = { 'probeAlphaItem', 'probeBetaItem' }

local function make_server(dispatchers)
    local closing = false
    local function reply(callback, result)
        vim.schedule(function()
            callback(nil, result)
        end)
    end
    return {
        request = function(method, _, callback)
            if method == 'initialize' then
                -- textDocumentSync.openClose is load-bearing: without it Neovim
                -- never sends textDocument/didOpen, the server never learns a
                -- URI, and every diagnostic assertion silently measures nothing.
                reply(callback, {
                    capabilities = {
                        textDocumentSync = { openClose = true, change = 1 },
                        completionProvider = { triggerCharacters = { '[' } },
                        hoverProvider = true,
                    },
                    serverInfo = { name = 'vimmotionsprobe' },
                })
            elseif method == 'textDocument/completion' then
                local items = {}
                for index, label in ipairs(vim.g.vim_motions_lsp_items) do
                    items[index] =
                        { label = label, kind = 1, detail = 'probe server' }
                end
                reply(callback, { isIncomplete = false, items = items })
            elseif method == 'textDocument/hover' then
                reply(callback, {
                    contents = {
                        kind = 'markdown',
                        value = vim.g.vim_motions_lsp_hover_body,
                    },
                })
            else
                reply(callback, nil)
            end
            return true, 1
        end,
        notify = function(method, params)
            -- Document lifecycle is recorded so a spec can prove the server's
            -- URI follows the note. The mirror buffer is renamed rather than
            -- reopened, so without an explicit didClose/didOpen the server goes
            -- on attributing edits to the previously active note.
            if
                method == 'textDocument/didOpen'
                or method == 'textDocument/didClose'
            then
                table.insert(
                    _G.vim_motions_lsp_events,
                    method .. ' ' .. tostring(params.textDocument.uri)
                )
            end
            if method == 'textDocument/didOpen' then
                local uri = params.textDocument.uri
                vim.schedule(function()
                    dispatchers.notification(
                        'textDocument/publishDiagnostics',
                        {
                            uri = uri,
                            diagnostics = {
                                {
                                    range = {
                                        start = { line = 0, character = 0 },
                                        ['end'] = { line = 0, character = 5 },
                                    },
                                    severity = 1,
                                    message = vim.g.vim_motions_lsp_diagnostic,
                                    source = 'probe',
                                },
                            },
                        }
                    )
                end)
            end
            return true
        end,
        is_closing = function()
            return closing
        end,
        terminate = function()
            closing = true
        end,
    }
end

vim.g.vim_motions_lsp_server = make_server

vim.lsp.config('vimmotionsprobe', {
    cmd = make_server,
    filetypes = { 'markdown' },
    root_dir = function(bufnr, on_dir)
        on_dir(vim.fs.dirname(vim.api.nvim_buf_get_name(bufnr)))
    end,
})
vim.lsp.enable('vimmotionsprobe')

vim.diagnostic.config({
    virtual_text = true,
    virtual_lines = false,
    signs = true,
    underline = true,
})
