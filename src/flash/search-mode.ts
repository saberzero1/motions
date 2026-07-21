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
import { getJumpListInstance } from '../workspace/navigate';

interface FlashSearchSettings {
    flashSearch: boolean;
    easyMotionLabels: string;
    easyMotionDimming: boolean;
    labelFontSize: number;
    labelMatchFontSize: boolean;
}

function findSearchMatchTargets(cm: CmAdapter): Target[] {
    const vim = getVimApi();
    if (!vim) return [];

    const searchState = vim.getSearchState?.(cm);
    if (!searchState) return [];

    const query = searchState.getQuery?.();
    if (!query?.source) return [];

    const view = cm.cm6;
    if (!view) return [];

    const text = view.state.doc.toString();
    let re: RegExp;
    try {
        const flags = query.flags.includes('g')
            ? query.flags
            : query.flags + 'g';
        re = new RegExp(query.source, flags);
    } catch {
        return [];
    }

    const targets: Target[] = [];
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

    const showPostCommitLabels = (cm: CmAdapter) => {
        if (!settings.flashSearch) return;
        if (isFlashActive()) return;

        const rawTargets = findSearchMatchTargets(cm);
        const targets = filterVisibleTargets(cm, rawTargets);
        if (targets.length < 2) return;

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
                const filePath =
                    app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
                if (filePath && exact.line !== fromCursor.line) {
                    getJumpListInstance()?.recordJump(
                        filePath,
                        fromCursor.line,
                        fromCursor.ch,
                    );
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
            const adapter = lastAdapter;
            window.setTimeout(() => {
                showPostCommitLabels(adapter);
            }, 100);
        }
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

    return () => {
        cleanupPostCommit();
        if (lastAdapter) {
            lastAdapter.off('dialog', dialogHandler);
            lastAdapter = null;
        }
    };
}
