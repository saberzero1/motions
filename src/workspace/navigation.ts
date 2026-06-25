import { MarkdownView, Notice } from 'obsidian';
import type { App } from 'obsidian';
import { foldCode, unfoldCode, toggleFold } from '@codemirror/language';
import type { ActionArgs, ActionFn, CmAdapter } from '../types/vim-api';
import { VimRegistration } from '../vim/registration';
import {
    createGotoDefinitionAction,
    findLinkAtCursor,
} from '../motions/goto-definition';
import { createContextActionsAction } from '../ui/context-actions';
import { OutlineModal, getDocumentHeadings } from '../ui/outline-modal';
import { getCmAdapter } from '../vim/vim-api';
import type { LeaderRegistry } from '../ui/which-key';

function executeCommand(app: App, commandId: string): void {
    (
        app as unknown as {
            commands: { executeCommandById: (id: string) => void };
        }
    ).commands.executeCommandById(commandId);
}

function createCommandAction(app: App, commandId: string): ActionFn {
    return () => {
        executeCommand(app, commandId);
    };
}

function createCloseOthersAction(app: App): ActionFn {
    return () => {
        const active = app.workspace.getLeaf(false);
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf !== active && leaf.view.getViewType() === 'markdown') {
                leaf.detach();
            }
        });
    };
}

function createGotoTabAction(app: App): ActionFn {
    return (_cm, actionArgs) => {
        const n = actionArgs.repeat ?? 1;
        const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === 'markdown') {
                leaves.push(leaf);
            }
        });
        const target = leaves[n - 1];
        if (target) {
            app.workspace.setActiveLeaf(target, { focus: true });
        }
    };
}

function createOpenUrlAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;
        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line);
        const link = findLinkAtCursor(lineText, cursor.ch);
        if (!link || !link.isExternal) return;
        window.open(link.target);
    };
}

function createDocStatsAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;
        const cursor = cm.getCursor();
        const totalLines = cm.lineCount();
        const fullText = cm.getRange(
            { line: 0, ch: 0 },
            { line: totalLines, ch: 0 },
        );
        const totalChars = fullText.length;
        const words = fullText.split(/\s+/).filter((w) => w.length > 0);
        const totalWords = words.length;
        new Notice(
            `Line ${cursor.line + 1} of ${totalLines}; Word ${totalWords}; Char ${totalChars}`,
        );
    };
}

function pasteFromRegister(
    cm: CmAdapter,
    actionArgs: ActionArgs,
    before: boolean,
    movePast: boolean,
): void {
    const Vim = window.CodeMirrorAdapter?.Vim;
    if (!Vim) return;
    const regName =
        (actionArgs as unknown as Record<string, unknown>).registerName || '"';
    const repeat = actionArgs.repeat || 1;
    const rc = Vim.getRegisterController();
    const reg = rc.registers[regName as string];
    if (!reg) return;
    if (reg.blockwise) return;
    const rawText = reg.toString();
    if (!rawText) return;
    const text = rawText.repeat(repeat);
    const cursor = cm.getCursor();

    if (reg.linewise) {
        const insertLine = before ? cursor.line : cursor.line + 1;
        const insertText = text.endsWith('\n') ? text : text + '\n';
        cm.replaceRange(insertText, { line: insertLine, ch: 0 });
        if (movePast) {
            const pastedLines = insertText.split('\n').length - 1;
            const targetLine = Math.min(
                insertLine + pastedLines,
                cm.lastLine(),
            );
            cm.setCursor(targetLine, 0);
        } else {
            const lineText = cm.getLine(insertLine);
            const firstNonWs = lineText.search(/\S/);
            cm.setCursor(insertLine, firstNonWs >= 0 ? firstNonWs : 0);
        }
    } else {
        const insertPos = before
            ? cursor
            : { line: cursor.line, ch: cursor.ch + 1 };
        cm.replaceRange(text, insertPos);
        const lines = text.split('\n');
        if (movePast) {
            if (lines.length === 1) {
                cm.setCursor(insertPos.line, insertPos.ch + text.length);
            } else {
                const endLine = insertPos.line + lines.length - 1;
                const lastLine = lines[lines.length - 1] ?? '';
                cm.setCursor(endLine, lastLine.length);
            }
        } else {
            if (lines.length === 1) {
                cm.setCursor(insertPos.line, insertPos.ch + text.length - 1);
            } else {
                const endLine = insertPos.line + lines.length - 1;
                const lastLine = lines[lines.length - 1] ?? '';
                cm.setCursor(endLine, lastLine.length - 1);
            }
        }
    }
}

function createCharInfoAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const adapter = getCmAdapter(view);
        if (!adapter) return;
        const cursor = adapter.getCursor();
        const line = adapter.getLine(cursor.line);
        const char = line.charAt(cursor.ch);
        if (!char) return;
        const code = char.codePointAt(0) ?? 0;
        new Notice(
            `<${char}>  ${code},  Hex ${code.toString(16)},  Oct ${code.toString(8)}`,
        );
    };
}

export function registerWorkspaceNavigation(
    reg: VimRegistration,
    app: App,
    leaderRegistry: LeaderRegistry,
): void {
    reg.defineAction(
        'focusPaneLeft',
        createCommandAction(app, 'editor:focus-left'),
    );
    reg.mapCommand('<C-w>h', 'action', 'focusPaneLeft', {});

    reg.defineAction(
        'focusPaneDown',
        createCommandAction(app, 'editor:focus-bottom'),
    );
    reg.mapCommand('<C-w>j', 'action', 'focusPaneDown', {});

    reg.defineAction(
        'focusPaneUp',
        createCommandAction(app, 'editor:focus-top'),
    );
    reg.mapCommand('<C-w>k', 'action', 'focusPaneUp', {});

    reg.defineAction(
        'focusPaneRight',
        createCommandAction(app, 'editor:focus-right'),
    );
    reg.mapCommand('<C-w>l', 'action', 'focusPaneRight', {});

    reg.defineAction(
        'splitVertical',
        createCommandAction(app, 'workspace:split-vertical'),
    );
    reg.mapCommand('<C-w>v', 'action', 'splitVertical', {});

    reg.defineAction(
        'splitHorizontal',
        createCommandAction(app, 'workspace:split-horizontal'),
    );
    reg.mapCommand('<C-w>s', 'action', 'splitHorizontal', {});

    reg.defineAction('closeTab', createCommandAction(app, 'workspace:close'));
    reg.mapCommand('<C-w>c', 'action', 'closeTab', {});
    reg.mapCommand('<C-w>q', 'action', 'closeTab', {});

    reg.defineAction('closeOtherTabs', createCloseOthersAction(app));
    reg.mapCommand('<C-w>o', 'action', 'closeOtherTabs', {});

    reg.defineAction('nextTab', createCommandAction(app, 'workspace:next-tab'));
    reg.mapCommand('gt', 'action', 'nextTab', {});

    reg.defineAction(
        'prevTab',
        createCommandAction(app, 'workspace:previous-tab'),
    );
    reg.mapCommand('gT', 'action', 'prevTab', {});

    reg.defineAction('gotoTab', createGotoTabAction(app));
    reg.mapCommand('g<C-t>', 'action', 'gotoTab', {});

    reg.defineAction('gotoDefinition', createGotoDefinitionAction(app));
    reg.mapCommand('gd', 'action', 'gotoDefinition', {});

    // Fold commands use CM6's fold API directly instead of Obsidian's
    // editor:fold-more/fold-less commands, which are incremental (fold one
    // heading level at a time across the whole document) rather than
    // cursor-based like Vim's zc/zo.
    reg.defineAction('foldClose', (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) foldCode(view);
    });
    reg.mapCommand('zc', 'action', 'foldClose', {});

    reg.defineAction('foldOpen', (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) unfoldCode(view);
    });
    reg.mapCommand('zo', 'action', 'foldOpen', {});

    reg.defineAction('foldToggle', (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) toggleFold(view);
    });
    reg.mapCommand('za', 'action', 'foldToggle', {});

    reg.defineAction('foldAll', createCommandAction(app, 'editor:fold-all'));
    reg.mapCommand('zM', 'action', 'foldAll', {});

    reg.defineAction(
        'unfoldAll',
        createCommandAction(app, 'editor:unfold-all'),
    );
    reg.mapCommand('zR', 'action', 'unfoldAll', {});

    reg.defineAction('documentOutline', () => {
        const headings = getDocumentHeadings(app);
        new OutlineModal(app, headings).open();
    });
    reg.mapCommand('gO', 'action', 'documentOutline', {});

    reg.defineAction('openUrl', createOpenUrlAction(app));
    reg.mapCommand('gx', 'action', 'openUrl', {});

    reg.defineAction('docStats', createDocStatsAction(app));
    reg.mapCommand('g<C-g>', 'action', 'docStats', {});

    reg.defineAction(
        'renameNote',
        createCommandAction(app, 'workspace:edit-file-title'),
    );
    reg.mapCommand('grn', 'action', 'renameNote', {});

    reg.defineAction(
        'showBacklinks',
        createCommandAction(app, 'backlink:open'),
    );
    reg.mapCommand('grr', 'action', 'showBacklinks', {});

    reg.defineAction('openGotoFile', createCommandAction(app, 'switcher:open'));
    reg.mapCommand('gf', 'action', 'openGotoFile', {});

    reg.defineAction('contextActions', createContextActionsAction(app));
    reg.mapCommand('gra', 'action', 'contextActions', {});

    reg.defineAction('pasteBefore', (cm, actionArgs) =>
        pasteFromRegister(cm, actionArgs, true, false),
    );
    reg.mapCommand('P', 'action', 'pasteBefore', {});
    reg.defineAction('pasteAfterMove', (cm, actionArgs) =>
        pasteFromRegister(cm, actionArgs, false, true),
    );
    reg.mapCommand('gp', 'action', 'pasteAfterMove', {});
    reg.defineAction('pasteBeforeMove', (cm, actionArgs) =>
        pasteFromRegister(cm, actionArgs, true, true),
    );
    reg.mapCommand('gP', 'action', 'pasteBeforeMove', {});

    // Recursive fold variants (reuse existing fold actions)
    reg.mapCommand('zO', 'action', 'foldOpen', {});
    reg.mapCommand('zC', 'action', 'foldClose', {});
    reg.mapCommand('zA', 'action', 'foldToggle', {});

    // Character info (ga)
    reg.defineAction('charInfo', createCharInfoAction(app));
    reg.mapCommand('ga', 'action', 'charInfo', {});
}
