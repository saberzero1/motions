# RPC lifecycle negative controls

## Teardown disabled

Replacing `NeovimConnection.disconnect()` with an immediate resolved promise produced three failures:

- Scenario 2: `Neovim PID 2687359 survived teardown` after 5 seconds.
- Scenario 3: `Neovim PID 2687442 survived teardown` after 5 seconds.
- Scenario 5: `Neovim PID 2687567 survived teardown` after 5 seconds.

The spec's PID-owned cleanup killed each surviving child after its scenario.

## Version floor disabled

Removing the `apiLevel < 12` branch made the API-level-11 stub attach. Scenario 7 reported `Expected: false, Received: true` for `state.connected`.

## Version floor set too low (#199)

The scenario above stubbed api_level **11** and nothing else, which is below both the shipped floor of 12 and the correct floor of 14. It therefore stayed green for the entire life of the defect, while Neovim 0.10 (level 12) and 0.11 (level 13) were admitted and then failed inside the decoration bridge on `on_range`.

It is now a loop over 11, 12 and 13. Reverting `REQUIRED_API_LEVEL` in `src/rpc/neovim-connection.ts` from 14 to 12 and rebuilding with `npm run build:ci-test`:

- `refuses a Neovim reporting API level 11` — still passed, which is why the original single-level form was blind.
- `refuses a Neovim reporting API level 12` — failed.
- `refuses a Neovim reporting API level 13` — failed.

Both failures carried `"notices":[]` in their `FAILDIAG`, so no version notice was ever shown: the stub was admitted and the connection proceeded past the gate, which is the path the issue reports. 13 passing / 2 failing under the sabotage, 15 passing once the floor was restored to 14, against Obsidian 1.13.7 and Neovim 0.12.5.

The unit-level controls for the same defect — the floor against the keys `companion.lua` passes, per-site drift, and the two failure notices — are in `test/unit/rpc/neovim-api-floor.test.ts` and recorded in `CHANGELOG.md`.

## Post-spawn failure reported as a bad path (#199)

`reports a post-spawn failure as a Neovim error, not a bad path` exists because a unit test cannot see which notice `connect()` selects. Its stub answers `nvim_get_api_info` with an accepted level and then exits, so the next in-flight request rejects through `MsgpackRpcClient.dispose()` and the failure lands after spawn.

Dropping the `spawned` argument from the outer `catch` — `this.showStartFailure(binaryPath, error)`, which defaults it to `false` and is exactly the pre-fix behaviour — produced **15 passing / 1 failing**. The scenario failed both ways round: `but the connection failed` reported `Expected: true, Received: false`, and `could not start Neovim` reported `Expected: false, Received: true`. Nothing else changed, so the scenario measures the notice selection rather than the connection outcome. 16 passing once restored.

## Stub api_level drifting from the source floor

`ACCEPTED_STUB_API_LEVEL` in this spec restates `REQUIRED_API_LEVEL`, because a spec cannot value-import a `src` module. Changing it to 13 failed `agrees with the install scripts, the prerequisite probe and the e2e stub` on that field alone — `lifecycleStub: 13` against an otherwise intact `installSh: 14, installPs1: 14, prerequisites: 14` — so the copy cannot drift silently.
