# RPC text sync negative controls

All controls were run against `rpc-text-sync.e2e.ts` with the injected defect built into the development bundle. Each defect was restored immediately after its red run.

| Control                                                          | Observed failure                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop the first post-attach `nvim_buf_lines_event`                | The 210-operation scenario failed on its initial corpus replacement. CM6 still contained the 13 bytes for `rpc text sync`; the raw oracle contained the 73-byte ASCII, multibyte, and combining/ZWJ corpus.                                                                                 |
| Add one to the interior line-range start offset                  | The 210-operation scenario failed after operation 0. CM6 had one extra byte `65` (`A`) before the expected `ASCII alpha beta 0` line.                                                                                                                                                       |
| Convert the final-line range as though it had a trailing newline | The cross-line collapse scenario failed on the four-to-two-line collapse. CM6 had one extra trailing byte `10`; the oracle ended at byte `116` (`t`).                                                                                                                                       |
| Build the oracle from `nvim_buf_get_lines` decoded strings       | The interior-endpoint scenario's divergence assertion failed because both arrays were `[239,191,189,113,239,191,189,88]`, proving that the decoded comparator concealed Neovim's invalid UTF-8 bytes.                                                                                       |
| Restore buffer-0 mirroring plus the `modifiable` workaround      | The identity scenario reported `{ filetype: "alpha", buftype: "nofile", namedMarkdownFile: false }` instead of `{ filetype: "markdown", buftype: "", namedMarkdownFile: true }`.                                                                                                            |
| Clear `neovimConfigPath` before connecting                       | The isolation scenario read `vim.g.vim_motions_test_config` as `null`, expected `true`, proving that the fixture marker is not ambient in the user's configuration.                                                                                                                         |
| Restore one-shot seeding and write the prior mirror into CM6     | On the first switch, `Target.md` contained `A original\nA second line` instead of its own `B original\nB second line`. After editing A and switching again, both Target's editor and its on-disk vault-adapter content were `rpc-A original\nA second line`; expected B's original content. |

After restoration, the complete spec passed 7/7, including all 210 generated operations.

## Swap files on the mirror buffer (#199)

`creates no swap file for the mirror buffer, across activations` was added after the reporter of [#199](https://github.com/saberzero1/motions/issues/199) described swap files accumulating per tab and E325 on restart.

The first control is the fixture rather than the source. `test/fixtures/nvim/init.lua` carried `vim.opt.swapfile = false`, which is why this spec — and every other RPC spec — had run clean for the whole life of the backend while the product never disabled swap files at all. Removing that line against the unfixed bundle did not just fail the new assertion: it failed the **`before each` hook** with

```
Neovim RPC did not connect: {"apiLevel":null,"connected":false,"pid":null,...}
```

because a swap file left by the previous connection makes the next one stop at E325, which an embedded Neovim cannot answer. The defect is a total connection failure on reconnect.

With the fixture line gone, each half of the assertion was then proven separately against the unfixed bundle:

| Control                                                                     | Observed failure                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove `vim.bo[buf].swapfile = false` from `PREPARE_ACTIVATION_LUA`         | The option assertion reported `Expected: false`, `Received: true`, at all three checkpoints.                                                 |
| The same, with the option assertions inverted so execution reaches the diff | The added-files assertion reported a newly created `…/swap/%tmp%nix-shell.J4zOt6%test-vault-IX0xSq%Target.md.swp`, against an expected `[]`. |

Two notes on the assertion's shape, both learned by getting it wrong first:

- `vim.fn.swapname(0)` is **not** a usable signal. It returned `""` at every checkpoint in both the broken and fixed states, so an assertion on it would have been a passenger. The option value and the files actually on disk are what discriminate.
- The disk check diffs the swap directory before and after rather than asserting it empty. That directory is shared with the developer's own Neovim, and an absolute assertion failed spuriously on a stale `Target.md.swp` left by an earlier control run.

Side evidence: four control runs left four swap files behind, one per run — `%tmp%nix-shell.1ZuosV%…`, `%tmp%nix-shell.B5JuYI%…`, `%tmp%nix-shell.BseCVo%…`, `%tmp%nix-shell.XBnZyh%…Welcome.md.swp` — which is the reporter's "fail to clean them up" reproduced in our own harness. The fixed run created none.

After restoration the spec passed 8/8, and the rest of the RPC suite passed with the fixture mask gone: 25 specs, one failure in `rpc-obsidian-bridge.e2e.ts` (`uses the host jumplist for two cross-note older jumps`) which is already in `test/flaky-inventory.md` and passed 35/35 on a re-run.
