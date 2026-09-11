# RPC decoration negative controls

- Removing one forwarded virtual-text extmark made the flash oracle report 40 labels while CM6 rendered 39: `CM6 rendered 39/40 flash label extmarks`.
- Adding one to every forwarded byte column shifted all 40 CM6 offsets by exactly one; for example, extmark 74 rendered at offset 111 instead of 110, and extmark 75 rendered at 121 instead of 120.
- Suppressing `nvim_ui_attach` left flash's 40 persistent label extmarks in Neovim while the provider forwarded none: `CM6 rendered 0/40 flash label extmarks`.
- Changing the expected selected-label column from 4 to 5 observed Neovim at `[1, 4]`; adding `setTimeout` to the bridge source tripped the static polling assertion; changing the expected idle decoration count from 0 to 1 observed 0.

After restoring every sabotage, all four `rpc-decorations.e2e.ts` scenarios passed.
