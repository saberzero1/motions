# Neovim RPC IME negative controls

## CM6-only commit

Injection: replace the composition commit callback with a CM6 transaction at the active selection and never call Neovim.

Observed: the commit scenario failed with CM6 equal to `日本語alpha\nbeta` while Neovim still held `alpha\nbeta`. The expected first Neovim line was `日本語alpha`, but the observed line was `alpha`.

## Buffer-API commit

Injection: insert the committed text with `nvim_buf_set_text`, advance the Neovim cursor by the committed UTF-8 byte length, and never call `nvim_input` for the commit.

Observed: the commit scenario passed. The dot-repeat scenario failed after `j0.` with Neovim equal to `日本語alpha\nbeta`; line 1 contained `beta`, not the composed text. This control asserts only that line 1 did not receive `日本語`.

## Forwarding during composition

Injection: call the ordinary key-forwarding callback for non-Escape keydowns while composition is active.

Observed: pressing `x` during preedit changed the Neovim buffer to `xalpha`; the expected and restored value was `alpha`.

All injections were removed before the restored five-scenario run, which passed 5/5.
