export class MarkdownView {}
export class App {
    vault = {
        getFiles: () => [],
        configDir: '.obsidian',
    };
}
export class Notice {
    constructor(_msg: string) {}
}
export class Plugin {}
export class PluginSettingTab {}
const stubElement = { addClass: () => {} } as unknown as HTMLElement;

export class Setting {
    settingEl = stubElement;
    constructor(_containerEl?: HTMLElement) {}
    setName(_name: string) {
        return this;
    }
    setHeading() {
        return this;
    }
    setDesc(_desc: string) {
        return this;
    }
    addToggle(_cb: (toggle: unknown) => void) {
        return this;
    }
    addDropdown(_cb: (dropdown: unknown) => void) {
        return this;
    }
    addText(_cb: (text: unknown) => void) {
        return this;
    }
}
export class SuggestModal<T> {
    constructor(_app: App) {}
    setPlaceholder(_text: string) {}
}
export class TextComponent {
    inputEl = {} as HTMLInputElement;
}
export class AbstractInputSuggest<T> {
    app: App;
    constructor(app: App, _inputEl: HTMLInputElement) {
        this.app = app;
    }
    setValue(_value: string) {}
    close() {}
}
export class TFile {
    path = '';
}
export function setIcon(_el: HTMLElement, _icon: string): void {}
export const Platform = {
    isMacOS: false,
    isLinux: true,
    isWin: false,
    isMobile: false,
    isDesktop: true,
    isDesktopApp: true,
    isIosApp: false,
    isAndroidApp: false,
};

export function prepareFuzzySearch(
    query: string,
): (text: string) => { score: number; matches: [number, number][] } | null {
    const lower = query.toLowerCase();
    return (text: string) => {
        const textLower = text.toLowerCase();
        const matches: [number, number][] = [];
        let qi = 0;
        for (let ti = 0; ti < textLower.length && qi < lower.length; ti++) {
            if (textLower[ti] === lower[qi]) {
                const start = ti;
                while (
                    ti < textLower.length &&
                    qi < lower.length &&
                    textLower[ti] === lower[qi]
                ) {
                    ti++;
                    qi++;
                }
                matches.push([start, ti]);
                ti--;
            }
        }
        if (qi < lower.length) return null;
        const score = matches.length > 0 ? -matches.length : 0;
        return { score, matches };
    };
}

export function prepareSimpleSearch(
    query: string,
): (text: string) => { score: number; matches: [number, number][] } | null {
    return prepareFuzzySearch(query);
}
