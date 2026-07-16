import { type App, MarkdownView, TFile, Notice } from 'obsidian';
import { getCmAdapter } from '../../vim/vim-api';
import type { MarkStore } from '../../vim/mark-store';
import { navigateWithJumpFile } from '../../workspace/navigate';

export interface MarkEntry {
    name: string;
    category: 'buffer' | 'global' | 'special';
    line: number;
    ch: number;
    filePath?: string;
    preview?: string;
}

export interface MarkProvider {
    getMarks(app: App): MarkEntry[] | Promise<MarkEntry[]>;
    navigateTo(mark: MarkEntry, app: App): void | Promise<void>;
}

export class VimBufferMarkProvider implements MarkProvider {
    getMarks(app: App): MarkEntry[] {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return [];
        const cm = getCmAdapter(view);
        if (!cm) return [];

        const marks = cm.state.vim?.marks;
        if (!marks) return [];

        const entries: MarkEntry[] = [];
        const bufferMarkRe = /^[a-z]$/;

        for (const name of Object.keys(marks).sort()) {
            if (!bufferMarkRe.test(name)) continue;
            const marker = marks[name];
            if (!marker) continue;
            const pos = marker.find();
            if (!pos) continue;

            const lineText = cm.getLine(pos.line);
            entries.push({
                name,
                category: 'buffer',
                line: pos.line,
                ch: pos.ch,
                preview: lineText ? lineText.slice(0, 60).trim() : '',
            });
        }

        return entries;
    }

    navigateTo(mark: MarkEntry, app: App): void {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            view.editor.setCursor(mark.line, mark.ch);
            view.editor.focus();
        }
    }
}

export class SpecialMarkProvider implements MarkProvider {
    private static readonly SPECIAL_MARKS = ["'", '.', '<', '>'];

    getMarks(app: App): MarkEntry[] {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return [];
        const cm = getCmAdapter(view);
        if (!cm) return [];

        const marks = cm.state.vim?.marks;
        if (!marks) return [];

        const entries: MarkEntry[] = [];
        for (const name of SpecialMarkProvider.SPECIAL_MARKS) {
            const marker = marks[name];
            if (!marker) continue;
            const pos = marker.find();
            if (!pos) continue;

            const lineText = cm.getLine(pos.line);
            entries.push({
                name,
                category: 'special',
                line: pos.line,
                ch: pos.ch,
                preview: lineText ? lineText.slice(0, 60).trim() : '',
            });
        }

        return entries;
    }

    navigateTo(mark: MarkEntry, app: App): void {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            view.editor.setCursor(mark.line, mark.ch);
            view.editor.focus();
        }
    }
}

export class GlobalMarkProvider implements MarkProvider {
    constructor(private store: MarkStore) {}

    getMarks(): MarkEntry[] {
        return this.store
            .getAll()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => ({
                name: m.name,
                category: 'global' as const,
                line: m.line,
                ch: m.ch,
                filePath: m.filePath,
            }));
    }

    async navigateTo(mark: MarkEntry, app: App): Promise<void> {
        if (!mark.filePath) return;
        const file = app.vault.getAbstractFileByPath(mark.filePath);
        if (!(file instanceof TFile)) {
            new Notice(`File not found: ${mark.filePath}`);
            return;
        }

        let targetLeaf: ReturnType<typeof app.workspace.getLeaf> | null = null;
        app.workspace.iterateAllLeaves((leaf) => {
            if (
                leaf.view instanceof MarkdownView &&
                leaf.view.file?.path === mark.filePath
            ) {
                targetLeaf = leaf;
            }
        });

        if (targetLeaf) {
            app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        } else {
            const leaf = app.workspace.getLeaf('tab');
            await navigateWithJumpFile(app, leaf, file);
            targetLeaf = leaf;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 50));

        if (targetLeaf) {
            const view = (targetLeaf as { view: unknown }).view;
            if (view instanceof MarkdownView) {
                view.editor.setCursor(mark.line, mark.ch);
                view.editor.focus();
            }
        }
    }
}
