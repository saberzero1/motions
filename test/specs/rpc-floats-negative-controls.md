# RPC floating-window negative controls

- Suppressing the `vim_motions_floats` payload left Neovim's flash prompt open while the host rendered no overlay: scenario 1 failed with `Expected 1 rendered Neovim floats`. All six scenarios failed at their non-empty overlay precondition.
- Adding one cell to both forwarded row and column mapping made scenario 2 receive `left=79.7708` instead of `71.809`; the difference was one measured CM6 cell width. The other five scenarios passed.
- Replacing each float's CSS `z-index` with `50` made scenario 3 receive `[50, 50]` instead of Neovim's `[41, 87]`. The other five scenarios passed.
- Skipping stale-window reconciliation left one overlay after flash closed: scenario 4 failed with `Float close left 1 stale overlay(s)` while Neovim had closed the float.

After restoring every sabotage, all six `rpc-floats.e2e.ts` scenarios passed.
