# RPC command-line negative controls

The controls below were run against `test/specs/rpc-cmdline.e2e.ts`, then each sabotage was restored and the spec returned to **11 passing, 0 failing**.

1. Returning immediately from `handleHide()` produced **7 passing, 4 failing**. Scenario 3 reached normal mode but retained **1** `.vim-motions-rpc-cmdline` overlay instead of **0** after Escape. The input completion, selection cancellation, and nested-level cleanup scenarios also retained stale command-line state.
2. Using the raw Neovim byte position as the DOM caret offset produced **10 passing, 1 failing**. Scenario 5 rendered caret offset **6** for `你é` instead of the UTF-16 offset **3**; scenario 4 still passed because its ASCII byte and UTF-16 offsets were both **0**.
3. Replacing the level-keyed map with one global active level produced **10 passing, 1 failing**. While the expression-register command line was nested, scenario 10 observed **1** rendered level instead of **2**: the inner level had replaced and hidden the outer command line. Restoring the `Map<number, CmdlineState>` preserved the outer level when the inner level hid.
