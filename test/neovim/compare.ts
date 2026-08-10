import { type NeovimClient } from './client';
import {
    getEditorValue,
    getCursorPos,
    getVimMode,
    getRegisterContent,
} from '../helpers';
import { browser } from '@wdio/globals';

export interface RegisterState {
    text: string;
    linewise: boolean;
}

export interface EditorState {
    content: string;
    cursor: { line: number; ch: number };
    mode: string;
    registers?: Record<string, RegisterState>;
    visualMode?: 'charwise' | 'linewise' | 'blockwise' | null;
}

export interface ComparisonResult {
    match: boolean;
    obsidian: EditorState;
    neovim: EditorState;
    diffs: string[];
}

export async function getObsidianState(): Promise<EditorState> {
    const state: EditorState = {
        content: await getEditorValue(),
        cursor: await getCursorPos(),
        mode: await getVimMode(),
    };

    const reg = await getRegisterContent('"');
    if (reg) {
        state.registers = { '"': { text: reg.text, linewise: reg.linewise } };
    }

    const visualInfo = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return null;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const vim = (cm?.cm as Record<string, unknown> | undefined)?.state as
            | Record<string, unknown>
            | undefined;
        const vimState = vim?.vim as Record<string, unknown> | undefined;
        if (!vimState) return null;
        if (vimState.visualBlock) return 'blockwise';
        if (vimState.visualLine) return 'linewise';
        if (vimState.visualMode) return 'charwise';
        return null;
    })) as 'charwise' | 'linewise' | 'blockwise' | null;
    state.visualMode = visualInfo;

    return state;
}

export async function getNeovimState(nvim: NeovimClient): Promise<EditorState> {
    const state: EditorState = {
        content: await nvim.getContent(),
        cursor: await nvim.getCursor(),
        mode: await nvim.getMode(),
    };

    const regText = await nvim.getRegister('"');
    const regType = await nvim.getRegisterType('"');
    if (regText) {
        state.registers = {
            '"': { text: regText, linewise: regType === 'V' },
        };
    }

    const nvimMode = await nvim.getRawMode();
    if (nvimMode === 'v') state.visualMode = 'charwise';
    else if (nvimMode === 'V') state.visualMode = 'linewise';
    else if (nvimMode === '\x16') state.visualMode = 'blockwise';
    else state.visualMode = null;

    return state;
}

export function compareStates(
    obsidian: EditorState,
    neovim: EditorState,
): ComparisonResult {
    const diffs: string[] = [];
    if (obsidian.content !== neovim.content) {
        diffs.push(
            `content: obsidian=${JSON.stringify(obsidian.content)} neovim=${JSON.stringify(neovim.content)}`,
        );
    }
    if (
        obsidian.cursor.line !== neovim.cursor.line ||
        obsidian.cursor.ch !== neovim.cursor.ch
    ) {
        diffs.push(
            `cursor: obsidian=${JSON.stringify(obsidian.cursor)} neovim=${JSON.stringify(neovim.cursor)}`,
        );
    }
    if (obsidian.mode !== neovim.mode) {
        diffs.push(`mode: obsidian=${obsidian.mode} neovim=${neovim.mode}`);
    }
    return { match: diffs.length === 0, obsidian, neovim, diffs };
}
