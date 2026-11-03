import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';
import { getVimApi } from '../vim/vim-api';
import { getDialogPrefix } from '../vim/mode-tracker';
import { isFlashActive, setFlashActive } from './state';
import type { Target } from '../easymotion/types';
import type { OverlayHandle } from '../easymotion/overlay';
import { filterVisibleTargets, showOverlay } from '../easymotion/overlay';
import { FlashLabeler } from './labeler';
import { recordInNoteJump } from '../workspace/in-note-jumps';
import {
    findFlashPatternMatches,
    isFlashSearchPattern,
} from './character-match';

interface FlashSearchPattern {
    source: string;
    flags: string;
}

interface FlashSearchSettings {
    flashSearch: boolean;
    easyMotionLabels: string;
    easyMotionDimming: boolean;
    labelFontSize: number;
    labelMatchFontSize: boolean;
}

function findSearchMatchTargets(
    cm: CmAdapter,
    override?: FlashSearchPattern,
): Target[] {
    const vim = getVimApi();
    if (!vim) return [];

    let source: string;
    let flags: string;
    if (override) {
        source = override.source;
        flags = override.flags;
    } else {
        const searchState = vim.getSearchState?.(cm);
        if (!searchState) return [];

        const query = searchState.getQuery?.();
        if (!query?.source) return [];
        source = query.source;
        flags = query.flags;
    }

    const view = cm.cm6;
    if (!view) return [];

    const text = view.state.doc.toString();
    let re: RegExp;
    try {
        const regexFlags = flags.includes('g') ? flags : flags + 'g';
        re = new RegExp(source, regexFlags);
    } catch {
        return [];
    }

    const targets: Target[] = [];
    const flashMatches = findFlashPatternMatches(
        text,
        source,
        flags.includes('i'),
    );
    if (flashMatches) {
        for (const match of flashMatches) {
            const pos = cm.posFromIndex(match.index);
            targets.push({
                line: pos.line,
                ch: pos.ch,
                matchLength: match.length,
            });
            if (targets.length > 500) break;
        }
        return targets;
    }

    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const pos = cm.posFromIndex(match.index);
        targets.push({
            line: pos.line,
            ch: pos.ch,
            matchLength: Math.max(match[0].length, 1),
        });
        if (match[0].length === 0) re.lastIndex++;
        if (targets.length > 500) break;
    }

    return targets;
}

export function enableFlashSearch(
    app: App,
    settings: FlashSearchSettings,
): () => void {
    let lastAdapter: CmAdapter | null = null;
    let searchWasOpen = false;
    let skipNextPostCommit = false;
    let postCommitHandler: ((e: KeyboardEvent) => void) | null = null;
    let postCommitOverlay: OverlayHandle | null = null;

    const cleanupPostCommit = () => {
        if (postCommitHandler) {
            activeDocument.removeEventListener(
                'keydown',
                postCommitHandler,
                true,
            );
            postCommitHandler = null;
        }
        postCommitOverlay?.cleanup();
        postCommitOverlay = null;
        if (isFlashActive()) setFlashActive(false);
    };

    const showPostCommitLabels = (
        cm: CmAdapter,
        pattern?: FlashSearchPattern,
    ) => {
        if (!settings.flashSearch) return;
        if (isFlashActive()) return;

        const rawTargets = findSearchMatchTargets(cm, pattern);
        const targets = filterVisibleTargets(cm, rawTargets);
        if (targets.length === 0) return;
        if (targets.length === 1) {
            const target = targets[0]!;
            const cursor = cm.getCursor();
            if (target.line !== cursor.line || target.ch !== cursor.ch) {
                recordInNoteJump(app, cm, cursor, target);
                cm.setCursor(target.line, target.ch);
            }
            return;
        }

        setFlashActive(true);
        const cursor = cm.getCursor();
        const labeler = new FlashLabeler();
        const labeled = labeler.assign(
            targets,
            settings.easyMotionLabels,
            cursor.line,
            cursor.ch,
        );

        const overlay = showOverlay(cm, labeled, {
            shade: settings.easyMotionDimming,
            fontSize: settings.labelFontSize,
            matchFontSize: settings.labelMatchFontSize,
        });
        if (!overlay) {
            setFlashActive(false);
            return;
        }

        postCommitOverlay = overlay;

        let labelPrefix = '';

        postCommitHandler = (e: KeyboardEvent) => {
            if (e.isComposing) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanupPostCommit();
                return;
            }

            if (e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();
                if (labelPrefix.length > 0) {
                    labelPrefix = '';
                    postCommitOverlay?.updateLabels(labeled);
                }
                return;
            }

            if (e.key.length !== 1) return;

            const typed = labelPrefix + e.key;
            const exact = labeled.find((t) => t.label === typed);
            if (exact) {
                e.preventDefault();
                e.stopPropagation();
                cleanupPostCommit();

                const fromCursor = cm.getCursor();
                if (exact.line !== fromCursor.line) {
                    recordInNoteJump(app, cm, fromCursor, exact);
                }
                cm.setCursor(exact.line, exact.ch);
                return;
            }

            const remaining = labeled.filter((t) => t.label.startsWith(typed));
            if (remaining.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                labelPrefix = typed;
                postCommitOverlay?.updateLabels(remaining);
                return;
            }

            cleanupPostCommit();
        };

        activeDocument.addEventListener('keydown', postCommitHandler, true);
    };

    const dialogHandler = () => {
        if (!lastAdapter) return;
        const dialog = lastAdapter.state?.dialog;

        if (dialog) {
            const prefix = getDialogPrefix(dialog);
            if (prefix === '/' || prefix === '?') {
                searchWasOpen = true;
            }
        } else if (searchWasOpen) {
            searchWasOpen = false;
            if (skipNextPostCommit) {
                skipNextPostCommit = false;
                return;
            }
            const adapter = lastAdapter;
            window.setTimeout(() => {
                showPostCommitLabels(adapter);
            }, 100);
        }
    };

    const flashSearchSubmitHandler = (e: KeyboardEvent) => {
        if (!settings.flashSearch || e.isComposing || e.key !== 'Enter') {
            return;
        }

        const adapter = lastAdapter;
        const dialog = adapter?.state?.dialog;
        if (!adapter || !dialog) return;

        const prefix = getDialogPrefix(dialog);
        if (prefix !== '/' && prefix !== '?') return;

        const input = dialog.querySelector<HTMLInputElement>('input');
        if (!input) return;
        const source = input.value;
        if (!isFlashSearchPattern(prefix, source)) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        skipNextPostCommit = true;

        const vim = getVimApi();
        const ignoreCase =
            vim?.getOption('ignorecase') === true &&
            (vim.getOption('smartcase') !== true || !/[A-Z]/.test(source));
        vim?.clearInputState?.(adapter, 'flash-search');
        input.blur();

        window.setTimeout(() => {
            showPostCommitLabels(adapter, {
                source,
                flags: ignoreCase ? 'i' : '',
            });
        }, 0);
    };

    const attachToAdapter = (adapter: CmAdapter) => {
        if (lastAdapter) {
            lastAdapter.off('dialog', dialogHandler);
        }
        lastAdapter = adapter;
        adapter.on('dialog', dialogHandler);
    };

    const leafChangeHandler = () => {
        cleanupPostCommit();
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const adapter = getCmAdapter(view);
        if (adapter) attachToAdapter(adapter);
    };

    leafChangeHandler();
    app.workspace.on('active-leaf-change', leafChangeHandler);
    activeDocument.addEventListener('keydown', flashSearchSubmitHandler, true);

    return () => {
        cleanupPostCommit();
        activeDocument.removeEventListener(
            'keydown',
            flashSearchSubmitHandler,
            true,
        );
        if (lastAdapter) {
            lastAdapter.off('dialog', dialogHandler);
            lastAdapter = null;
        }
    };
}
