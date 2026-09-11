# RPC lifecycle negative controls

## Teardown disabled

Replacing `NeovimConnection.disconnect()` with an immediate resolved promise produced three failures:

- Scenario 2: `Neovim PID 2687359 survived teardown` after 5 seconds.
- Scenario 3: `Neovim PID 2687442 survived teardown` after 5 seconds.
- Scenario 5: `Neovim PID 2687567 survived teardown` after 5 seconds.

The spec's PID-owned cleanup killed each surviving child after its scenario.

## Version floor disabled

Removing the `apiLevel < 12` branch made the API-level-11 stub attach. Scenario 7 reported `Expected: false, Received: true` for `state.connected`.
