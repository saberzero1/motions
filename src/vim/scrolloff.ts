import type { App, EventRef, Plugin } from 'obsidian';
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

function clearScrolloff(app: App): void {
    applyScrolloff(app, 0);
}

export class ScrolloffManager {
    private eventRefs: EventRef[] = [];

    constructor(
        private plugin: Plugin,
        private app: App,
    ) {}

    setup(lines: number): void {
        this.teardown();

        if (lines <= 0) return;
        const margin = lines * 22;

        const leafRef = this.app.workspace.on('active-leaf-change', () => {
            applyScrolloff(this.app, margin);
        });
        this.plugin.registerEvent(leafRef);
        this.eventRefs.push(leafRef);

        const layoutRef = this.app.workspace.on('layout-change', () => {
            applyScrolloff(this.app, margin);
        });
        this.plugin.registerEvent(layoutRef);
        this.eventRefs.push(layoutRef);

        applyScrolloff(this.app, margin);
    }

    teardown(): void {
        for (const ref of this.eventRefs) {
            this.app.workspace.offref(ref);
        }
        this.eventRefs = [];
        clearScrolloff(this.app);
    }

    destroy(): void {
        this.teardown();
    }
}
