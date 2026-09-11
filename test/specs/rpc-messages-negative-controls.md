# RPC messages negative controls

The controls below were run against `test/specs/rpc-messages.e2e.ts`, then each sabotage was restored.

1. Registering the message router for `msg_show_disabled` instead of `msg_show` produced **3 passing, 5 failing**. The `hello`, `bad`, key-driven `m8-error`, `x`, and `m8-repeat` scenarios each timed out with no matching Notice. The undo and search scenarios still passed with zero Notices, and the latency scenario passed.
2. Routing `undo` and `search_count` to informational Notices produced **6 passing, 2 failing**. Undo exposed `"1 change; before #6  0 seconds ago"` where `[]` was expected, and search exposed `"/alpha            [2/2]"` where `[]` was expected; the CM6 undo and cursor assertions still reached their expected values.
3. Removing the five-second duplicate check produced **7 passing, 1 failing**. The repeated-message scenario observed **20** `"m8-repeat"` Notices where exactly **1** was expected.
4. Deleting the two `vim-motions-rpc-notice-*` rules from `styles.css` while still adding the class produced **7 passing, 1 failing**: the error scenario read a computed `border-left-width` of `0px` where `4px` was expected. This control exists because the severity class was originally asserted by presence alone, which is satisfied by adding an unstyled class and therefore proves nothing about whether an error is distinguishable.

All four controls were measured against a verified **8 passing** baseline and restored to it.

## Two defects this scenario caught before merge

`Notice.noticeEl` is the inner `.notice-message` element in Obsidian 1.13.7, not the outer `.notice` container — measured as `noticeEl.className === "notice-message"`. A selector of `.notice.<class>` therefore never matches, because the class lands on the child. The stylesheet now covers both nestings and the scenario queries the class directly.

The severity class was also initially `mod-error`/`mod-warning`, which nothing in this plugin or Obsidian styles. Presence of that class was asserted, so the scenario reported success while an error Notice looked identical to an informational one. Control 4 is what now prevents that from recurring.
