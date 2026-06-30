const BUILTIN_EX_COMMANDS = [
    'substitute',
    's',
    'nohlsearch',
    'noh',
    'delmarks',
    'global',
    'g',
    'sort',
    'yank',
    'y',
    'normal',
    'norm',
    'registers',
    'reg',
    'marks',
];

export class ExCommandSuggest {
    private observer: MutationObserver | null = null;
    private suggestEl: HTMLElement | null = null;
    private commands: string[] = [];
    private selectedIdx = -1;
    private items: string[] = [];
    private editorContainer: HTMLElement | null = null;

    constructor(commands: string[]) {
        this.commands = [
            ...new Set([...commands, ...BUILTIN_EX_COMMANDS]),
        ].sort();
    }

    attach(container: HTMLElement): void {
        this.editorContainer = container;
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of Array.from(mutation.addedNodes)) {
                    if (
                        (node as HTMLElement).classList?.contains(
                            'cm-vim-panel',
                        )
                    ) {
                        this.onPanelOpen(node as HTMLElement);
                    }
                }
                for (const node of Array.from(mutation.removedNodes)) {
                    if (
                        (node as HTMLElement).classList?.contains(
                            'cm-vim-panel',
                        )
                    ) {
                        this.dismiss();
                    }
                }
            }
        });
        this.observer.observe(container, { childList: true, subtree: true });
    }

    destroy(): void {
        this.observer?.disconnect();
        this.observer = null;
        this.dismiss();
    }

    private onPanelOpen(panel: HTMLElement): void {
        const input = panel.querySelector('input');
        if (!input) return;

        input.addEventListener('input', () => {
            this.updateSuggestions(input);
        });

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (!this.suggestEl) return;

            if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                if (this.items.length > 0) {
                    this.selectedIdx =
                        (this.selectedIdx + 1) % this.items.length;
                    this.renderSelected();
                    const item = this.items[this.selectedIdx];
                    if (item) input.value = item;
                }
            } else if (e.key === 'Escape') {
                this.dismiss();
            }
        });
    }

    private updateSuggestions(input: HTMLInputElement): void {
        const value = input.value.trim();
        if (!value) {
            this.dismiss();
            return;
        }

        this.items = this.commands.filter(
            (cmd) => cmd.startsWith(value) && cmd !== value,
        );
        this.selectedIdx = -1;

        if (this.items.length === 0) {
            this.dismiss();
            return;
        }

        this.showSuggest(input);
    }

    private showSuggest(input: HTMLInputElement): void {
        this.dismiss();

        const panel = input.closest('.cm-vim-panel');
        if (!panel) return;

        this.suggestEl = createDiv({ cls: 'vim-motions-ex-suggest' });

        for (let i = 0; i < this.items.length && i < 10; i++) {
            const item = this.items[i];
            if (!item) continue;
            const row = this.suggestEl.createDiv({
                cls: 'vim-motions-ex-suggest-item',
                text: item,
            });
            if (i === this.selectedIdx) {
                row.addClass('is-selected');
            }
        }

        panel.parentElement?.appendChild(this.suggestEl);
    }

    private renderSelected(): void {
        if (!this.suggestEl) return;
        const rows = this.suggestEl.querySelectorAll(
            '.vim-motions-ex-suggest-item',
        );
        rows.forEach((row, i) => {
            row.classList.toggle('is-selected', i === this.selectedIdx);
        });
    }

    private dismiss(): void {
        this.suggestEl?.remove();
        this.suggestEl = null;
        this.selectedIdx = -1;
        this.items = [];
    }
}
