# RPC Obsidian bridge negative controls

All controls ran against `test/specs/rpc-obsidian-bridge.e2e.ts` under the Nix development shell. Each sabotage was restored before the final green run.

## Generated mapping removed

Removing `pickerFiles` from the generated mapping set produced **7 passing, 1 failing**. Only the picker row failed: `.vim-motions-prompt-modal-container` did not exist after 5000 ms. Oil, Harpoon, vertical split, `]h`, lowercase `:sidebar`, abbreviation safety, and bridge refresh passed.

## Notification handler disabled

Returning early for `mapping:splitVertical` in the shared `obsidian_action` handler produced **7 passing, 1 failing**. Only the vertical-split row failed after 5000 ms because the Markdown leaf count did not increase. Every other row passed.

## Abbreviation guard removed

Replacing the guarded `<expr>` abbreviation with bare `cnoreabbrev sidebar Sidebar` produced **7 passing, 1 failing**. The `:%s/sidebar/x/` row timed out after 5000 ms because the first line remained `sidebar` rather than becoming `x`; all host-action rows and refresh passed.

## Refresh teardown skipped

Removing `await this.stop()` from bridge startup left the two removed leader mappings visible after the registration source dropped them. The refresh row reported `inventoryStable: false` instead of `true` from `nvim_get_keymap`/`nvim_get_commands`; command and abbreviation counts remained present, and the post-refresh split still created exactly one leaf. The targeted run produced **0 passing, 1 failing**.

## M4b mapping count removed

Replacing `vim.v.count` with `0` in the generated mapping payload produced **13 passing, 2 failing** before the independent substitution setup was corrected, and the load-bearing `3gt` row failed directly: expected the third leaf id `18a5fbb65103d337`, received the first leaf id `c5c9033f97086e5a`. With the setup correction, this sabotage isolates the counted-tab row.

## M4b pane mapping removed

Removing `focusPaneLeft` from the generated mapping set produced **14 passing, 1 failing**. Only the four-direction pane-focus row timed out after 5000 ms at its left-focus assertion; every other bridge row passed.

## M4b abbreviation guard removed

Replacing only `nexttab`'s guarded expression with bare `cnoreabbrev nexttab Nexttab` produced **14 passing, 1 failing**. The substitution row kept text `nexttab` instead of the expected `x`; its active leaf remained `test-leaf`, and every host-action and refresh row passed.

## M4b refresh teardown skipped

Skipping deletion of installed mappings, commands, and abbreviations produced **14 passing, 1 failing**. The refresh row reported `inventoryStable: false` instead of `true`, while `createdLeaves` stayed `1`, entries remained present, and `refreshError` stayed `null`.

## Restored result

After restoring all Batch 1 subjects, the complete bridge spec produced **15 passing, 0 failing**.

## M4b Batch 2 query argument removed

Dropping `opts.args` from the general command notification made `:grep foo` open `Livegrep` with an empty query instead of `Grep` with query `foo`. The targeted run produced **0 passing, 1 failing**.

## M4b Batch 2 leader mapping removed

Removing `pickerTags` from the generated mapping set made the `<leader>ft` row time out after 5000 ms while waiting for a picker action. The targeted leader-source run produced **0 passing, 1 failing**; the preceding source rows reached their exact expected titles.

## M4b Batch 2 abbreviation guard removed

Replacing only `buffers` with bare `cnoreabbrev buffers Buffers` left the substitution text as `buffers` instead of `x`; no picker opened. The targeted run produced **0 passing, 1 failing**.

## M4b Batch 2 post-selection re-seed suppressed

Replacing the `active-leaf-change` activation callback with a no-op let the modal select `Target.md`, but Neovim still named `/tmp/test-vault-UcjO0e/Welcome.md` and held `sidebar\n\n# Next heading\nbody`. The targeted run produced **0 passing, 1 failing**.

## M4b Batch 2 restored result

After restoring all four subjects, the complete bridge spec produced **20 passing, 0 failing**.

## M4b Batch 3 HarpoonSelect slot removed

Dropping the `HarpoonSelect` command argument left `RpcBridgeC.md` active at line 0, column 0 instead of opening `RpcBridgeA.md` at line 1, column 7. The targeted run produced **0 passing, 1 failing**.

## M4b Batch 3 host jumplist mapping removed

Removing the generated `<C-o>` host mapping left `RpcBridgeC.md` active at line 0, column 0 instead of crossing to `RpcBridgeB.md` at line 1, column 3. The targeted run produced **0 passing, 1 failing**.

## M4b Batch 3 jump count removed

Forcing `jumpListWalk` to use count 1 made `2<C-o>` land in `RpcBridgeB.md` at line 1, column 3 instead of `RpcBridgeA.md` at line 1, column 2. The targeted run produced **0 passing, 1 failing**.

## M4b Batch 3 mark gutter refresh removed

Suppressing the `onMarksChanged` callback removed `a` from the Vim mark table but left gutter labels as `["a"]`. The targeted run produced **0 passing, 1 failing**.

## Buffer-name normalisation returns a wrong name

`normalizeBufferName` was introduced because `nvim_buf_get_name` returns Windows paths with backslashes, so the `endsWith('/<file>')` comparison in `waitForMirror` could never match and every row that awaited the mirror timed out after 5000 ms. CI showed the product working — the failing payload carried the correct `neovimText` — while 6 rows failed on the path comparison alone.

To confirm the comparison is still load-bearing after normalisation, `normalizeBufferName` was made to return the constant `'garbage-not-a-real-buffer-name'`. The run produced **20 passing, 9 failing**: every row that awaits `waitForMirror`, plus the picker re-seed row, failed. Restoring the real implementation returned **29 passing**.

## Host cursor hold: Neovim's stale cursor copied over a host jump

Every bridge request first flushes key delegation, whose `syncState` copies Neovim's cursor into CodeMirror. A host jump opens the note and sets CodeMirror's cursor before the bridge moves Neovim level, so a request in between copied Neovim's cursor — still at the top of the freshly reseeded buffer — over the restored one. Raising the restore's settle sleep from 25 ms to 300 ms made it deterministic: both `uses the host jumplist for two cross-note older jumps` and `forwards the count from 2<C-o> to the host jumplist` landed at line 0, column 0. The new scenarios hold the window open with `delayCursorWrites(300)`, which delays only the plugin's `nvim_win_set_cursor`.

| Sabotage                                                       | Scenario that failed                                               | Observed                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| The fix stashed                                                | `keeps a cross-note <C-o> cursor…`                                 | `{ line: 0, ch: 0 }`, expected `{ line: 1, ch: 3 }` |
| Both `hostCursorHeld` checks removed from `syncState`          | `keeps a cross-note <C-o> cursor…`                                 | `{ line: 0, ch: 0 }`, expected `{ line: 1, ch: 3 }` |
| The bridge takes no hold                                       | `keeps a cross-note <C-o> cursor…`                                 | `{ line: 0, ch: 0 }`                                |
| The 300 ms release for a navigation that moved nothing removed | `lets the cursor follow Neovim again when <C-o> has nowhere to go` | `{ line: 0, ch: 0 }`, expected `{ line: 1, ch: 0 }` |
| The release listener never called                              | `lets the cursor follow Neovim again…`                             | `{ line: 0, ch: 0 }`                                |
| Command path without the hold                                  | `keeps a :HarpoonSelect cursor…`                                   | `{ line: 0, ch: 0 }`, expected `{ line: 1, ch: 7 }` |

Each row failed exactly one scenario; the other three jump scenarios stayed green. The "nowhere to go" scenario passes with the whole fix stashed, as it should: it guards the hold against outliving its navigation, not the race. It presses real keys, because `nvim_input` bypasses key delegation and so never runs the copy the release must restore.

## Bridged action dropped while a split is still loading

Obsidian's `duplicateLeaf` activates the new pane in `createLeafBySplit`, then gives it a deferred placeholder and resolves — measured at 12–14 ms — while the real `MarkdownView` loads on activation through a second `setViewState` that nothing awaits. Until that load finishes the active pane has no vim adapter, and the bridge's `run()` returned at `if (!cm) return`. Instrumented, the bridged `<C-w>h` ran at 45 ms with `adapter=false file=undefined` and never called `executeCommandById`. This is why `focuses the expected pane in all four directions` timed out at the left pane on macOS CI, and why awaiting `duplicateLeaf` in the test is no settle signal.

`moves out of a new split that is still loading its note` sends `<C-w>v<C-w>h` as one input, with no fault injection. Before the fix it ended in the new pane 3 runs out of 3.

| Sabotage                                       | Observed                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Bridge without the readiness wait and the turn | `focus did not reach the original pane`, active the new leaf, 2 of 2 runs |
| Turn removed, readiness wait kept              | same, 2 of 2                                                              |
| Readiness wait removed, turn kept              | same, 2 of 2                                                              |

Both halves are needed. Without the turn, `<C-w>h`'s first readiness check runs before `<C-w>v`'s split has executed, so it acts on the old layout and the split's deferred load then takes focus back. With the whole fix and the new pane's `setState` held back by 1.5 s, the four-directions scenario passes; with the same injection and no fix it failed at the left pane 2 of 2.
