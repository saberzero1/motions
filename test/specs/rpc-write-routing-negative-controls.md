# RPC write/read routing negative controls

The controls below were run against `test/specs/rpc-write-routing.e2e.ts`, then each sabotage was restored.

1. Removing the buffer-scoped `BufWriteCmd` while retaining `buftype=acwrite` made ordinary `:w` fail with `E676: No matching autocommands for buftype=acwrite buffer`; the save scenario failed before any disk assertion.
2. Removing the buffer-local `buftype=acwrite` assignment produced `buftype: ""` instead of `"acwrite"` in the forced-write route assertion. The scoped `BufWriteCmd` remained present and still invoked `editor:save-file`; ordinary `:w` separately failed with `E13: File exists (add ! to override)` because this created buffer was never loaded from disk.
3. Removing `BufReadCmd` made `:e!` replace Neovim's buffer with `"stale on disk"` instead of `"unsaved in obsidian"`; CM6 still held `"unsaved in obsidian"`, and the vault adapter read `"stale on disk"`.
4. Removing `vim.bo[mirror_buf].modified = false` from `BufWriteCmd` left `modified: true` after the host save, where the scenarios expected `false`. Buffer, CM6, and disk still all held the saved text, and the save-command spy recorded one invocation.
5. Removing only the `vim.rpcnotify(0, "vim_motions_read", mirror_buf)` call from `BufReadCmd`, after the scenario stopped writing its own divergence to disk, produced **3 passing, 1 failing**: the `:e!` row alone failed. This re-confirms control 3 against the restructured scenario, which now inherits the preceding test's on-disk text instead of calling `adapter.write`.

    The restructuring was prompted by a macOS-only CI failure in which **both** the Neovim buffer and CM6 read `"stale on disk"` with `saveCommandCount: 0`. Control 3 establishes that a genuinely broken `BufReadCmd` leaves CM6 holding the unsaved text, so a reload that moves CM6 as well cannot be a read-routing defect: Obsidian's file watcher had observed the scenario's own `adapter.write` and reloaded the editor before the assertion. Creating the divergence in the test was therefore the defect, not the product.

6. The scenario no longer requires the disk copy to differ at all, and control 5 still fails without the re-seed: **3 passing, 1 failing**, reporting `after :e! the mirror never settled on the unsaved text`.

    Requiring divergence is unwinnable from inside the test. Writing it trips Obsidian's file watcher, which reloads the editor and discards the unsaved text; waiting for the mirror instead gives Obsidian's roughly two-second idle autosave time to flush that text to disk and erase the divergence. The second failure mode reached macOS CI as `expect(before.disk).not.toBe('unsaved in obsidian')`. Once disk equals the editor, a content-based assertion is not merely flaky but **vacuous**, because a disk read would produce the same text.

    What the scenario was straining to prove is structural: `src/rpc/document-sync.ts` contains no vault read of any kind — its only use of the adapter is `getFullPath` — so `activateDocument()` can source the re-seed only from `editorView.state.doc`. Re-adding a disk read to that module is what would break the property, and no end-to-end timing arrangement is needed to detect it.
