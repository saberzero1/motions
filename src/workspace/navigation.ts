import { MarkdownView, Notice } from 'obsidian';
import type { App } from 'obsidian';
import {
    foldCode,
    foldEffect,
    foldable,
    foldedRanges,
    toggleFold,
    unfoldCode,
    unfoldEffect,
} from '@codemirror/language';
import type { StateEffect } from '@codemirror/state';
import {
    findEnclosingFoldable,
    foldableRegionsWithin,
    foldedRangesWithin,
} from '../fold/motions';
import { isFoldingEnabled } from '../fold/fold-enable';
import { registerFoldLevelCommands } from '../fold/fold-level';
import type {
    ActionArgs,
    ActionFn,
    CmAdapter,
    VimPos,
    VimState,
} from '../types/vim-api';
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
        const rootSplit = app.workspace.rootSplit;
        const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.getRoot() === rootSplit) {
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

function createKeywordLookupAction(app: App, charInfoFn: ActionFn): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;
        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line);
        const link = findLinkAtCursor(lineText, cursor.ch);
        if (link) {
            if (link.isExternal) {
                window.open(link.target);
            } else {
                const sourcePath = view.file?.path ?? '';
                app.workspace.trigger('hover-link', {
                    event: new MouseEvent('mouseover'),
                    source: 'preview',
                    hoverParent: view,
                    targetEl: view.contentEl,
                    linktext: link.target,
                    sourcePath,
                });
            }
        } else {
            if (cm.state.vim) {
                charInfoFn(cm, {} as ActionArgs, cm.state.vim);
            }
        }
    };
}

function createAlternateFileAction(
    app: App,
    getAlternateFilePath: () => string | null,
): ActionFn {
    return () => {
        const target = getAlternateFilePath();
        if (!target) return;
        const sourcePath = app.workspace.getActiveFile()?.path ?? '';
        void app.workspace.openLinkText(target, sourcePath, false);
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

    const vim = (cm as unknown as { state: { vim: VimState } }).state.vim;
    if (vim?.visualMode) {
        const unnamedReg = rc.registers['"'];
        if (unnamedReg) {
            pasteInVisualMode(
                cm,
                vim,
                text,
                reg.linewise,
                movePast,
                Vim,
                unnamedReg,
            );
        }
        return;
    }

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

/**
 * Handle paste in visual mode: replace the visual selection with the
 * register contents, store the replaced text in the unnamed register,
 * and exit visual mode.  Uses `vim.sel` (the vim-level selection) rather
 * than the CM6 selection, because visual-line mode collapses the CM6
 * selection to a cursor to avoid Live-Preview markup uncollapsing.
 */
/**
 * Uses `vim.sel` (the vim-level selection) rather than the CM6 selection,
 * because visual-line mode collapses the CM6 selection to a cursor to
 * avoid Live-Preview markup uncollapsing.
 */
function pasteInVisualMode(
    cm: CmAdapter,
    vim: VimState,
    text: string,
    linewise: boolean,
    movePast: boolean,
    Vim: NonNullable<typeof window.CodeMirrorAdapter>['Vim'],
    unnamedReg: { setText(s: string, linewise?: boolean): void },
): void {
    const sel = (vim as unknown as { sel?: { anchor: VimPos; head: VimPos } })
        .sel;
    if (!sel) return;

    const anchor = sel.anchor;
    const head = sel.head;
    const isForward =
        anchor.line < head.line ||
        (anchor.line === head.line && anchor.ch <= head.ch);

    let selStart: VimPos;
    let selEnd: VimPos;
    let replacedText: string;
    let pasteText = text;

    if (vim.visualLine) {
        const startLine = Math.min(anchor.line, head.line);
        const endLine = Math.max(anchor.line, head.line);
        if (endLine < cm.lastLine()) {
            selStart = { line: startLine, ch: 0 };
            selEnd = { line: endLine + 1, ch: 0 };
            replacedText = cm.getRange(selStart, selEnd);
            if (linewise && !pasteText.endsWith('\n')) pasteText += '\n';
        } else {
            const endLen = cm.getLine(endLine).length;
            selStart = { line: startLine, ch: 0 };
            selEnd = { line: endLine, ch: endLen };
            replacedText = cm.getRange(selStart, selEnd);
            if (linewise && pasteText.endsWith('\n'))
                pasteText = pasteText.slice(0, -1);
        }
    } else {
        selStart = isForward ? anchor : head;
        selEnd = isForward
            ? { line: head.line, ch: head.ch + 1 }
            : { line: anchor.line, ch: anchor.ch + 1 };
        const lineLen = cm.getLine(selEnd.line).length;
        if (selEnd.ch > lineLen) selEnd.ch = lineLen;
        replacedText = cm.getRange(selStart, selEnd);
    }

    unnamedReg.setText(replacedText);
    cm.replaceRange(pasteText, selStart, selEnd);

    let finalPos: VimPos;
    if (movePast) {
        const pasteEnd = cm.posFromIndex(
            cm.indexFromPos(selStart) + pasteText.length,
        );
        finalPos = pasteEnd;
    } else if (linewise || vim.visualLine) {
        const lineText = cm.getLine(selStart.line);
        const firstNonWs = lineText.search(/\S/);
        finalPos = {
            line: selStart.line,
            ch: firstNonWs >= 0 ? firstNonWs : 0,
        };
    } else {
        finalPos = cm.posFromIndex(
            cm.indexFromPos(selStart) + pasteText.length - 1,
        );
    }

    Vim.exitVisualMode(cm, false);
    cm.setCursor(finalPos.line, finalPos.ch);
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

function createUtf8ByteInfoAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const adapter = getCmAdapter(view);
        if (!adapter) return;
        const cursor = adapter.getCursor();
        const line = adapter.getLine(cursor.line);
        const char = line.charAt(cursor.ch);
        if (!char) return;
        const encoded = new TextEncoder().encode(char);
        const hex = Array.from(encoded)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ');
        new Notice(`<${char}>  ${hex}`);
    };
}

function createFileInfoAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return;
        const adapter = getCmAdapter(view);
        if (!adapter) return;
        const cursor = adapter.getCursor();
        const totalLines = adapter.lineCount();
        const pct =
            totalLines > 0
                ? Math.round(((cursor.line + 1) / totalLines) * 100)
                : 0;
        new Notice(
            `"${view.file.name}"  line ${cursor.line + 1} of ${totalLines}  --${pct}%--  col ${cursor.ch + 1}`,
        );
    };
}

function createGotoMiddleOfLineAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const adapter = getCmAdapter(view);
        if (!adapter) return;
        const cm6 = adapter.cm6;
        if (!cm6) return;
        const cursor = adapter.getCursor();
        const lineText = adapter.getLine(cursor.line);
        const visibleCols = Math.floor(
            cm6.dom.clientWidth / cm6.defaultCharacterWidth,
        );
        const mid = Math.floor(visibleCols / 2);
        const targetCh = Math.min(mid, lineText.length - 1);
        adapter.setCursor(cursor.line, Math.max(0, targetCh));
    };
}

function createGotoCharOffsetAction(app: App): ActionFn {
    return (_cm, actionArgs) => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const adapter = getCmAdapter(view);
        if (!adapter) return;
        const offset = (actionArgs.repeat ?? 1) - 1;
        const cm6 = adapter.cm6;
        if (!cm6) return;
        const docLen = cm6.state.doc.length;
        const clamped = Math.min(offset, docLen - 1);
        if (clamped < 0) return;
        const pos = cm6.state.doc.lineAt(clamped);
        adapter.setCursor(pos.number - 1, clamped - pos.from);
    };
}

function createGotoFileLineAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const adapter = getCmAdapter(view);
        if (!adapter) return;
        const cursor = adapter.getCursor();
        const lineText = adapter.getLine(cursor.line);
        const match = /[\w./\\-]+:\d+/.exec(lineText.slice(cursor.ch));
        if (!match) {
            executeCommand(app, 'switcher:open');
            return;
        }
        const [full] = match;
        const sepIdx = full.lastIndexOf(':');
        const filePart = full.slice(0, sepIdx);
        const linePart = parseInt(full.slice(sepIdx + 1), 10);
        void app.workspace.openLinkText(filePart, '', false).then(() => {
            const newView = app.workspace.getActiveViewOfType(MarkdownView);
            if (newView) {
                const targetLine = Math.max(0, linePart - 1);
                newView.editor.setCursor(targetLine, 0);
            }
        });
    };
}

function createHorizontalScrollAction(
    mode: 'cursor-left' | 'cursor-right' | 'half-left' | 'half-right',
): ActionFn {
    return (cm) => {
        const cm6 = cm.cm6;
        if (!cm6) return;
        const scrollDom = cm6.scrollDOM;
        switch (mode) {
            case 'cursor-left': {
                const cursor = cm6.state.selection.main.head;
                const coords = cm6.coordsAtPos(cursor);
                if (coords) {
                    const rect = scrollDom.getBoundingClientRect();
                    scrollDom.scrollLeft += coords.left - rect.left;
                }
                break;
            }
            case 'cursor-right': {
                const cursor = cm6.state.selection.main.head;
                const coords = cm6.coordsAtPos(cursor);
                if (coords) {
                    const rect = scrollDom.getBoundingClientRect();
                    scrollDom.scrollLeft +=
                        coords.left - rect.right + cm6.defaultCharacterWidth;
                }
                break;
            }
            case 'half-left':
                scrollDom.scrollLeft -= Math.floor(scrollDom.clientWidth / 2);
                break;
            case 'half-right':
                scrollDom.scrollLeft += Math.floor(scrollDom.clientWidth / 2);
                break;
        }
    };
}

function createCyclePaneAction(app: App, reverse: boolean): ActionFn {
    return () => {
        const rootSplit = app.workspace.rootSplit;
        const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.getRoot() === rootSplit) {
                leaves.push(leaf);
            }
        });
        if (leaves.length <= 1) return;
        const active = app.workspace.getLeaf(false);
        const idx = leaves.indexOf(active);
        if (idx === -1) return;
        const next = reverse
            ? (idx - 1 + leaves.length) % leaves.length
            : (idx + 1) % leaves.length;
        const target = leaves[next];
        if (target) {
            app.workspace.setActiveLeaf(target, { focus: true });
        }
    };
}

function createFocusPreviousPaneAction(
    app: App,
    getPreviousLeafId: () => string | null,
): ActionFn {
    return () => {
        const prevId = getPreviousLeafId();
        if (!prevId) return;
        app.workspace.iterateAllLeaves((leaf) => {
            if ((leaf as { id?: string }).id === prevId) {
                app.workspace.setActiveLeaf(leaf, { focus: true });
            }
        });
    };
}

export function registerWorkspaceNavigation(
    reg: VimRegistration,
    app: App,
    leaderRegistry: LeaderRegistry,
    enableReplaceWithRegister = true,
    getPreviousLeafId: () => string | null = () => null,
    getAlternateFilePath: () => string | null = () => null,
): void {
    void leaderRegistry;
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
    reg.mapCommand('<C-w>n', 'action', 'splitHorizontal', {});
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
    exCommandFromAction(reg, 'nexttab', '', nextTabAction);

    const gtAction: ActionFn = (_cm, actionArgs) => {
        if (actionArgs.repeatIsExplicit) {
            const n = actionArgs.repeat ?? 1;
            const rootSplit = app.workspace.rootSplit;
            const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.getRoot() === rootSplit) {
                    leaves.push(leaf);
                }
            });
            const target = leaves[n - 1];
            if (target) {
                app.workspace.setActiveLeaf(target, { focus: true });
            }
        } else {
            executeCommand(app, 'workspace:next-tab');
        }
    };
    reg.defineAction('gt', gtAction);
    reg.mapCommand('gt', 'action', 'gt', {});

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
    reg.mapCommand('<C-]>', 'action', 'gotoDefinition', {});
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

    const alternateFileAction = createAlternateFileAction(
        app,
        getAlternateFilePath,
    );
    reg.defineAction('alternateFile', alternateFileAction);
    reg.mapCommand('<C-^>', 'action', 'alternateFile', {});
    reg.mapCommand('<C-6>', 'action', 'alternateFile', {});
    reg.mapCommand('<C-t>', 'action', 'jumpListWalk', { forward: false });

    // Fold commands use CM6's fold API directly instead of Obsidian's
    // editor:fold-more/fold-less commands, which are incremental (fold one
    // heading level at a time across the whole document) rather than
    // cursor-based like Vim's zc/zo.
    const foldCloseAction: ActionFn = (cm: CmAdapter) => {
        if (!isFoldingEnabled(cm)) return;
        const view = cm.cm6;
        if (view) foldCode(view);
    };
    reg.defineAction('foldClose', foldCloseAction);
    reg.mapCommand('zc', 'action', 'foldClose', {});

    const foldOpenAction: ActionFn = (cm: CmAdapter) => {
        const view = cm.cm6;
        if (view) unfoldCode(view);
    };
    reg.defineAction('foldOpen', foldOpenAction);
    reg.mapCommand('zo', 'action', 'foldOpen', {});

    const foldToggleAction: ActionFn = (cm: CmAdapter) => {
        if (!isFoldingEnabled(cm)) return;
        const view = cm.cm6;
        if (view) toggleFold(view);
    };
    reg.defineAction('foldToggle', foldToggleAction);
    reg.mapCommand('za', 'action', 'foldToggle', {});

    const foldOpenRecursiveAction: ActionFn = (cm: CmAdapter) => {
        const view = cm.cm6;
        if (!view) return;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const outerRange = foldable(view.state, line.from, line.to);
        const range = outerRange ?? findEnclosingFoldable(view.state, pos);
        if (!range) {
            unfoldCode(view);
            return;
        }
        const allFolded = foldedRangesWithin(view.state, range.from, range.to);
        if (allFolded.length === 0) {
            unfoldCode(view);
            return;
        }
        const effects = allFolded.map((r) => unfoldEffect.of(r));
        view.dispatch({ effects });
    };
    reg.defineAction('foldOpenRecursive', foldOpenRecursiveAction);

    const foldCloseRecursiveAction: ActionFn = (cm: CmAdapter) => {
        if (!isFoldingEnabled(cm)) return;
        const view = cm.cm6;
        if (!view) return;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const outerRange = foldable(view.state, line.from, line.to);
        const range = outerRange ?? findEnclosingFoldable(view.state, pos);
        if (!range) {
            foldCode(view);
            return;
        }
        const regions = foldableRegionsWithin(view.state, range.from, range.to);
        regions.sort((a, b) => b.from - a.from);
        if (
            outerRange &&
            !regions.some(
                (current) =>
                    current.from === outerRange.from &&
                    current.to === outerRange.to,
            )
        ) {
            regions.push(outerRange);
        }
        const folded = foldedRanges(view.state);
        const effects: StateEffect<{ from: number; to: number }>[] = [];
        for (const r of regions) {
            let alreadyFolded = false;
            const iter = folded.iter(r.from);
            while (iter.value) {
                if (iter.from === r.from && iter.to === r.to) {
                    alreadyFolded = true;
                    break;
                }
                if (iter.from > r.to) break;
                iter.next();
            }
            if (!alreadyFolded) {
                effects.push(foldEffect.of(r));
            }
        }
        if (effects.length > 0) {
            view.dispatch({ effects });
        }
    };
    reg.defineAction('foldCloseRecursive', foldCloseRecursiveAction);

    const foldToggleRecursiveAction: ActionFn = (cm: CmAdapter) => {
        const view = cm.cm6;
        if (!view) return;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const folded = foldedRanges(view.state);
        let isFolded = false;
        const iter = folded.iter();
        while (iter.value) {
            if (iter.from <= line.to && iter.to >= line.from) {
                isFolded = true;
                break;
            }
            iter.next();
        }
        if (isFolded) {
            foldOpenRecursiveAction(cm, { repeat: 1 }, cm.state.vim ?? {});
        } else {
            foldCloseRecursiveAction(cm, { repeat: 1 }, cm.state.vim ?? {});
        }
    };
    reg.defineAction('foldToggleRecursive', foldToggleRecursiveAction);

    const foldAllAction: ActionFn = (cm: CmAdapter) => {
        if (!isFoldingEnabled(cm)) return;
        executeCommand(app, 'editor:fold-all');
    };
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
        reg.mapCommand(
            '<leader>rn',
            'action',
            'renameNote',
            {},
            {
                context: 'normal',
            },
        );
    } else {
        reg.mapCommand(
            'grn',
            'action',
            'renameNote',
            {},
            {
                context: 'normal',
            },
        );
    }
    exCommandFromAction(reg, 'renamenote', 'ren', renameNoteAction);

    const showBacklinksAction = createCommandAction(app, 'backlink:open');
    reg.defineAction('showBacklinks', showBacklinksAction);
    if (enableReplaceWithRegister) {
        reg.mapCommand(
            '<leader>rb',
            'action',
            'showBacklinks',
            {},
            {
                context: 'normal',
            },
        );
    } else {
        reg.mapCommand(
            'grr',
            'action',
            'showBacklinks',
            {},
            {
                context: 'normal',
            },
        );
    }
    exCommandFromAction(reg, 'showbacklinks', '', showBacklinksAction);

    const openGotoFileAction = createCommandAction(app, 'switcher:open');
    reg.defineAction('openGotoFile', openGotoFileAction);
    reg.mapCommand('gf', 'action', 'openGotoFile', {});
    reg.mapCommand(']f', 'action', 'openGotoFile', {});
    reg.mapCommand('[f', 'action', 'openGotoFile', {});
    exCommandFromAction(reg, 'opengotofile', 'openg', openGotoFileAction);

    const contextActionsAction = createContextActionsAction(app);
    reg.defineAction('contextActions', contextActionsAction);
    if (enableReplaceWithRegister) {
        reg.mapCommand(
            '<leader>ra',
            'action',
            'contextActions',
            {},
            {
                context: 'normal',
            },
        );
    } else {
        reg.mapCommand(
            'gra',
            'action',
            'contextActions',
            {},
            {
                context: 'normal',
            },
        );
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

    reg.mapCommand('zO', 'action', 'foldOpenRecursive', {});
    reg.mapCommand('zC', 'action', 'foldCloseRecursive', {});
    reg.mapCommand('zA', 'action', 'foldToggleRecursive', {});

    registerFoldLevelCommands(reg);

    const charInfoAction = createCharInfoAction(app);
    reg.defineAction('charInfo', charInfoAction);
    reg.mapCommand('ga', 'action', 'charInfo', {});
    exCommandFromAction(reg, 'charinfo', 'char', charInfoAction);

    const keywordLookup = createKeywordLookupAction(app, charInfoAction);
    reg.defineAction('keywordLookup', keywordLookup);
    reg.mapCommand('K', 'action', 'keywordLookup', {});

    const cyclePaneNext = createCyclePaneAction(app, false);
    reg.defineAction('cyclePaneNext', cyclePaneNext);
    reg.mapCommand('<C-w>w', 'action', 'cyclePaneNext', {});

    const cyclePanePrev = createCyclePaneAction(app, true);
    reg.defineAction('cyclePanePrev', cyclePanePrev);
    reg.mapCommand('<C-w>W', 'action', 'cyclePanePrev', {});

    const focusPrevPane = createFocusPreviousPaneAction(app, getPreviousLeafId);
    reg.defineAction('focusPreviousPane', focusPrevPane);
    reg.mapCommand('<C-w>p', 'action', 'focusPreviousPane', {});
    reg.mapCommand('g<Tab>', 'action', 'focusPreviousPane', {});

    const utf8Info = createUtf8ByteInfoAction(app);
    reg.defineAction('utf8ByteInfo', utf8Info);
    reg.mapCommand('g8', 'action', 'utf8ByteInfo', {});

    const fileInfo = createFileInfoAction(app);
    reg.defineAction('fileInfo', fileInfo);
    reg.mapCommand('<C-g>', 'action', 'fileInfo', {}, { context: 'normal' });

    const gotoMiddle = createGotoMiddleOfLineAction(app);
    reg.defineAction('gotoMiddleOfLine', gotoMiddle);
    reg.mapCommand('gm', 'action', 'gotoMiddleOfLine', {});

    const gotoOffset = createGotoCharOffsetAction(app);
    reg.defineAction('gotoCharOffset', gotoOffset);
    reg.mapCommand('go', 'action', 'gotoCharOffset', {});

    const gotoFileLine = createGotoFileLineAction(app);
    reg.defineAction('gotoFileLine', gotoFileLine);
    reg.mapCommand('gF', 'action', 'gotoFileLine', {});

    const scrollCursorLeft = createHorizontalScrollAction('cursor-left');
    reg.defineAction('scrollCursorLeft', scrollCursorLeft);
    reg.mapCommand('zs', 'action', 'scrollCursorLeft', {});

    const scrollCursorRight = createHorizontalScrollAction('cursor-right');
    reg.defineAction('scrollCursorRight', scrollCursorRight);
    reg.mapCommand('ze', 'action', 'scrollCursorRight', {});

    const scrollHalfLeft = createHorizontalScrollAction('half-left');
    reg.defineAction('scrollHalfLeft', scrollHalfLeft);
    reg.mapCommand('zH', 'action', 'scrollHalfLeft', {});

    const scrollHalfRight = createHorizontalScrollAction('half-right');
    reg.defineAction('scrollHalfRight', scrollHalfRight);
    reg.mapCommand('zL', 'action', 'scrollHalfRight', {});

    // ]<Space> / [<Space> — add blank lines below/above (Neovim default)
    const addBlankLineBelow: ActionFn = (
        cm: CmAdapter,
        actionArgs: ActionArgs,
    ) => {
        const repeat = actionArgs.repeat ?? 1;
        const cursor = cm.getCursor();
        const line = cursor.line;
        const lineText = cm.getLine(line);
        const endOfLine = lineText.length;
        const blanks = '\n'.repeat(repeat);
        cm.replaceRange(
            blanks,
            { line, ch: endOfLine },
            { line, ch: endOfLine },
        );
        cm.setCursor(cursor.line, cursor.ch);
    };
    reg.defineAction('addBlankLineBelow', addBlankLineBelow);
    reg.mapCommand(']<Space>', 'action', 'addBlankLineBelow', {
        isEdit: true,
    });

    const addBlankLineAbove: ActionFn = (
        cm: CmAdapter,
        actionArgs: ActionArgs,
    ) => {
        const repeat = actionArgs.repeat ?? 1;
        const cursor = cm.getCursor();
        const line = cursor.line;
        const blanks = '\n'.repeat(repeat);
        cm.replaceRange(blanks, { line, ch: 0 }, { line, ch: 0 });
        cm.setCursor(cursor.line + repeat, cursor.ch);
    };
    reg.defineAction('addBlankLineAbove', addBlankLineAbove);
    reg.mapCommand('[<Space>', 'action', 'addBlankLineAbove', {
        isEdit: true,
    });

    // <C-W>^ — split + alternate file (Neovim default)
    const splitAlternateFile: ActionFn = () => {
        executeCommand(app, 'workspace:split-horizontal');
        const target = getAlternateFilePath();
        if (!target) return;
        const sourcePath = app.workspace.getActiveFile()?.path ?? '';
        void app.workspace.openLinkText(target, sourcePath, false);
    };
    reg.defineAction('splitAlternateFile', splitAlternateFile);
    reg.mapCommand('<C-w><C-^>', 'action', 'splitAlternateFile', {});

    // <C-W>T — move current pane to a new tab
    const moveToNewTab: ActionFn = () => {
        const leaf = app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
        if (!leaf) return;
        const file = app.workspace.getActiveFile();
        if (!file) return;
        const state = leaf.getViewState();
        const newLeaf = app.workspace.getLeaf('tab');
        void newLeaf.setViewState(state).then(() => {
            app.workspace.setActiveLeaf(newLeaf, { focus: true });
            leaf.detach();
        });
    };
    reg.defineAction('moveToNewTab', moveToNewTab);
    reg.mapCommand('<C-w>T', 'action', 'moveToNewTab', {});

    const noop: ActionFn = () => {};
    reg.defineAction('noop', noop);
    reg.mapCommand('<C-w>=', 'action', 'noop', {});
    reg.mapCommand('<C-w>_', 'action', 'noop', {});
    reg.mapCommand('<C-w>|', 'action', 'noop', {});
    reg.mapCommand('<C-w>r', 'action', 'noop', {});
    reg.mapCommand('<C-w>R', 'action', 'noop', {});
    reg.mapCommand('<C-w>x', 'action', 'noop', {});
}
