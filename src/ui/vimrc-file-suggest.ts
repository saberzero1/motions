import { AbstractInputSuggest, type App, TFile } from 'obsidian';

export class VimrcFileSuggest extends AbstractInputSuggest<TFile> {
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    getSuggestions(query: string): TFile[] {
        const lower = query.toLowerCase();
        return this.app.vault
            .getFiles()
            .filter(
                (f) =>
                    f.path.toLowerCase().endsWith('.vimrc') &&
                    f.path.toLowerCase().includes(lower),
            );
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFile): void {
        this.setValue(file.path);
        this.close();
    }
}
