# Neovim RPC host edits: negative controls

`rpc-host-edits.e2e.ts` passes 7 of 7 and `rpc-image.e2e.ts` 4 of 4 with the sources intact. Each sabotage was applied, the plugin rebuilt with `npm run build:ci-test`, and both specs run in full.

## Before the fix

Six of the scenarios were written first and run against the code as it was. All six failed:

| Scenario                             | Observed                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `:ob editor:toggle-bold`             | editor `**alpha** beta`, Neovim `alpha beta`                                                                                                     |
| editor API edit                      | editor `NEW alpha beta`, Neovim `alpha beta`                                                                                                     |
| change to the file on disk           | editor `alpha beta\nchanged`, Neovim `alpha beta\nsecond`                                                                                        |
| a later Neovim edit on the same line | editor `NEW alpha !beta`, Neovim `alpha beta!`                                                                                                   |
| `u` after a host edit                | Neovim never held the edit                                                                                                                       |
| ticked checkbox                      | failed at setup: the cursor sat on the task line, which Live Preview shows as source. With the setup fixed, Neovim kept `- [ ] task` (row below) |

## Sabotages

| Sabotage                                                     | Failed                                                     | Observed                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `setHostEditListener` never called                           | 7 of 7 here, 4 of 4 in `rpc-image.e2e.ts`                  | Neovim kept `- [ ] task`, `alpha beta`, `![[rpc-image-pic.png]]`; `A!` left `NEW alpha !beta` and `![[rpc-image-pic.png\|3!25]]` |
| An edit made during an activation sent at once, not deferred | `sends a host edit made while the note is being activated` | Neovim `alpha beta`: the activation's reseed overwrote the edit                                                                  |
| `hasHostEdit` ignores the line-event annotation (unit test)  | `counts an unmarked edit and skips a marked one`           | `neovim: true`, expected `false`                                                                                                 |

The annotation guard has no end-to-end control, and cannot have one: without it the document sync diffs the editor against a mirror that already matches, finds nothing, and sends nothing. What it saves is that diff on every keystroke Neovim echoes back.

## Found while running the suite

The first version did not suppress Neovim's echo, on the theory that an echo of a change the mirror already holds changes nothing. That holds for one line, which is all `:image` and the scenarios above produce. `rpc-undo-isolation.e2e.ts` replaced a 15-line note with 2 lines while connected; the echo came back as lines 0-15, and applying it reported `Neovim text synchronisation failed: Invalid line number 15 in 2-line document`. The echo is now dropped the way an activation's reseed is. A queued edit is also dropped once another activation has started, because every note shares one buffer.

The same spec asserted `seq_last` and `seq_cur` of 0 as its proof that a fresh note has no reachable undo history. With `beforeEach`'s edits now reaching Neovim, both read 2 while `undotree().entries` was empty, so the assertion moved to the entries. Removing `undolevels = -1` from the reseed fails it with 6 entries, along with the three scenarios that undo after activation.
