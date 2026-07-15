import { App, MarkdownView, SuggestModal } from 'obsidian';
import type { ActionFn } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';
import { executeCommand, getCommandRegistry } from '../util/commands';

interface CommandItem {
    id: string;
    name: string;
}

const HEADING_COMMANDS = [
    'editor:toggle-fold',
    'bookmarks:bookmark-current-heading',
];

const CHECKBOX_COMMANDS = ['editor:cycle-list-checklist'];

const LIST_COMMANDS = [
    'editor:cycle-list-checklist',
    'editor:indent-list',
    'editor:unindent-list',
];

const TABLE_COMMANDS = ['editor:context-menu'];

const QUOTE_COMMANDS = ['editor:clear-formatting'];

const ALWAYS_COMMANDS = [
    'editor:toggle-bold',
    'editor:toggle-italic',
    'editor:toggle-code',
    'editor:toggle-strikethrough',
    'editor:toggle-highlight',
    'editor:insert-link',
    'editor:insert-callout',
    'editor:toggle-fold',
    'editor:delete-paragraph',
    'editor:context-menu',
];

function detectContext(lineText: string): string[] {
    const commands: string[] = [];

    if (/^#{1,6}\s/.test(lineText)) {
        commands.push(...HEADING_COMMANDS);
    } else if (/^\s*-\s\[[ x]\]/.test(lineText)) {
        commands.push(...CHECKBOX_COMMANDS);
    } else if (/^\s*[-*+]\s/.test(lineText)) {
        commands.push(...LIST_COMMANDS);
    } else if (/^\s*\|/.test(lineText)) {
        commands.push(...TABLE_COMMANDS);
    } else if (/^\s*>/.test(lineText)) {
        commands.push(...QUOTE_COMMANDS);
    }

    commands.push(...ALWAYS_COMMANDS);

    return [...new Set(commands)];
}

class ContextActionsModal extends SuggestModal<CommandItem> {
    private items: CommandItem[];

    constructor(app: App, items: CommandItem[]) {
        super(app);
        this.items = items;
        this.setPlaceholder('Run action\u2026');
        this.setInstructions([
            { command: 'Enter', purpose: 'run' },
            { command: 'Esc', purpose: 'cancel' },
        ]);
        const { modalEl } = this;
        modalEl.addClass('vim-motions-prompt-modal-container');
        const childEls = modalEl.children;
        if (childEls.length === 3) {
            const input = childEls[0];
            const results = childEls[1];
            const instructions = childEls[2];
            if (input) {
                input.addClass('vim-motions-prompt-modal-input');
                input.createSpan({
                    text: 'Actions',
                    cls: 'vim-motions-prompt-modal-title',
                });
            }
            if (results) {
                results.addClass('vim-motions-prompt-modal-results');
            }
            if (instructions) {
                instructions.addClass('vim-motions-prompt-modal-instructions');
            }
        }
    }

    getSuggestions(query: string): CommandItem[] {
        const lower = query.toLowerCase();
        return this.items.filter(
            (item) =>
                item.name.toLowerCase().includes(lower) ||
                item.id.toLowerCase().includes(lower),
        );
    }

    renderSuggestion(item: CommandItem, el: HTMLElement): void {
        el.createDiv({
            text: item.name,
            cls: 'vim-motions-prompt-modal-suggestion-label',
        });
        el.createDiv({
            text: item.id,
            cls: 'vim-motions-prompt-modal-suggestion-description',
        });
    }

    onChooseSuggestion(item: CommandItem): void {
        executeCommand(this.app, item.id);
    }
}

export function createContextActionsAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;

        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line);
        const commandIds = detectContext(lineText);

        const allCommands = getCommandRegistry(app);

        const items: CommandItem[] = [];
        for (const id of commandIds) {
            const cmd = allCommands[id];
            if (cmd) {
                items.push({ id: cmd.id, name: cmd.name });
            }
        }

        if (items.length === 0) return;

        new ContextActionsModal(app, items).open();
    };
}
