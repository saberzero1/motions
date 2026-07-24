---
title: Hint mode
description: Vimium-style keyboard navigation for the entire Obsidian UI. Click, open, yank, and close targets with hint labels.
tags:
    - features
    - keybindings
---

Hint mode provides Vimium-style keyboard navigation for the entire Obsidian interface. When activated, the plugin identifies clickable elements in the viewport and overlays them with unique character labels. Typing a label triggers an action on the corresponding element, such as clicking a button, focusing a pane, or navigating a link.

## Non-editor view actions

When a non-editor view is focused (such as the Graph view, a PDF, Canvas, or the File Explorer), the following bindings are available:

| Key  | Action   | Behavior                                                                                    |
| ---- | -------- | ------------------------------------------------------------------------------------------- |
| `f`  | Activate | Click buttons, focus panes, navigate links, or focus inputs.                                |
| `F`  | Open new | Open a link, pane, or file explorer item in a new tab. Uses Ctrl+click for generic targets. |
| `yf` | Yank     | Copy the URL for links, the note path for tabs, or display text for other elements.         |
| `df` | Close    | Close the targeted tab or pane.                                                             |

### Count support

Hint actions support count prefixes. For example, `3f` allows you to activate three targets sequentially, with the hint overlay re-appearing after each selection. Similarly, `3yf` yanks three URLs in succession.

## Editor context

In the Markdown editor, hint mode is triggered via `<leader><leader>h` or a configured global hotkey.

- **Activate**: Type the label to click or focus the target.
- **Open in new pane**: Hold `Ctrl` (Windows/Linux) or `Cmd` (macOS) while typing the final character of the label.

> [!note]
> Yank (`yf`) and close (`df`) actions are not mapped to editor key sequences to avoid conflicts with native Vim operators. Use the [Obsidian commands](#obsidian-commands) to trigger these actions from the editor.

## Target types

The plugin classifies targets during discovery to ensure context-appropriate behavior:

- **Panes**: Workspace leaf content. Activating (`f`) focuses the pane. Opening new (`F`) duplicates the pane into a new tab.
- **Tabs**: Workspace tab headers. Can be closed via `df`.
- **Links**: Wikilinks, Markdown links, and external URLs. Opened via Obsidian's internal link resolver.
- **Inputs**: Text fields, textareas, and dropdowns. Activating focuses the element.
- **Buttons**: UI buttons and clickable icons.
- **Generic**: Any other clickable element identified by the plugin.

Smart label assignment prioritizes the home row. Single-character labels are used when few targets are visible, while two-character labels are generated for denser views.

## Keyboard behavior

- **Filtering**: Only visible elements within the current scroll container are labeled.
- **Correction**: Press `Backspace` to reset the first character of a two-character label if you mistype.
- **Cancellation**: Press `Escape` to exit hint mode without taking action.
- **Modal interaction**: Hint mode remains active in modals, allowing you to navigate settings or the command palette.

> [!note]
> While hint actions work in modals, standard navigation keys (like `j`/`k`) are suppressed to prevent interference with modal controls.

## Internal link handling

Links are not triggered by raw mouse clicks. Instead, the plugin uses Obsidian's internal link resolver for wikilinks and Markdown links. This ensures that navigation respects your "Open in new tab" settings and correctly handles internal paths.

In Live Preview, wikilinks and markdown links are rendered as `<span>` elements without standard `href` attributes. The plugin resolves these links by converting the DOM element to a document position via CodeMirror's `posAtDOM()` API, then extracting the link target from the raw markdown text using regex matching. This works for all link types:

- `[[Target]]` — plain wikilinks
- `[[Target|Alias]]` — aliased wikilinks
- `[[Target#heading]]` — heading and block links
- `[text](Target)` — markdown links (internal)
- `[text](https://...)` — markdown links (external)
- `https://...` — bare URLs

In Reading view and frontmatter properties, links render as standard HTML elements with `href` or `data-href` attributes and are handled directly.

## Obsidian commands

The following commands are available in the Command Palette for custom hotkey assignment:

- `vim-motions:show-hint-labels`: Trigger standard hint mode.
- `vim-motions:hint-open-new-pane`: Trigger hint mode to open targets in a new pane.
- `vim-motions:hint-yank`: Trigger hint mode to yank link URLs or text.
- `vim-motions:hint-close`: Trigger hint mode to close tabs or panes.

## Configuration

Adjust hint mode behavior in **Settings → Vim Motions → Jump navigation**:

- **Hint characters**: The characters used for generating labels (default: home row).
- **Global hotkey**: Assign a hotkey to trigger hints from any context, including modals.
- **Font size**: Customize the size of the hint labels for better visibility.

> [!tip]
> Configure a **Global hotkey** in settings to allow triggering hint mode even when focus is inside a modal or a non-editor view that doesn't support standard Vim bindings.

> [!info]
> Hint mode fully supports popout windows. Labels will appear on elements within the active window.

See [[known-limitations#Workspace & hint mode]] for detailed technical limitations.
