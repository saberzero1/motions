# RPC key delegation negative controls

## M2c frontmatter handling

- Removing the rendered-properties fold changed six upward cursor rows from `7, 6, 6, 6, 6, 6` to `7, 6, 5, 4, 3, 2`; CM6 remained collapsed at its body boundary once Neovim entered frontmatter.
- Removing the `foldclosed()` cursor guard changed the same rows to `7, 6, 1, 1, 1, 1`. After `ggdd`, Neovim contained `body one\nbody two\nbody three`, proving the entire five-line frontmatter fold was deleted. CM6 and the vault file retained the original eight-line fixture instead of persisting that deletion, so the independent disk synchronization assertion timed out rather than allowing Neovim/CM6 agreement to mask the failure.
- Applying the fold in Source mode changed six upward cursor rows from `7, 6, 5, 4, 3, 2` to `7, 6, 6, 6, 6, 6`; the source frontmatter was no longer navigable.

After restoring each sabotage, all ten `rpc-keys.e2e.ts` scenarios passed.
