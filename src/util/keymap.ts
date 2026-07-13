import type { App, Scope } from 'obsidian';

export function pushKeymapScope(app: App, scope: Scope): void {
    (app.keymap as unknown as { pushScope(s: Scope): void }).pushScope(scope);
}

export function popKeymapScope(app: App, scope: Scope): void {
    (app.keymap as unknown as { popScope(s: Scope): void }).popScope(scope);
}
