# RPC structural navigation negative controls

Observed against `test/specs/rpc-structural-nav.e2e.ts`; every sabotage was restored before the green run.

| Sabotage                                                            | Observed failure                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Removed the companion's `]l` mapping                                | The three RPC cursor rows stayed `0, 0, 0`; the fork oracle produced `3, 5, 3`.                                                           |
| Set the mirrored buffer's `textwidth` to `0`                        | RPC left the list item and paragraph at their original long widths and ended on row 4; the fork wrapped at 40 columns and ended on row 6. |
| Matched heading level `level + 1`                                   | RPC `]2` landed on row 2 (`### C`) instead of the fork's row 1 (`## B`).                                                                  |
| Used a plain operator-pending callback without a well-formed motion | RPC `d]h` produced the empty document; the fork produced `# A\n## B\nthird`.                                                              |
| Replaced `vim.v.count1` with `1`                                    | RPC `d2]h` left `## B\ntwo`; the fork deleted through the second heading and began the remainder at `### C`.                              |

Restored result: all 14 parity scenarios pass.
