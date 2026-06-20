import { type NeovimClient } from './client';
import { getEditorValue, getCursorPos, getVimMode } from '../helpers';

export interface EditorState {
    content: string;
    cursor: { line: number; ch: number };
    mode: string;
}

export interface ComparisonResult {
    match: boolean;
    obsidian: EditorState;
    neovim: EditorState;
    diffs: string[];
}

export async function getObsidianState(): Promise<EditorState> {
    return {
        content: await getEditorValue(),
        cursor: await getCursorPos(),
        mode: await getVimMode(),
    };
}

export async function getNeovimState(nvim: NeovimClient): Promise<EditorState> {
    return {
        content: await nvim.getContent(),
        cursor: await nvim.getCursor(),
        mode: await nvim.getMode(),
    };
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
