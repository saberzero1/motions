import { MarkdownView, Notice } from 'obsidian';
import type { VimApi } from '../../types/vim-api';
import type { PickerItem, PickerSource } from '../types';

export function createRegistersSource(vim: VimApi): PickerSource {
    return {
        name: 'registers',
        placeholder: 'Select register…',
        displayName: 'Registers',
        icon: 'clipboard',
        description: 'View vim register contents',
        priority: 10,
        items() {
            const rc = vim.getRegisterController();
            const items: PickerItem[] = [];

            const sortedNames = Object.keys(rc.registers).sort((a, b) => {
                const order = (c: string) => {
                    if (c === '"') return 0;
                    if (c >= '0' && c <= '9') return 1;
                    if (c >= 'a' && c <= 'z') return 2;
                    if (c >= 'A' && c <= 'Z') return 3;
                    return 4;
                };
                return order(a) - order(b) || a.localeCompare(b);
            });

            for (const name of sortedNames) {
                const reg = rc.registers[name];
                if (!reg) continue;
                const text = reg.toString();
                if (!text) continue;

                const typeLabel = reg.linewise
                    ? 'linewise'
                    : reg.blockwise
                      ? 'blockwise'
                      : 'charwise';

                const display =
                    text.length > 80 ? text.slice(0, 80) + '\u2026' : text;

                items.push({
                    id: name,
                    label: `"${name}`,
                    description: `${display}  [${typeLabel}]`,
                    filterValue: `${name} ${display}`,
                    data: { name, content: text },
                });
            }

            return items;
        },
        onSelect(item, app) {
            const data = item.data as { name: string; content: string };
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                view.editor.replaceSelection(data.content);
                view.editor.focus();
            } else {
                void navigator.clipboard.writeText(data.content).then(() => {
                    new Notice('Copied register content to clipboard');
                });
            }
        },
        preview(item) {
            const data = item.data as { name: string; content: string };
            return data.content;
        },
    };
}
