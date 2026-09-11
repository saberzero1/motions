# RPC folds and undo tree negative controls

## Fold forwarding suppressed

Replacing the forwarded `lines = folds` payload with `lines = {}` failed only the selected fold-mirror scenario:

```text
fold mirror mismatch: Neovim={"closed":1,"end":6,"level":1}, CM6=0
0 passing, 1 failing
```

## Fold row shifted by one

Changing the host fold start from `row` to `row + 1` kept one fold visible but placed it on the body line:

```text
Expected pattern: /^# One/u
Received string:  "one a4 lines"
0 passing, 1 failing
```

## Sidebar pointed at CM6 history

Returning the host `UndoTree` while RPC was connected, after deliberately diverging its node count, failed the sidebar oracle:

```text
Expected: 5
Received: 15
0 passing, 1 failing
```

## Toggle bridge removed

Removing only `UndoTreeToggle` from the generated host command set left the sidebar unopened:

```text
waitUntil condition timed out after 5000ms
0 passing, 1 failing
```

After restoring all four subjects, the complete spec passed:

```text
9 passing (4.5s)
Spec Files: 1 passed, 1 total
```
