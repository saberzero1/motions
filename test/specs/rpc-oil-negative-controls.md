# RPC Oil negative controls

## Oil RPC exclusion

The RPC key handler was temporarily attached to the active Oil editor and fork interception was forced on. The action suite lost native Oil handling: Enter, parent, root, hidden toggle, sort, yank, and help scenarios failed. In the focused mechanism control, pressing `x` left Oil active and changed Neovim's buffer from `rpc oil sentinel\nsecond line` to `pc oil sentinel\nsecond line`; `handlerAttached` and `keyInterceptActive` were both `true` instead of `false`.

After restoring Markdown-only attachment, the mechanism scenario kept Neovim's buffer at `rpc oil sentinel\nsecond line`, closed Oil with `q`, and restored Markdown interception.

## Oil action dispatch

The `oilHelp` action was temporarily replaced with a no-op. The suite reported 13 passing, 1 failing, and 2 explicitly skipped scenarios. Only `opens Oil help with g?` failed because `.vim-motions-info-modal-title` did not exist after 5000 ms.

After restoring `oilHelp`, the full RPC Oil spec passed.
