---
title: Development
description: Developer onboarding for contributing to Vim Motions — build setup, architecture overview, and testing strategy.
tags:
    - development
---

## Quick start

```bash
git clone https://github.com/saberzero1/motions.git
cd motions
npm install
npm run dev    # watch mode — rebuilds on file changes
```

Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/vim-motions/` and reload Obsidian.

## Commands

| Command                      | Description                         |
| ---------------------------- | ----------------------------------- |
| `npm run dev`                | Development build (watch mode)      |
| `npm run build`              | Production build                    |
| `npm run lint`               | ESLint with obsidianmd plugin rules |
| `npm run test:e2e`           | E2E tests (requires `nix develop`)  |
| `e2e-headless [command]`     | E2E on a private display (Linux)    |
| `npm run test:coverage`      | Command-level test coverage report  |
| `npm run test:neovim-smoke`  | Neovim client smoke test            |
| `npm run test:neovim-record` | Record golden files from Neovim     |

## Architecture

See [[architecture]] for the dual-vim architecture, module structure, and design patterns.

## Picker provider API

See [[picker-api]] for how external plugins can register custom picker sources via `window.VimMotions.picker`.

## Full development guide

The comprehensive development guide — including testing strategy, Neovim golden comparison infrastructure, file conventions, and contribution guidelines — is maintained in [AGENTS.md](https://github.com/saberzero1/motions/blob/main/AGENTS.md) in the repository root.

## codemirror-vim fork

Core vim behavior changes go in the [codemirror-vim fork](https://github.com/saberzero1/codemirror-vim) at `~/Repos/codemirror-vim`. The fork has its own test suite (1628 browser tests) and Neovim golden comparison infrastructure. See the fork's README for development instructions.

> [!warning] Dependency specs
> Both forks are consumed from the npm registry through aliases — `"@replit/codemirror-vim": "npm:@saberzero1/codemirror-vim@^6.3.0"` and `"@codemirror/autocomplete": "npm:@saberzero1/codemirror-autocomplete@^6.20.3"` — which keep the original import specifiers unchanged. They must resolve to the registry, not a git URL or a local path, before committing: npm 12 blocks the `prepare` build step for non-registry sources and a git dependency cannot be allow-listed, so a git-URL fork installs with no `dist/` and no types. During local development, use `npm install ~/Repos/codemirror-vim` for fast iteration, but always switch back to the registry alias before committing.

> [!info] Shipping a fork change
> Each fork publishes itself from a push to its default branch via npm trusted publishing (OIDC — no token), gated on the version not already being on the registry. A fork change therefore ships only when you bump the fork's version; then bump the alias range in the plugin's `package.json`.
