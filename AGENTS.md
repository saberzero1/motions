# Obsidian community plugin

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.
- **codemirror-vim fork**: The plugin uses a fork of `@replit/codemirror-vim` at `~/Repos/codemirror-vim`. All core vim behavior changes go in the fork's `src/vim.js`. The fork has its own test suite (1628 browser tests) and Neovim golden comparison infrastructure (756 golden cases, 476 pass, 280 known deviations).
    - **IMPORTANT: dependency URL in `package.json`**: The `@replit/codemirror-vim` dependency MUST point to `https://github.com/saberzero1/codemirror-vim.git` (the remote URL) before committing. During local development, use `npm install ~/Repos/codemirror-vim` for fast iteration, but **always switch back to the HTTPS URL before committing** — `file:../codemirror-vim` breaks CI, the community scanner, and anyone cloning the repo. Check `git diff package.json package-lock.json` before every commit to verify no local path leaked.

### Dual-vim architecture

The plugin operates in two modes:

- **Built-in vim mode**: When Obsidian's vim mode is enabled (`Settings → Editor → Vim key bindings`), the plugin uses Obsidian's bundled codemirror-vim via `window.CodeMirrorAdapter.Vim`.
- **Bundled fork mode**: When built-in vim is disabled, the plugin registers the fork as a CM6 extension via `registerEditorExtension()` and installs a bridge at `window.CodeMirrorAdapter.Vim` so ecosystem plugins (obsidian-vimrc-support, vim-im-control, etc.) can still discover the Vim API at the canonical location.

Both modes expose an identical API surface. The fork provides additional capabilities: async motion support (for EasyMotion operator-pending), Neovim-correct cursor positioning, and various behavioral fixes.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
    ```
    src/
      main.ts           # Plugin entry point, lifecycle management
      settings.ts       # Settings interface and defaults
      commands/         # Command implementations
        command1.ts
        command2.ts
      ui/              # UI components, modals, views
        modal.ts
        view.ts
      utils/           # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts         # TypeScript interfaces and types
    ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

### Manual testing

- Copy `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/<plugin-id>/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

### Automated testing

- **Framework**: WebDriverIO v9 + Mocha, running against a real Obsidian instance via `wdio-obsidian-service`.
- **Run**: `npm run test:e2e` (requires Xvfb + herbstluftwm on Linux, or native display on macOS).
- **Coverage**: `npm run test:coverage` — reports command-level coverage from `test/neovim-command-index.yaml`.

**IMPORTANT: ChromeDriver version mismatch**

The e2e tests use Electron's built-in Chromium, and the system-installed ChromeDriver frequently mismatches the Electron/Chromium version bundled by Obsidian. This causes errors like `session not created: This version of ChromeDriver only supports Chrome version X` or similar WebDriver session failures.

**Fix**: Always run tests inside the Nix development shell:

```bash
nix develop
npm run test:e2e
```

The `flake.nix` in this repository (and in the `~/Repos/codemirror-vim` fork) pins compatible versions of ChromeDriver, Chromium, and other system dependencies. The same applies when running the fork's browser test suite — use `nix develop` there as well.

If you encounter ChromeDriver/Chromium mismatch errors, do **not** attempt to install or upgrade ChromeDriver globally. Use `nix develop` instead.

**Important: e2e test runtime**

The full e2e suite (`npm run test:e2e`) runs 79 spec files and takes approximately **22 minutes**. Each spec launches a fresh Obsidian instance. When running from an agent or script:

- Use a timeout of at least **1800000 ms** (30 minutes) to avoid premature termination.
- To run a subset, use `--spec` to target specific files:
    ```bash
    npx wdio run ./wdio.conf.mts --spec test/specs/vim-builtin/operator-combos.e2e.ts
    npx wdio run ./wdio.conf.mts --spec 'test/specs/vim-builtin/*.e2e.ts'
    ```
- The `test/specs/vim-builtin/` directory (~7 min) covers core Vim behavior and is the most relevant subset after fork changes.
- Individual spec files typically complete in 30–90 seconds.

### Neovim golden comparison

Tier 1 Vim commands are tested against a headless Neovim instance. The system records Neovim's output as golden JSON files; CI compares Obsidian's behavior against these without needing Neovim installed.

- **Golden files**: `test/neovim/golden-data/*.json` — committed to the repo, recorded against a pinned Neovim version.
- **Test definitions**: `test/neovim/test-definitions.ts` — single source of truth for test cases used by both golden recording and `testWithNeovim()` calls.
- **Deviation registry**: `test/neovim/deviations.ts` — known intentional differences between the plugin and Neovim. Each entry is a "feels different from Neovim" item; shrinking this list is the roadmap toward parity.
- **Record golden files**: `npm run test:neovim-record` (requires `nvim` binary).
- **Live comparison**: `NEOVIM_COMPARE=1 npm run test:e2e` (requires `nvim` binary).
- **Smoke test**: `npm run test:neovim-smoke` (requires `nvim` binary).

### Test file organization

- `test/specs/vim-builtin/` — Tier 1 tests (built-in CM Vim behavior). Use `testWithNeovim()` as primary format.
- `test/specs/` — Tier 2 tests (plugin features: text objects, navigation, workspace, operators, vimrc, settings).
- `test/specs/spikes/` — exploratory/R&D tests.
- `test/neovim/` — Neovim comparison infrastructure (client, compare, golden, deviations, wrapper, definitions, recording).
- `test/helpers.ts` — shared WDIO helpers (`setupEditor`, `vimKeys`, `vimRawKeys`, `getCursorPos`, `getEditorValue`, `getVimMode`, `getRegisterContent`).

### Writing new Tier 1 tests

Use `testWithNeovim()` — do not hand-write expected values for behavior Neovim can verify:

```typescript
testWithNeovim('suite-name', 'test description', {
    content: 'initial buffer content',
    cursor: { line: 0, ch: 0 },
    keys: ['keystroke-sequence'],
});
```

Add a matching entry in `test/neovim/test-definitions.ts` and re-record golden files with `npm run test:neovim-record`.

For viewport-dependent behavior (H/M/L, scroll, folds), use regular `it()` blocks — headless Neovim has no viewport to compare against.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Documentation maintenance

The documentation site at `saberzero1.github.io/motions` is built from `docs/` using Quartz v5. Documentation updates are part of the implementation — a feature or fix is not complete until its docs are updated.

### Change-to-page routing

When making a change, update these docs pages:

| Change type                       | Docs pages to update                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| New keybinding/motion             | `reference/keybindings.md` (canonical table) — feature pages transclude via `![[keybindings#Section]]`                                               |
| New text object                   | `reference/keybindings.md` § "Markdown text objects" + `features/text-objects.md`                                                                    |
| New ex command                    | `reference/keybindings.md` § "Ex commands" + `features/ex-commands.md`                                                                               |
| New setting                       | `configuration/settings.md` (add to correct group of 12)                                                                                             |
| New vimrc option                  | `configuration/vimrc.md` (add to correct options table)                                                                                              |
| New feature (entire)              | New `features/<name>.md` + `features/index.md` (add link) + `reference/keybindings.md` (add section) + `configuration/settings.md` (if new settings) |
| Bug fix                           | `KNOWN_LIMITATIONS.md` (mark Fixed if applicable) — `docs/reference/known-limitations.md` is auto-generated from this file in CI                     |
| New limitation                    | `KNOWN_LIMITATIONS.md` (add section) — `docs/reference/known-limitations.md` is auto-generated from this file in CI                                  |
| Setting default changed           | `configuration/settings.md` (update default value)                                                                                                   |
| Keybinding changed/removed        | `reference/keybindings.md` (update/remove) — feature pages auto-update via transclusion                                                              |
| Installation requirements changed | `getting-started/installation.md` + `getting-started/recommended-setup.md`                                                                           |
| CHANGELOG.md updated              | Nothing — auto-generated at build time by the docs workflow                                                                                          |

### Page ownership by feature area

| Feature area          | Canonical docs page                 | Settings group(s)                                             |
| --------------------- | ----------------------------------- | ------------------------------------------------------------- |
| Text objects          | `features/text-objects.md`          | Vim features (textobjects), Advanced (scanlimit)              |
| Structural navigation | `features/structural-navigation.md` | Vim features (navigation)                                     |
| Tables                | `features/tables.md`                | Vim features (tablenav, tablewidget)                          |
| Hard-wrap             | `features/hardwrap.md`              | Vim features (hardwrap), Vim engine (textwidth)               |
| EasyMotion            | `features/easymotion.md`            | Jump navigation (easymotion, dimming, labels, labelfontsize)  |
| Hint mode             | `features/hint-mode.md`             | Jump navigation (hintmode, hintlabels, hinthotkey)            |
| Workspace nav         | `features/workspace-navigation.md`  | Vim features (workspacenav)                                   |
| Surround              | `features/surround.md`              | (no settings — fork feature)                                  |
| Ex commands           | `features/ex-commands.md`           | (no settings — always enabled)                                |
| Quality of life       | `features/quality-of-life.md`       | Vim features (listcontinuation), Vim engine (clipboard, etc.) |
| Vimrc                 | `configuration/vimrc.md`            | Vimrc & key bindings                                          |
| Which-key             | `configuration/which-key.md`        | Which-key hints, group labels, command labels                 |
| Cursor shapes         | `configuration/cursor-shapes.md`    | Cursor shapes                                                 |
| Status bar            | `configuration/status-bar.md`       | Status bar, Vim mode display prompt                           |

### Transclusion conventions

- Keybinding tables are single-sourced in `reference/keybindings.md`. Feature pages transclude via `![[keybindings#Section Heading]]`.
- When adding a new keybinding section, add it to `reference/keybindings.md` with a `## Section Heading`. Feature pages can immediately transclude it.
- Never duplicate keybinding tables across pages manually — always transclude from the canonical source.

### Frontmatter requirements

Every page in `docs/` must have:

```yaml
---
title: Page Title # Sentence case
description: Brief desc # 1-2 sentences
tags: # From: getting-started, features, configuration, reference,
    - category-name #       keybindings, troubleshooting, guide, development
---
```

### Content style

- Keybindings in inline code: `` `]h` ``, `` `<C-w>v` ``
- Vim notation in inline code: `` `<leader>` ``, `` `<CR>` ``
- Settings paths bold with arrows: **Settings → Vim Motions → Jump navigation**
- Callout types: `[!tip]` (recommended), `[!info]` (fork-mode-only), `[!warning]` (conflicts), `[!bug]` (limitations)
- Internal links as wikilinks: `[[installation]]`, `[[settings#Vim engine]]`

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from 'obsidian';
import { MySettings, DEFAULT_SETTINGS } from './settings';
import { registerCommands } from './commands';

export default class MyPlugin extends Plugin {
    settings!: MySettings;

    async onload() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<MySettings>,
        );
        registerCommands(this);
    }
}
```

**settings.ts**:

```ts
export interface MySettings {
    enabled: boolean;
    apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
    enabled: true,
    apiKey: '',
};
```

**commands/index.ts**:

```ts
import { Plugin } from 'obsidian';
import { doSomething } from './my-command';

export function registerCommands(plugin: Plugin) {
    plugin.addCommand({
        id: 'do-something',
        name: 'Do something',
        callback: () => doSomething(plugin),
    });
}
```

### Add a command

```ts
this.addCommand({
    id: 'your-command-id',
    name: 'Do the thing',
    callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MySettings>);
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(
    this.app.workspace.on('file-open', (f) => {
        /* ... */
    }),
);
this.registerDomEvent(activeWindow, 'resize', () => {
    /* ... */
});
this.registerInterval(
    window.setInterval(() => {
        /* ... */
    }, 1000),
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
