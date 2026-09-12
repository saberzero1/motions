# RPC popup-menu and mode-status negative controls

Run against Neovim 0.12.5 with `npm run build:ci-test` before each WDIO invocation. Every sabotage was restored after the observed failure.

## M8c: ignore `popupmenu_select`

Removed the `popupmenu_select` dispatcher registration from `NeovimPopupMenuOverlay`. The second-Tab scenario timed out waiting for selected index 1 because row 0 remained highlighted. Result: **3 passing, 1 failing** in `rpc-popupmenu.e2e.ts`.

## M8c: always use command-line anchoring

Forced every `popupmenu_show` event through the `grid === -1` branch. Insert completion had `grid=1`, no command-line element, and therefore rendered with `style.left` unset (`null`) instead of the measured grid anchor (`32px` in that run). Result: **3 passing, 1 failing** in `rpc-popupmenu.e2e.ts`.

## M8d: suppress `msg_showmode`

Suppressed the call to `VimModeTracker.setExternalMode()` in the `msg_showmode` handler. The insert, insert-to-normal, and visual-line scenarios retained the fork's `NORMAL` / `data-vim-mode="normal"` status instead of `INSERT` / `insert` or `V-LINE` / `v-line`; the disconnect scenario also failed at its insert-mode precondition. Result: **7 passing, 4 failing** in `rpc-lifecycle.e2e.ts`.
