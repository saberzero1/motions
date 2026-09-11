import { Notice } from 'obsidian';
import type { NeovimRedrawDispatcher } from './redraw';

type NoticeSeverity = 'error' | 'warning' | 'info';

const NOTICE_COOLDOWN_MS = 5000;

function messageText(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    let text = '';
    for (const chunk of value) {
        if (!Array.isArray(chunk) || typeof chunk[1] !== 'string') continue;
        text += chunk[1];
    }
    return text || null;
}

function severityForKind(kind: unknown): NoticeSeverity | null {
    if (typeof kind !== 'string') return null;
    switch (kind) {
        case 'emsg':
        case 'echoerr':
        case 'lua_error':
        case 'rpc_error':
        case 'shell_err':
            return 'error';
        case 'wmsg':
            return 'warning';
        case 'echo':
        case 'echomsg':
        case 'lua_print':
        case 'shell_out':
        case 'shell_ret':
            return 'info';
        case 'confirm':
        case 'search_count':
        case 'undo':
        case 'progress':
        case 'verbose':
        case 'completion':
        case 'wildlist':
        case 'list_cmd':
        case 'search_cmd':
        case 'empty':
        case '':
        default:
            return null;
    }
}

class RateLimitedNotice {
    private readonly shownAt = new Map<string, number>();

    show(message: string, severity: NoticeSeverity): void {
        const now = Date.now();
        const key = `${severity}\0${message}`;
        const previous = this.shownAt.get(key);
        if (previous !== undefined && now - previous < NOTICE_COOLDOWN_MS)
            return;
        for (const [seen, at] of this.shownAt)
            if (now - at >= NOTICE_COOLDOWN_MS) this.shownAt.delete(seen);
        this.shownAt.set(key, now);
        const notice = new Notice(message);
        if (severity !== 'info')
            notice.noticeEl.classList.add(`vim-motions-rpc-notice-${severity}`);
    }

    clear(): void {
        this.shownAt.clear();
    }
}

export class NeovimMessageRouter {
    private readonly notices = new RateLimitedNotice();
    private readonly cleanup: () => void;

    constructor(dispatcher: NeovimRedrawDispatcher) {
        this.cleanup = dispatcher.on('msg_show', (args) =>
            this.handleMessage(args),
        );
    }

    dispose(): void {
        this.cleanup();
        this.notices.clear();
    }

    private handleMessage(value: unknown): void {
        if (!Array.isArray(value)) return;
        const severity = severityForKind(value[0]);
        if (!severity) return;
        const text = messageText(value[1]);
        if (!text) return;
        this.notices.show(text, severity);
    }
}
