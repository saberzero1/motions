import type { App, Scope } from 'obsidian';

export function pushKeymapScope(app: App, scope: Scope): void {
    app.keymap.pushScope(scope);
}

export function popKeymapScope(app: App, scope: Scope): void {
    app.keymap.popScope(scope);
}
