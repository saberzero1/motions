import { MarkdownView, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ActionFn } from '../types/vim-api';
import { VimRegistration } from '../vim/registration';
import {
    createGotoDefinitionAction,
    findLinkAtCursor,
} from '../motions/goto-definition';
import { createContextActionsAction } from '../ui/context-actions';
import { createHintModeAction } from '../ui/hint-mode';
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

function createPasteMoveAction(after: boolean): ActionFn {
    return (cm) => {
        const Vim = window.CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const reg = Vim.getRegisterController().registers['"'];
        if (!reg) return;
        const text = reg.toString();
        const beforeLine = cm.getCursor().line;
        Vim.handleKey(cm, after ? 'p' : 'P');
        if (reg.linewise) {
            const pastedLines = text.split('\n').length - 1;
            const targetLine = after
                ? beforeLine + pastedLines
                : beforeLine + pastedLines;
            cm.setCursor(targetLine, 0);
        } else {
            const afterPos = cm.getCursor();
            const newCh = Math.min(
                afterPos.ch + 1,
                cm.getLine(afterPos.line).length,
            );
            cm.setCursor(afterPos.line, newCh);
        }
    };
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

    reg.defineAction(
        'foldToggle',
        createCommandAction(app, 'editor:toggle-fold'),
    );
    reg.mapCommand('za', 'action', 'foldToggle', {});

    reg.defineAction('foldClose', createCommandAction(app, 'editor:fold-more'));
    reg.mapCommand('zc', 'action', 'foldClose', {});

    reg.defineAction('foldOpen', createCommandAction(app, 'editor:fold-less'));
    reg.mapCommand('zo', 'action', 'foldOpen', {});

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

    reg.defineAction('hintMode', createHintModeAction(app));
    const leader = leaderRegistry.getLeaderKey();
    const hintKeys = leader + leader + 'h';
    reg.mapCommand(hintKeys, 'action', 'hintMode', {});
    leaderRegistry.addBinding(hintKeys, 'Hint mode', 'builtin');

    reg.defineAction('pasteAfterMove', createPasteMoveAction(true));
    reg.mapCommand('gp', 'action', 'pasteAfterMove', {});
    reg.defineAction('pasteBeforeMove', createPasteMoveAction(false));
    reg.mapCommand('gP', 'action', 'pasteBeforeMove', {});

    // Recursive fold variants (reuse existing fold actions)
    reg.mapCommand('zO', 'action', 'foldOpen', {});
    reg.mapCommand('zC', 'action', 'foldClose', {});
    reg.mapCommand('zA', 'action', 'foldToggle', {});

    // Character info (ga)
    reg.defineAction('charInfo', createCharInfoAction(app));
    reg.mapCommand('ga', 'action', 'charInfo', {});
}
