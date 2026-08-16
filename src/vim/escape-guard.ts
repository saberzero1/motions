import { type App, MarkdownView } from 'obsidian';
import { Vim } from '@replit/codemirror-vim';
import type { VimIdleState } from '../editors/embeddable-editor';
import { isHintModeActive } from '../ui/hint-mode';
import { isEasyMotionActive } from '../easymotion/register';
import { isFlashActive } from '../flash/state';

interface CmAdapter {
    cm6: { dom: Element; contentDOM: HTMLElement };
    state: { vim?: VimIdleState };
}

function isWorkspaceLeafEditor(cm: CmAdapter): boolean {
    return cm.cm6.dom.closest('.workspace-leaf-content') !== null;
}

function dismissParentPopover(app: App): boolean {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const popover = (
        view as unknown as { hoverPopover?: { hide?: () => void } } | null
    )?.hoverPopover;
    if (popover?.hide) {
        popover.hide();
        return true;
    }
    return false;
}

export function installEscapeGuard(app: App): void {
    (
        Vim as unknown as {
            setIdleEscapeCallback: (
                fn: ((cm: CmAdapter) => void) | null,
            ) => void;
        }
    ).setIdleEscapeCallback((cm: CmAdapter) => {
        if (isHintModeActive() || isEasyMotionActive() || isFlashActive())
            return;

        // Main editor: do nothing — the fork already consumed the event
        if (isWorkspaceLeafEditor(cm)) return;

        // Non-workspace editor (popover, modal, third-party):
        // use HoverPopover.hide() if available, otherwise blur.
        if (!dismissParentPopover(app)) {
            window.requestAnimationFrame(() => {
                cm.cm6.contentDOM.blur();
            });
        }
    });
}
