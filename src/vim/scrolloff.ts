import type { App, Plugin } from 'obsidian';
import { MarkdownView } from 'obsidian';

function applyScrolloff(app: App, margin: number): void {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const cm = (view.editor as unknown as Record<string, unknown>).cm as
        | { scrollDOM?: HTMLElement }
        | undefined;
    if (cm?.scrollDOM) {
        cm.scrollDOM.style.scrollPaddingTop = `${margin}px`;
        cm.scrollDOM.style.scrollPaddingBottom = `${margin}px`;
    }
}

export function setupScrolloff(plugin: Plugin, app: App, lines: number): void {
    if (lines <= 0) return;
    const margin = lines * 22;

    plugin.registerEvent(
        app.workspace.on('active-leaf-change', () => {
            applyScrolloff(app, margin);
        }),
    );

    plugin.registerEvent(
        app.workspace.on('layout-change', () => {
            applyScrolloff(app, margin);
        }),
    );

    applyScrolloff(app, margin);
}
