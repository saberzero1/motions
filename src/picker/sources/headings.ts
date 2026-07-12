import { App, MarkdownView, Notice } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import { openInSplit } from './split-open';

interface HeadingItem {
    heading: string;
    level: number;
    line: number;
    path: string;
    filename: string;
}

function formatHeadingLabel(level: number, heading: string): string {
    const indent = '  '.repeat(Math.max(0, level - 1));
    return `${indent}${'#'.repeat(level)} ${heading}`;
}

function getOutlineHeadings(app: App): HeadingItem[] {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return [];

    const cache = app.metadataCache.getFileCache(view.file);
    if (cache?.headings) {
        return cache.headings.map((h) => ({
            heading: h.heading,
            level: h.level,
            line: h.position.start.line,
            path: view.file?.path ?? '',
            filename: view.file?.basename ?? '',
        }));
    }

    const editor = view.editor;
    const headings: HeadingItem[] = [];
    const lineCount = editor.lineCount();
    const headingRe = /^(#{1,6})\s+(.+)$/;
    for (let i = 0; i < lineCount; i++) {
        const match = editor.getLine(i).match(headingRe);
        if (match && match[1] && match[2]) {
            headings.push({
                heading: match[2],
                level: match[1].length,
                line: i,
                path: view.file?.path ?? '',
                filename: view.file?.basename ?? '',
            });
        }
    }
    return headings;
}

function getVaultHeadings(app: App): HeadingItem[] {
    const items: HeadingItem[] = [];
    for (const file of app.vault.getMarkdownFiles()) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.headings) continue;
        for (const heading of cache.headings) {
            items.push({
                heading: heading.heading,
                level: heading.level,
                line: heading.position.start.line,
                path: file.path,
                filename: file.basename,
            });
        }
    }
    return items;
}

function buildHeadingItems(headings: HeadingItem[], includeFilename: boolean) {
    return headings.map(
        (heading): PickerItem => ({
            id: `${heading.path}:${heading.line}:${heading.heading}`,
            label: formatHeadingLabel(heading.level, heading.heading),
            description: includeFilename ? heading.filename : undefined,
            filterValue: includeFilename
                ? `${heading.heading} ${heading.filename}`
                : heading.heading,
            data: { path: heading.path, line: heading.line },
        }),
    );
}

function jumpToLine(app: App, line: number): void {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
        view.editor.setCursor(line, 0);
        view.editor.focus();
    }
}

export function createHeadingsSource(): PickerSource {
    return {
        name: 'headings',
        placeholder: 'Search headings…',
        frecencySource: true,
        displayName: 'Search headings',
        icon: 'heading',
        description: 'Jump to any heading in the vault',
        priority: 4,
        items(app) {
            const headings = getVaultHeadings(app);
            return buildHeadingItems(headings, true);
        },
        onSelect(item, app) {
            const data = item.data as { path: string; line: number };
            void app.workspace
                .openLinkText(data.path, '')
                .then(() => jumpToLine(app, data.line));
        },
        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string; line: number };
            openInSplit(app, data.path, direction);
            window.setTimeout(() => jumpToLine(app, data.line), 100);
        },
        async preview(item, app) {
            const data = item.data as { path: string; line: number };
            return readLinesAroundPosition(app, data.path, data.line);
        },
    };
}

export function createOutlineSource(): PickerSource {
    return {
        name: 'outline',
        placeholder: 'Jump to heading…',
        frecencySource: true,
        displayName: 'Document outline',
        icon: 'list-tree',
        description: 'Jump to a heading in the current file',
        priority: 5,
        items(app) {
            const activeFile = app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active file');
                return [];
            }
            const headings = getOutlineHeadings(app);
            return buildHeadingItems(headings, false);
        },
        onSelect(item, app) {
            const data = item.data as { path: string; line: number };
            void app.workspace
                .openLinkText(data.path, '')
                .then(() => jumpToLine(app, data.line));
        },
        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string; line: number };
            openInSplit(app, data.path, direction);
            window.setTimeout(() => jumpToLine(app, data.line), 100);
        },
        async preview(item, app) {
            const data = item.data as { path: string; line: number };
            return readLinesAroundPosition(app, data.path, data.line);
        },
    };
}
