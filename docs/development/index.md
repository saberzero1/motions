---
title: Development
description: Developer onboarding for contributing to Vim Motions — build setup, architecture overview, and testing strategy.
tags:
    - development
---

# Development

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
| `npm run test:coverage`      | Command-level test coverage report  |
| `npm run test:neovim-smoke`  | Neovim client smoke test            |
| `npm run test:neovim-record` | Record golden files from Neovim     |

## Architecture

See [[architecture]] for the dual-vim architecture, module structure, and design patterns.

## Full development guide

The comprehensive development guide — including testing strategy, Neovim golden comparison infrastructure, file conventions, and contribution guidelines — is maintained in [AGENTS.md](https://github.com/saberzero1/motions/blob/main/AGENTS.md) in the repository root.

## codemirror-vim fork

Core vim behavior changes go in the [codemirror-vim fork](https://github.com/saberzero1/codemirror-vim) at `~/Repos/codemirror-vim`. The fork has its own test suite (1628 browser tests) and Neovim golden comparison infrastructure. See the fork's README for development instructions.

> [!warning] Dependency URL
> The `@replit/codemirror-vim` dependency in `package.json` must point to `https://github.com/saberzero1/codemirror-vim.git` (the remote URL) before committing. During local development, use `npm install ~/Repos/codemirror-vim` for fast iteration, but always switch back to the HTTPS URL before committing.
