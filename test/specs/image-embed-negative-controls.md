# Image embeds (#218): negative controls

Each sabotage was applied to the source, the plugin rebuilt with `npm run build:ci-test`, and the spec run in full; every one was restored before the next. `image-embed.e2e.ts` passes 11 of 11 and `rpc-image.e2e.ts` 4 of 4 with the sources intact.

## `image-embed.e2e.ts` (bundled engine)

| Sabotage                                                        | Failed                                                        | Observed                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `installImageSelectKeys` not called                             | both `h`/`l` scenarios, both hint scenarios (4)               | the image never selected                                                  |
| Idle check always passes                                        | `a count moves past the image as before`                      | `selected: true` after `2l`, expected `false`                             |
| `:image` throws instead of selecting the image under the cursor | `selects the image under the cursor when none is selected`    | —                                                                         |
| Selection tested by `selectedRange`, not `selectedImage`        | `names what it needs instead of doing nothing`                | `noImage: false`: a range left from the previous scenario, no message     |
| Count always 1 unless given as an argument                      | `takes a count from the address…`                             | `\|325` for `:3image grow`, expected `\|375`                              |
| `.embed-action` not a hint target                               | both hint scenarios                                           | the selected image's labels `object` (null), expected `string`            |
| Opacity filter removed                                          | `labels a selected image's buttons, and not the hidden ones…` | unselected: `"Zoom in": "ax"`, `"Edit this block": "ay"`, expected `null` |
| `handleEx` returns `error` from the page again                  | `names what it needs instead of doing nothing`                | `WebDriverError: Error: No image at the cursor`, retried four times       |

The `selectedRange` row is the defect it guards, found while writing the spec: the whole note was replaced between scenarios, Obsidian kept the selected range with no image behind it, and `:image grow` resized nothing without saying so. Run alone, that scenario passed either way; only the full spec order exposed it.

## `rpc-image.e2e.ts` (Neovim backend)

| Sabotage                                                         | Failed | Observed                                                                                                                           |
| ---------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `:image` not sent on to Neovim (`afterEdit` a no-op, both sites) | 4 of 4 | Neovim kept `![[rpc-image-pic.png]]` while the editor showed `\|325`; after `A!`, the editor showed `![[rpc-image-pic.png\|3!25]]` |
| `image` removed from the bridge's allowlist                      | 4 of 4 | both sides unchanged                                                                                                               |

The first attempt at the `afterEdit` sabotage replaced only the first of the two `registerImageCommand` call sites and left all four scenarios green: the RPC specs connect through a settings reload, which registers from the second. It also showed that `is one step in Neovim undo history` passed under the allowlist sabotage, because it never checked that the grow had happened; it now asserts the grown state and the undone state together.

## `test/unit/vim/image-command.test.ts`

| Sabotage                     | Failed                                                | Observed                 |
| ---------------------------- | ----------------------------------------------------- | ------------------------ |
| `line` read before `lineEnd` | `reads the address the way Obsidian does…`            | `range: 2`, expected `5` |
| A count of `0` accepted      | `rejects a count that is not a positive whole number` | no throw                 |
