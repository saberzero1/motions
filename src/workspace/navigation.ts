import { MarkdownView, Notice } from 'obsidian';
import type { App } from 'obsidian';
import { foldCode, unfoldCode, toggleFold } from '@codemirror/language';
import { registerFoldLevelCommands } from '../fold/fold-level';
import type { ActionArgs, ActionFn, CmAdapter } from '../types/vim-api';
import { VimRegistration } from '../vim/registration';
import { exCommandFromAction } from '../keybindings/action-registry';
import {
    createGotoDefinitionAction,
    createGotoDefinitionNewTabAction,
    createGotoDefinitionSplitAction,
    findLinkAtCursor,
} from '../motions/goto-definition';
import { createContextActionsAction } from '../ui/context-actions';
import { OutlineModal, getDocumentHeadings } from '../ui/outline-modal';
import { getCmAdapter } from '../vim/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { executeCommand } from '../util/commands';

export { executeCommand } from '../util/commands';

function createCommandAction(app: App, commandId: string): ActionFn {
    return () => {
        executeCommand(app, commandId);
    };
}

function createCloseOthersAction(app: App): ActionFn {
    return () => {
        const active = app.workspace.getLeaf(false);
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf !== active) {
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
            leaves.push(leaf);
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
    enableReplaceWithRegister = true,
): void {
    const focusLeft = createCommandAction(app, 'editor:focus-left');
    reg.defineAction('focusPaneLeft', focusLeft);
    reg.mapCommand('<C-w>h', 'action', 'focusPaneLeft', {});
    exCommandFromAction(reg, 'focuspaneleft', 'focuspanel', focusLeft);

    const focusDown = createCommandAction(app, 'editor:focus-bottom');
    reg.defineAction('focusPaneDown', focusDown);
    reg.mapCommand('<C-w>j', 'action', 'focusPaneDown', {});
    exCommandFromAction(reg, 'focuspanedown', 'focuspaned', focusDown);

    const focusUp = createCommandAction(app, 'editor:focus-top');
    reg.defineAction('focusPaneUp', focusUp);
    reg.mapCommand('<C-w>k', 'action', 'focusPaneUp', {});
    exCommandFromAction(reg, 'focuspaneup', '', focusUp);

    const focusRight = createCommandAction(app, 'editor:focus-right');
    reg.defineAction('focusPaneRight', focusRight);
    reg.mapCommand('<C-w>l', 'action', 'focusPaneRight', {});
    exCommandFromAction(reg, 'focuspaneright', 'focuspaner', focusRight);

    const splitV = createCommandAction(app, 'workspace:split-vertical');
    reg.defineAction('splitVertical', splitV);
    reg.mapCommand('<C-w>v', 'action', 'splitVertical', {});
    exCommandFromAction(reg, 'splitvertical', 'splitv', splitV);

    const splitH = createCommandAction(app, 'workspace:split-horizontal');
    reg.defineAction('splitHorizontal', splitH);
    reg.mapCommand('<C-w>s', 'action', 'splitHorizontal', {});
    exCommandFromAction(reg, 'splithorizontal', 'splith', splitH);

    const closeTabAction = createCommandAction(app, 'workspace:close');
    reg.defineAction('closeTab', closeTabAction);
    reg.mapCommand('<C-w>c', 'action', 'closeTab', {});
    reg.mapCommand('<C-w>q', 'action', 'closeTab', {});
    exCommandFromAction(reg, 'closetab', 'closet', closeTabAction);

    const closeOthers = createCloseOthersAction(app);
    reg.defineAction('closeOtherTabs', closeOthers);
    reg.mapCommand('<C-w>o', 'action', 'closeOtherTabs', {});
    exCommandFromAction(reg, 'closeothertabs', 'closeo', closeOthers);

    const nextTabAction = createCommandAction(app, 'workspace:next-tab');
    reg.defineAction('nextTab', nextTabAction);
    reg.mapCommand('gt', 'action', 'nextTab', {});
    exCommandFromAction(reg, 'nexttab', '', nextTabAction);

    const prevTabAction = createCommandAction(app, 'workspace:previous-tab');
    reg.defineAction('prevTab', prevTabAction);
    reg.mapCommand('gT', 'action', 'prevTab', {});
    exCommandFromAction(reg, 'prevtab', '', prevTabAction);

    const gotoTabAction = createGotoTabAction(app);
    reg.defineAction('gotoTab', gotoTabAction);
    reg.mapCommand('g<C-t>', 'action', 'gotoTab', {});
    exCommandFromAction(reg, 'gototab', 'gotot', gotoTabAction);

    const gotoDef = createGotoDefinitionAction(app);
    reg.defineAction('gotoDefinition', gotoDef);
    reg.mapCommand('gd', 'action', 'gotoDefinition', {});
    exCommandFromAction(reg, 'gotodefinition', '', gotoDef);

    const gotoDefNewTab = createGotoDefinitionNewTabAction(app);
    reg.defineAction('gotoDefinitionNewTab', gotoDefNewTab);
    reg.mapCommand('gD', 'action', 'gotoDefinitionNewTab', {});
    exCommandFromAction(
        reg,
        'gotodefinitionnewtab',
        'gotodefinitionn',
        gotoDefNewTab,
    );

    const gotoDefSplitH = createGotoDefinitionSplitAction(app, 'horizontal');
    reg.defineAction('gotoDefinitionSplitH', gotoDefSplitH);
    reg.mapCommand('<C-w>gd', 'action', 'gotoDefinitionSplitH', {});
    exCommandFromAction(reg, 'gotodefinitionsplith', '', gotoDefSplitH);

    const gotoDefSplitV = createGotoDefinitionSplitAction(app, 'vertical');
    reg.defineAction('gotoDefinitionSplitV', gotoDefSplitV);
    reg.mapCommand('<C-w>gD', 'action', 'gotoDefinitionSplitV', {});
    exCommandFromAction(reg, 'gotodefinitionsplitv', '', gotoDefSplitV);

    // Fold commands use CM6's fold API directly instead of Obsidian's
    // editor:fold-more/fold-less commands, which are incremental (fold one
    // heading level at a time across the whole document) rather than
    // cursor-based like Vim's zc/zo.
    const foldCloseAction: ActionFn = (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) foldCode(view);
    };
    reg.defineAction('foldClose', foldCloseAction);
    reg.mapCommand('zc', 'action', 'foldClose', {});
    exCommandFromAction(reg, 'foldclose', 'foldc', foldCloseAction);

    const foldOpenAction: ActionFn = (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) unfoldCode(view);
    };
    reg.defineAction('foldOpen', foldOpenAction);
    reg.mapCommand('zo', 'action', 'foldOpen', {});
    exCommandFromAction(reg, 'foldopen', 'foldo', foldOpenAction);

    const foldToggleAction: ActionFn = (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) toggleFold(view);
    };
    reg.defineAction('foldToggle', foldToggleAction);
    reg.mapCommand('za', 'action', 'foldToggle', {});
    exCommandFromAction(reg, 'foldtoggle', 'foldt', foldToggleAction);

    const foldAllAction = createCommandAction(app, 'editor:fold-all');
    reg.defineAction('foldAll', foldAllAction);
    reg.mapCommand('zM', 'action', 'foldAll', {});
    exCommandFromAction(reg, 'foldall', 'folda', foldAllAction);

    const unfoldAllAction = createCommandAction(app, 'editor:unfold-all');
    reg.defineAction('unfoldAll', unfoldAllAction);
    reg.mapCommand('zR', 'action', 'unfoldAll', {});
    exCommandFromAction(reg, 'unfoldall', 'unf', unfoldAllAction);

    const outlineAction: ActionFn = () => {
        const headings = getDocumentHeadings(app);
        new OutlineModal(app, headings).open();
    };
    reg.defineAction('documentOutline', outlineAction);
    reg.mapCommand('gO', 'action', 'documentOutline', {});
    exCommandFromAction(reg, 'documentoutline', 'docu', outlineAction);

    const openUrlAction = createOpenUrlAction(app);
    reg.defineAction('openUrl', openUrlAction);
    reg.mapCommand('gx', 'action', 'openUrl', {});
    exCommandFromAction(reg, 'openurl', 'openu', openUrlAction);

    const docStatsAction = createDocStatsAction(app);
    reg.defineAction('docStats', docStatsAction);
    reg.mapCommand('g<C-g>', 'action', 'docStats', {});
    exCommandFromAction(reg, 'docstats', 'docs', docStatsAction);

    const renameNoteAction = createCommandAction(
        app,
        'workspace:edit-file-title',
    );
    reg.defineAction('renameNote', renameNoteAction);
    if (enableReplaceWithRegister) {
        reg.mapCommand('<leader>rn', 'action', 'renameNote', {});
    } else {
        reg.mapCommand('grn', 'action', 'renameNote', {});
    }
    exCommandFromAction(reg, 'renamenote', 'ren', renameNoteAction);

    const showBacklinksAction = createCommandAction(app, 'backlink:open');
    reg.defineAction('showBacklinks', showBacklinksAction);
    if (enableReplaceWithRegister) {
        reg.mapCommand('<leader>rb', 'action', 'showBacklinks', {});
    } else {
        reg.mapCommand('grr', 'action', 'showBacklinks', {});
    }
    exCommandFromAction(reg, 'showbacklinks', '', showBacklinksAction);

    const openGotoFileAction = createCommandAction(app, 'switcher:open');
    reg.defineAction('openGotoFile', openGotoFileAction);
    reg.mapCommand('gf', 'action', 'openGotoFile', {});
    exCommandFromAction(reg, 'opengotofile', 'openg', openGotoFileAction);

    const contextActionsAction = createContextActionsAction(app);
    reg.defineAction('contextActions', contextActionsAction);
    if (enableReplaceWithRegister) {
        reg.mapCommand('<leader>ra', 'action', 'contextActions', {});
    } else {
        reg.mapCommand('gra', 'action', 'contextActions', {});
    }
    exCommandFromAction(reg, 'contextactions', 'con', contextActionsAction);

    const pasteBeforeAction: ActionFn = (cm, actionArgs) =>
        pasteFromRegister(cm, actionArgs, true, false);
    reg.defineAction('pasteBefore', pasteBeforeAction);
    reg.mapCommand('P', 'action', 'pasteBefore', {});
    const pasteAfterMoveAction: ActionFn = (cm, actionArgs) =>
        pasteFromRegister(cm, actionArgs, false, true);
    reg.defineAction('pasteAfterMove', pasteAfterMoveAction);
    reg.mapCommand('gp', 'action', 'pasteAfterMove', {});
    const pasteBeforeMoveAction: ActionFn = (cm, actionArgs) =>
        pasteFromRegister(cm, actionArgs, true, true);
    reg.defineAction('pasteBeforeMove', pasteBeforeMoveAction);
    reg.mapCommand('gP', 'action', 'pasteBeforeMove', {});

    reg.mapCommand('zO', 'action', 'foldOpen', {});
    reg.mapCommand('zC', 'action', 'foldClose', {});
    reg.mapCommand('zA', 'action', 'foldToggle', {});

    registerFoldLevelCommands(reg);

    const charInfoAction = createCharInfoAction(app);
    reg.defineAction('charInfo', charInfoAction);
    reg.mapCommand('ga', 'action', 'charInfo', {});
    exCommandFromAction(reg, 'charinfo', 'char', charInfoAction);
}
