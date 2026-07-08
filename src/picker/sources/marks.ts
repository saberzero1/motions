import { MarkdownView } from 'obsidian';
import { getCmAdapter } from '../../vim/vim-api';
import type { PickerItem, PickerSource } from '../types';
import { readLinesAroundPosition } from './preview-utils';

export function createMarksSource(): PickerSource {
    return {
        name: 'marks',
        placeholder: 'Jump to mark…',
        items(app) {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return [];

            const cm = getCmAdapter(view);
            if (!cm) return [];

            const marks = cm.state.vim?.marks ?? {};
            const sortedNames = Object.keys(marks).sort();
            const items: PickerItem[] = [];

            for (const name of sortedNames) {
                const marker = marks[name];
                if (!marker) continue;
                const pos = marker.find();
                if (!pos) continue;

                const line = pos.line + 1;
                const col = pos.ch;
                const lineText = cm.getLine(pos.line);
                const preview = lineText ? lineText.slice(0, 60).trim() : '';

                items.push({
                    id: name,
                    label: name,
                    description: `L${line}:${col}  ${preview}`,
                    filterValue: `${name} ${preview}`,
                    data: { line: pos.line, ch: pos.ch },
                });
            }

            return items;
        },
        onSelect(item, app) {
            const data = item.data as { line: number; ch: number };
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                view.editor.setCursor(data.line, data.ch);
                view.editor.focus();
            }
        },
        async preview(item, app) {
            const data = item.data as { line: number; ch: number };
            const path = app.workspace.getActiveFile()?.path;
            if (!path) return null;
            return readLinesAroundPosition(app, path, data.line);
        },
    };
}
