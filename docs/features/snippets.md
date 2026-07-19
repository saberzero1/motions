---
title: Snippets
description: VS Code-compatible snippet expansion with tabstops, linked mirrors, variable resolution, choice nodes, and context-aware filtering.
tags:
    - features
    - keybindings
---

Snippets let you insert reusable text templates with interactive fields. Type a trigger prefix and press `Tab` to expand — cursor jumps between editable placeholders. The system supports the VS Code/LSP snippet format, ships with 60+ Obsidian-adapted templates, and can be extended with user-defined JSON files or a Lua DSL.

## Trigger mechanisms

Snippets can be triggered three ways, controlled by the **Trigger mode** setting:

| Trigger             | How it works                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Tab expansion**   | Type the snippet prefix in insert mode, press `Tab`. The prefix is replaced with the expanded template. |
| **Completion menu** | As you type, matching snippets appear in the CM6 autocomplete popup. Select one to expand.              |
| **Ex command**      | `:snippet <name>` expands by snippet name. `:snippets` opens the picker.                                |

The picker (`:snippets`) provides fuzzy search across all loaded snippets with a preview pane showing the expanded body.

## Tabstop navigation

After expansion, the cursor lands on the first tabstop. Navigate between fields:

| Key         | Action                   |
| ----------- | ------------------------ |
| `Tab`       | Move to next tabstop     |
| `Shift+Tab` | Move to previous tabstop |
| `Escape`    | Exit snippet mode        |

**Linked mirrors**: When the same tabstop number appears multiple times in a template, editing one updates all instances simultaneously.

## Bundled snippets

The plugin ships with Obsidian-specific snippets (enabled by default, toggle in settings):

### Markdown formatting

| Prefix    | Name            | Output                                  |
| --------- | --------------- | --------------------------------------- |
| `h1`–`h6` | Headings        | `# Heading` through `###### Heading`    |
| `bold`    | Bold            | `**text**`                              |
| `italic`  | Italic          | `*text*`                                |
| `bi`      | Bold italic     | `***text***`                            |
| `strike`  | Strikethrough   | `~~text~~`                              |
| `hl`      | Highlight       | `==text==`                              |
| `ic`      | Inline code     | `` `code` ``                            |
| `cb`      | Code block      | Fenced code block with language tabstop |
| `link`    | Link            | `[text](url)`                           |
| `img`     | Image           | `![alt](url)`                           |
| `quote`   | Blockquote      | `> text`                                |
| `hr`      | Horizontal rule | `---`                                   |

### Lists and tasks

| Prefix | Name           | Output               |
| ------ | -------------- | -------------------- |
| `ol`   | Ordered list   | Three numbered items |
| `ul`   | Unordered list | Three bullet items   |
| `task` | Task           | `- [ ] task`         |

### Obsidian-specific

| Prefix    | Name                | Output                                  |
| --------- | ------------------- | --------------------------------------- |
| `wl`      | Wikilink            | `[[page]]`                              |
| `wla`     | Wikilink with alias | `[[page\|alias]]`                       |
| `embed`   | Embed               | `![[file]]`                             |
| `comment` | Comment             | `%%comment%%`                           |
| `fm`      | Frontmatter         | YAML frontmatter with title, date, tags |
| `math`    | Math block          | Display math `$$..$$`                   |
| `im`      | Inline math         | Inline math `$...$`                     |
| `table`   | Table 2×2           | Two-column table with header            |
| `table3`  | Table 3×3           | Three-column table with header          |

### Callouts

All Obsidian callout types are available with a `c` prefix:

`cnote`, `cabstract`, `csummary`, `ctldr`, `cinfo`, `ctodo`, `ctip`, `chint`, `cimportant`, `csuccess`, `ccheck`, `cdone`, `cquestion`, `chelp`, `cfaq`, `cwarning`, `ccaution`, `cattention`, `cfailure`, `cfail`, `cmissing`, `cdanger`, `cerror`, `cbug`, `cexample`, `cquote`, `ccite`

Each expands to `> [!type] Title` with tabstops on the title and content.

### Date and utility

| Prefix     | Name          | Output                |
| ---------- | ------------- | --------------------- |
| `date`     | Date (ISO)    | `2026-07-13`          |
| `datel`    | Date (long)   | `July 13, 2026`       |
| `time`     | Time          | `14:30:00`            |
| `datetime` | Date and time | `2026-07-13 14:30:00` |
| `diso`     | ISO 8601      | `2026-07-13T14:30:00` |
| `uuid`     | UUID v4       | Random UUID           |

## User-defined snippets

Point the **Snippet directory** setting to a folder containing `.json` files in VS Code snippet format:

```json
{
    "My Snippet": {
        "prefix": "mysnip",
        "body": ["Hello ${1:World}!", "$0"],
        "description": "A greeting snippet"
    }
}
```

User snippets override bundled snippets when they share the same prefix. The directory supports absolute paths (with `~` expansion) and vault-relative paths.

### Snippet body syntax

| Syntax             | Description                            |
| ------------------ | -------------------------------------- |
| `$1`, `$2`         | Tabstops (navigate with Tab/Shift+Tab) |
| `$0`               | Final cursor position                  |
| `${1:default}`     | Tabstop with default text              |
| `${1\|a,b,c\|}`    | Choice node (cycle with Ctrl+N/Ctrl+P) |
| `${1:${2:nested}}` | Nested placeholders                    |
| `$CURRENT_YEAR`    | Variable (resolved at expansion)       |

### Supported variables

| Variable              | Value                              |
| --------------------- | ---------------------------------- |
| `$CURRENT_YEAR`       | Full year (e.g. `2026`)            |
| `$CURRENT_MONTH`      | Month 01–12                        |
| `$CURRENT_DATE`       | Day 01–31                          |
| `$CURRENT_HOUR`       | Hour 00–23                         |
| `$CURRENT_MINUTE`     | Minute 00–59                       |
| `$CURRENT_SECOND`     | Second 00–59                       |
| `$CURRENT_DAY_NAME`   | Weekday name (e.g. `Monday`)       |
| `$CURRENT_MONTH_NAME` | Month name (e.g. `July`)           |
| `$TM_FILENAME`        | Current filename with extension    |
| `$TM_FILENAME_BASE`   | Current filename without extension |
| `$TM_FILEPATH`        | Full vault path                    |
| `$TM_DIRECTORY`       | Parent directory path              |
| `$CLIPBOARD`          | Clipboard contents                 |
| `$UUID`               | Random UUID v4                     |
| `$RANDOM`             | 6-digit random number              |
| `$RANDOM_HEX`         | 6-digit random hex                 |

### Context filtering

Snippets can be restricted to specific editing contexts with the `"context"` field:

```json
{
    "JS Function": {
        "prefix": "fn",
        "body": ["function ${1:name}(${2:args}) {", "\t$0", "}"],
        "context": "code:js"
    }
}
```

| Context value   | Active when cursor is in                                |
| --------------- | ------------------------------------------------------- |
| `"prose"`       | Normal markdown text (not in code block or frontmatter) |
| `"code:*"`      | Any fenced code block                                   |
| `"code:js"`     | A ` ```js ` code block (language-specific)              |
| `"frontmatter"` | YAML frontmatter block                                  |
| _(omitted)_     | Available everywhere                                    |

## Lua snippet DSL

Define snippets in `.obsidian.init.lua` using a LuaSnip-inspired DSL:

```lua
local s = vim.snippet.s
local t = vim.snippet.t
local i = vim.snippet.i
local c = vim.snippet.c
local fmt = vim.snippet.fmt

-- Simple snippet
vim.snippet.add("greet", s("Greeting", {
    t("Hello, "), i(1, "world"), t("!")
}))

-- Using fmt (most common pattern)
vim.snippet.add("fn", s("Function", fmt([[
function {}({})
    {}
end
]], { i(1, "name"), i(2, "args"), i(0) })))

-- With choices
vim.snippet.add("log", s("Console Log", {
    t("console."), c(1, { t("log"), t("warn"), t("error") }),
    t("("), i(2, "msg"), t(")"),
}))

-- With context
vim.snippet.add("ret", s("Return", {
    t("return "), i(1),
}, { context = "code:*" }))
```

### DSL functions

| Function                              | Description                                                   |
| ------------------------------------- | ------------------------------------------------------------- |
| `vim.snippet.s(name, nodes, opts?)`   | Define a snippet                                              |
| `vim.snippet.t(text)`                 | Static text node                                              |
| `vim.snippet.i(index, default?)`      | Editable tabstop                                              |
| `vim.snippet.c(index, choices)`       | Choice node (list of `t()` nodes)                             |
| `vim.snippet.rep(index)`              | Mirror/repeat a tabstop                                       |
| `vim.snippet.fmt(str, nodes, opts?)`  | Format string with `{}` placeholders                          |
| `vim.snippet.f(fn, deps)`             | Function node — computes text from dependency field values    |
| `vim.snippet.d(index, fn, deps)`      | Dynamic node — generates sub-snippet based on field values    |
| `vim.snippet.sn(index, nodes, opts?)` | Snippet node — wraps nodes for use as `d()` return value      |
| `vim.snippet.r(index, type_name?)`    | Restore node — preserves user input across `d()` regeneration |
| `vim.snippet.add(trigger, snippet)`   | Register a snippet                                            |
| `vim.snippet.add_all(table)`          | Register multiple snippets                                    |

Static snippets (`t`, `i`, `c`, `rep`, `fmt`) compile to VS Code JSON at load time. Dynamic snippets (`f`, `d`, `r`) execute Lua functions reactively during snippet editing.

### Dynamic snippets

Dynamic snippets update in real time as you edit fields.

**`f()` — function node**: Computes text from other field values. Updates automatically when dependency fields change.

```lua
vim.snippet.add("mirror", s("Mirror", {
    i(1, "hello"),
    t(" → "),
    f(function(args) return string.upper(args[1]) end, { 1 }),
}))
-- Typing "world" in field 1 → output: "world → WORLD"
```

**`d()` — dynamic node**: Generates an entire sub-snippet based on field values. Regenerates when dependencies change.

```lua
vim.snippet.add("list", s("List", {
    i(1, "3"),
    d(2, function(args)
        local n = tonumber(args[1]) or 1
        local nodes = {}
        for j = 1, n do
            table.insert(nodes, t("\n- "))
            table.insert(nodes, i(j, "item " .. j))
        end
        return sn(nil, nodes)
    end, { 1 }),
}))
-- Typing "3" in field 1 → generates 3 editable list items
```

**`r()` — restore node**: Used inside `d()` to preserve user edits when the dynamic node regenerates.

```lua
d(2, function(args, parent, old_state)
    return sn(nil, {
        t("\n"),
        i(1, "editable"),  -- restored from old_state if available
    }, { stored = old_state })
end, { 1 })
```

> [!info] Dynamic snippets have a 50ms debounce on recomputation to avoid UI jank. Lua functions are time-guarded at 100ms — if a function exceeds this limit, recomputation is skipped for that cycle.

## Settings

**Settings → Vim Motions → Snippets**

| Setting           | Default   | Description                                 |
| ----------------- | --------- | ------------------------------------------- |
| Enable snippets   | `true`    | Master toggle for snippet expansion         |
| Bundled snippets  | `true`    | Include built-in Obsidian markdown snippets |
| Snippet directory | _(empty)_ | Path to user snippet JSON directory         |
| Trigger mode      | `both`    | `completion`, `tab`, or `both`              |

### Vimrc options

```vim
set snippets        " Enable/disable snippets (boolean)
set snippetbundled  " Enable/disable bundled snippets (boolean)
set snippetdir=path " Set user snippet directory
set snippettrigger=both " Set trigger mode (completion/tab/both)
```
