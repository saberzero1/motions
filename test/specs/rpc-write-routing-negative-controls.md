# RPC write/read routing negative controls

The controls below were run against `test/specs/rpc-write-routing.e2e.ts`, then each sabotage was restored.

1. Removing the buffer-scoped `BufWriteCmd` while retaining `buftype=acwrite` made ordinary `:w` fail with `E676: No matching autocommands for buftype=acwrite buffer`; the save scenario failed before any disk assertion.
2. Removing the buffer-local `buftype=acwrite` assignment produced `buftype: ""` instead of `"acwrite"` in the forced-write route assertion. The scoped `BufWriteCmd` remained present and still invoked `editor:save-file`; ordinary `:w` separately failed with `E13: File exists (add ! to override)` because this created buffer was never loaded from disk.
3. Removing `BufReadCmd` made `:e!` replace Neovim's buffer with `"stale on disk"` instead of `"unsaved in obsidian"`; CM6 still held `"unsaved in obsidian"`, and the vault adapter read `"stale on disk"`.
4. Removing `vim.bo[mirror_buf].modified = false` from `BufWriteCmd` left `modified: true` after the host save, where the scenarios expected `false`. Buffer, CM6, and disk still all held the saved text, and the save-command spy recorded one invocation.
