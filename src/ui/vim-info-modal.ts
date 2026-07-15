import { App, Modal } from 'obsidian';

interface Column {
    header: string;
}

export class VimInfoModal extends Modal {
    private title: string;
    private columns: Column[];
    private rows: string[][];

    constructor(app: App, title: string, columns: Column[], rows: string[][]) {
        super(app);
        this.title = title;
        this.columns = columns;
        this.rows = rows;
    }

    onOpen(): void {
        const { contentEl } = this;
        if (contentEl.parentElement) {
            contentEl.parentElement.addClass(
                'vim-motions-info-modal-container',
            );
        }
        contentEl.addClass('vim-motions-info-modal');
        contentEl.createSpan({
            text: this.title,
            cls: 'vim-motions-info-modal-title',
        });
        const innerEl = contentEl.createDiv({
            cls: 'vim-motions-info-modal-inner',
        });

        if (this.rows.length === 0) {
            innerEl.createEl('p', { text: 'Nothing to show.' });
            return;
        }

        const table = innerEl.createEl('table');
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        for (const col of this.columns) {
            headerRow.createEl('th', { text: col.header });
        }

        const tbody = table.createEl('tbody');
        for (const row of this.rows) {
            const tr = tbody.createEl('tr');
            for (const cell of row) {
                tr.createEl('td', { text: cell });
            }
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
