---
title: Mobile usage
description: Using Vim Motions on iOS and Android with physical and on-screen keyboards.
tags:
    - guide
---

# Mobile usage

Vim Motions works on iOS and Android with a physical keyboard. On-screen keyboard support is limited by platform constraints.

## Feature availability

| Feature                  | Desktop | Mobile + physical keyboard | Mobile + on-screen keyboard |
| ------------------------ | ------- | -------------------------- | --------------------------- |
| Core Vim motions         | ✅      | ✅                         | Limited                     |
| Text objects             | ✅      | ✅                         | Limited                     |
| Structural navigation    | ✅      | ✅                         | Limited                     |
| Table navigation         | ✅      | ✅                         | Limited                     |
| Hard-wrap (`gq`/`gw`)    | ✅      | ✅                         | Limited                     |
| Surround                 | ✅      | ✅                         | Limited                     |
| EasyMotion               | ✅      | ❌ Disabled                | ❌ Disabled                 |
| Hint mode                | ✅      | ❌ Disabled                | ❌ Disabled                 |
| Ex commands (`:w`, `:q`) | ✅      | ✅                         | ❌ No `:` entry             |
| Search (`/`, `?`)        | ✅      | ✅                         | ❌ No `/` entry             |
| Workspace nav (`<C-w>`)  | ✅      | ✅                         | ❌ No modifier keys         |
| Global workspace nav     | ✅      | ❌ Disabled                | ❌ Disabled                 |
| Status bar               | ✅      | ✅                         | ✅                          |
| Vimrc                    | ✅      | ✅                         | ✅                          |
| Settings                 | ✅      | ✅                         | ✅                          |

## Why some features are disabled on mobile

**EasyMotion and hint mode** depend on desktop-only Obsidian globals (`activeDocument`, `activeWindow`) that are unavailable on mobile. These features are automatically disabled on mobile platforms.

**Global workspace navigation** (the key handler for non-editor views) is similarly disabled because it depends on desktop DOM APIs.

## On-screen keyboard limitations

Obsidian's on-screen keyboard does not provide access to `:` or `/` for command and search entry. Modifier keys (`Ctrl`, `Alt`) are also unavailable, making `<C-w>` bindings inaccessible.

Core motions and text objects work, but the experience is significantly limited without these keys.

## Recommendations

- **Use a physical keyboard** — Bluetooth keyboards provide the full Vim experience on mobile (minus EasyMotion/hint mode)
- **Configure frequently-used settings via the Settings UI** — avoid relying on ex commands for settings changes on mobile
- **Use `set insertmodeescape=jk`** — on-screen keyboards may not have a convenient Escape key; a two-key escape sequence works around this
