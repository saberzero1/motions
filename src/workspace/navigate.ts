import {
    MarkdownView,
    type App,
    type TFile,
    type WorkspaceLeaf,
} from 'obsidian';
import { JumpList, type JumpEntry } from '../vim/jumplist';
import { getCmAdapter } from '../vim/vim-api';
import { executeCommand } from '../util/commands';

let jumpListInstance: JumpList | null = null;

export function setJumpListInstance(jumpList: JumpList | null): void {
    jumpListInstance = jumpList;
}

export function getJumpListInstance(): JumpList | null {
    return jumpListInstance;
}

export function getCurrentJumpEntry(app: App): JumpEntry | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const filePath = view?.file?.path ?? app.workspace.getActiveFile()?.path;
    if (!filePath) return null;
    const cm = view ? getCmAdapter(view) : null;
    if (!cm) return { filePath, line: 0, ch: 0 };
    const cursor = cm.getCursor();
    return { filePath, line: cursor.line, ch: cursor.ch };
}

function clampCursorInView(view: MarkdownView, line: number, ch: number): void {
    const maxLine = view.editor.lineCount() - 1;
    const safeLine = Math.min(line, Math.max(0, maxLine));
    const maxCol = view.editor.getLine(safeLine).length;
    const safeCh = Math.min(ch, Math.max(0, maxCol));
    view.editor.setCursor(safeLine, safeCh);
    view.editor.focus();
}

async function applyCursorAfterNavigation(
    app: App,
    line?: number,
    ch?: number,
): Promise<void> {
    if (line === undefined && ch === undefined) return;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    clampCursorInView(view, line ?? 0, ch ?? 0);
}

function recordCrossNoteJump(
    jumpList: JumpList,
    source: JumpEntry,
    dest: JumpEntry,
): void {
    if (source.filePath === dest.filePath) return;
    jumpList.recordJump(source.filePath, source.line, source.ch);
    jumpList.recordJump(dest.filePath, dest.line, dest.ch);
}

export async function navigateWithJump(
    app: App,
    target: string,
    sourcePath: string,
    options?: {
        newTab?: boolean;
        split?: 'horizontal' | 'vertical';
        line?: number;
        ch?: number;
    },
): Promise<void> {
    const jumpList = getJumpListInstance();
    const source = jumpList ? getCurrentJumpEntry(app) : null;
    try {
        if (options?.split) {
            executeCommand(
                app,
                options.split === 'vertical'
                    ? 'workspace:split-vertical'
                    : 'workspace:split-horizontal',
            );
            await app.workspace.openLinkText(target, sourcePath, false);
        } else {
            await app.workspace.openLinkText(
                target,
                sourcePath,
                !!options?.newTab,
            );
        }
    } catch {
        return;
    }

    await applyCursorAfterNavigation(app, options?.line, options?.ch);
    if (jumpList && source) {
        const dest = getCurrentJumpEntry(app);
        if (dest) recordCrossNoteJump(jumpList, source, dest);
    }
}

export async function navigateWithJumpFile(
    app: App,
    leaf: WorkspaceLeaf,
    file: TFile,
    options?: { line?: number; ch?: number },
): Promise<void> {
    const jumpList = getJumpListInstance();
    const source = jumpList ? getCurrentJumpEntry(app) : null;
    try {
        await leaf.openFile(file);
    } catch {
        return;
    }
    await applyCursorAfterNavigation(app, options?.line, options?.ch);
    if (jumpList && source) {
        const dest = getCurrentJumpEntry(app);
        if (dest) recordCrossNoteJump(jumpList, source, dest);
    }
}

export function navigateWithJumpSetActive(
    app: App,
    leaf: WorkspaceLeaf,
    options?: { focus?: boolean },
): void {
    const jumpList = getJumpListInstance();
    const source = jumpList ? getCurrentJumpEntry(app) : null;
    app.workspace.setActiveLeaf(leaf, options);
    if (jumpList && source) {
        const dest = getCurrentJumpEntry(app);
        if (dest) recordCrossNoteJump(jumpList, source, dest);
    }
}
