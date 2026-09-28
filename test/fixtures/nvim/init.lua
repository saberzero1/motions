-- No `vim.opt.swapfile = false` here. It was here, and it hid #199 for the
-- whole life of the RPC backend: the product never disabled swap files, so
-- every real user accumulated one per note and hit E325 on the next session,
-- while every spec ran clean. The mirror buffer disables them for itself now,
-- and this config deliberately leaves the global default alone so the suite
-- measures the product rather than the fixture.
vim.g.vim_motions_test_config = true
vim.opt.runtimepath:append(vim.fs.joinpath(vim.fn.getcwd(), "test-vault"))
