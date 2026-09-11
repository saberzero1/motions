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
