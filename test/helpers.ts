import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

export const PAUSE = {
    KEY_GAP: 30,
    MODE_SWITCH: 50,
    EDITOR_SETTLE: 300,
    OBSIDIAN_LOAD: 500,
} as const;

export async function getEditorValue(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getValue() ?? '';
    })) as string;
}

export async function getSelection(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getSelection() ?? '';
    })) as string;
}

export async function getCursorLine(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getCursor().line ?? -1;
    })) as number;
}

export async function getCursorPos(): Promise<{ line: number; ch: number }> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cursor = view?.editor.getCursor();
        return { line: cursor?.line ?? -1, ch: cursor?.ch ?? -1 };
    })) as { line: number; ch: number };
}

export async function getVimMode(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 'unknown';
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const state = cm?.state as Record<string, unknown> | undefined;
        const vim = state?.vim as Record<string, unknown> | undefined;
        if (vim?.insertMode) return 'insert';
        if (vim?.visualMode) return 'visual';
        return 'normal';
    })) as string;
}

export async function getRegisterContent(
    register: string,
): Promise<{ text: string; linewise: boolean } | null> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, registerName: string) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getRegisterController: () => {
                                registers: Record<
                                    string,
                                    {
                                        toString: () => string;
                                        linewise: boolean;
                                    }
                                >;
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return null;
            const rc = Vim.getRegisterController();
            const reg = rc.registers[registerName];
            if (!reg) return null;
            return { text: reg.toString(), linewise: reg.linewise };
        },
        register,
    )) as { text: string; linewise: boolean } | null;
}

export async function setupEditor(
    content: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, text: string, line: number, ch: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(text);
            view.editor.setCursor(line, ch);
            view.editor.focus();
        },
        content,
        cursor.line,
        cursor.ch,
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

export async function vimKeys(...keys: string[]): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    for (const key of keys) {
        await browser.keys([key]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE - PAUSE.KEY_GAP);
}

export async function vimRawKeys(keys: string): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    for (const ch of keys) {
        const code = ch.charCodeAt(0);
        if (code === 0x1b) {
            await browser.keys(['Escape']);
        } else if (code < 0x20) {
            await browser.executeObsidian(
                ({ app, obsidian }, keyStr: string) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return;
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm as
                        | Record<string, unknown>
                        | undefined;
                    if (!adapter) return;
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleKey: (
                                        cm: unknown,
                                        key: string,
                                    ) => boolean;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return;
                    Vim.handleKey(adapter, keyStr);
                },
                `<C-${String.fromCharCode(code + 0x60)}>`,
            );
        } else if (ch === '\n') {
            await browser.keys(['Enter']);
        } else {
            await browser.keys([ch]);
        }
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE - PAUSE.KEY_GAP);
}

export async function loadSingleFileWorkspace(
    filePath = 'Welcome.md',
): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'test-main',
            type: 'split',
            children: [
                {
                    id: 'test-tabs',
                    type: 'tabs',
                    children: [
                        {
                            id: 'test-leaf',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: filePath, mode: 'source' },
                            },
                        },
                    ],
                },
            ],
            direction: 'vertical',
        },
        active: 'test-leaf',
        lastOpenFiles: [],
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

export function unsupported(
    description: string,
    reason: string,
    fn: () => Promise<void>,
): void {
    it.skip(`[UNSUPPORTED] ${description} — ${reason}`, fn);
}

export function deviation(
    description: string,
    neovimBehavior: string,
    fn: () => Promise<void>,
): void {
    it(`[DEVIATION] ${description} (Neovim: ${neovimBehavior})`, fn);
}
