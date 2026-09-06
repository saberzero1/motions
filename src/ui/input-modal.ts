import { App, Modal } from 'obsidian';

export class InputModal extends Modal {
    private resolved = false;
    private inputEl!: HTMLInputElement;

    constructor(
        app: App,
        private readonly prompt: string,
        private readonly defaultText: string,
        private readonly resolve: (value: string | null) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('vim-motions-input-modal');

        if (this.prompt) {
            contentEl.createEl('label', {
                text: this.prompt,
                cls: 'vim-motions-input-modal-label',
            });
        }

        this.inputEl = contentEl.createEl('input', {
            type: 'text',
            value: this.defaultText,
            cls: 'vim-motions-input-modal-input',
        });

        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
            }
        });

        window.setTimeout(() => this.inputEl.focus(), 50);
    }

    private submit(): void {
        if (this.resolved) return;
        this.resolved = true;
        const value = this.inputEl.value;
        this.close();
        this.resolve(value);
    }

    private cancel(): void {
        if (this.resolved) return;
        this.resolved = true;
        this.close();
        this.resolve(null);
    }

    onClose(): void {
        if (!this.resolved) {
            this.resolved = true;
            this.resolve(null);
        }
        this.contentEl.empty();
    }
}

export function showInputModal(
    app: App,
    prompt: string,
    defaultText: string,
): Promise<string | null> {
    return new Promise((resolve) => {
        const modal = new InputModal(app, prompt, defaultText, resolve);
        modal.open();
    });
}
