---
title: Style customization
description: Customize EasyMotion labels, hint mode labels, and powerline colors via CSS custom properties or the Style Settings plugin.
tags:
    - guide
    - configuration
---

Vim Motions' visual elements — EasyMotion labels, hint mode labels, and the powerline status bar — can be customized via CSS custom properties or the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin.

## CSS custom properties

Add a CSS snippet in **Settings → Appearance → CSS snippets** to override colors:

### EasyMotion labels

```css
body {
    --vim-motions-em-bg: #e06c75; /* label background */
    --vim-motions-em-fg: #ffffff; /* label text color */
}
```

### Hint mode labels

```css
body {
    --vim-motions-hint-bg: #61afef; /* label background */
    --vim-motions-hint-fg: #ffffff; /* label text color */
}
```

### Powerline status bar

```css
body {
    --vim-pl-normal-bg: #a3be8c;
    --vim-pl-normal-fg: #ffffff;
    --vim-pl-insert-bg: #88c0d0;
    --vim-pl-insert-fg: #ffffff;
    --vim-pl-visual-bg: #b48ead;
    --vim-pl-visual-fg: #ffffff;
    --vim-pl-v-line-bg: #b48ead;
    --vim-pl-v-line-fg: #ffffff;
    --vim-pl-v-block-bg: #b48ead;
    --vim-pl-v-block-fg: #ffffff;
    --vim-pl-replace-bg: #bf616a;
    --vim-pl-replace-fg: #ffffff;
    --vim-pl-select-bg: #b48ead;
    --vim-pl-select-fg: #ffffff;
    --vim-pl-vreplace-bg: #bf616a;
    --vim-pl-vreplace-fg: #ffffff;
    --vim-pl-command-bg: #88c0d0;
    --vim-pl-command-fg: #ffffff;
    --vim-pl-search-bg: #88c0d0;
    --vim-pl-search-fg: #ffffff;
}
```

All these properties are configurable via the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin with separate light and dark mode defaults.

## Style Settings plugin

If you have the [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) plugin installed, Vim Motions exposes its color properties in the Style Settings panel with separate light and dark mode defaults. No CSS snippets needed — configure colors directly in the UI.

## Label font size

EasyMotion and hint mode labels share a configurable font size (10–20px, default: 14). Set via **Settings → Vim Motions → Jump navigation → Label font size** or `set labelfontsize=16` in vimrc.

## Label characters

Customize which characters are used for labels:

- **EasyMotion**: **Settings → Vim Motions → Jump navigation → EasyMotion label characters** or `set easymotionlabels=...` in vimrc. Default: `asdghklqwertyuiopzxcvbnmfj` (home-row-first ordering).
- **Hint mode**: **Settings → Vim Motions → Jump navigation → Hint mode label characters** or `set hintlabels=...` in vimrc. Default: `asdfghjkl`.
