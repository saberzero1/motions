import type { CmAdapter } from '../types/vim-api';
import { getVimApi } from './vim-api';

export interface SearchCount {
    current: number;
    total: number;
    cursorOnMatch: boolean;
}

const MAX_MATCHES = 9999;

export function countSearchMatches(cm: CmAdapter): SearchCount | null {
    const vim = getVimApi();
    if (!vim) return null;

    const searchState = vim.getSearchState?.(cm);
    if (!searchState) return null;

    const query = searchState.getQuery?.();
    if (!query?.source) return null;

    const view = cm.cm6;
    if (!view) return null;

    const text = view.state.doc.toString();
    const cursorOffset = cm.indexFromPos(cm.getCursor());

    let re: RegExp;
    try {
        const flags = query.flags.includes('g')
            ? query.flags
            : query.flags + 'g';
        re = new RegExp(query.source, flags);
    } catch {
        return null;
    }

    let total = 0;
    let current = 0;
    let cursorOnMatch = false;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        total++;
        if (total > MAX_MATCHES) {
            return { current: 0, total: MAX_MATCHES, cursorOnMatch: false };
        }
        if (match.index === cursorOffset) {
            current = total;
            cursorOnMatch = true;
        } else if (current === 0 && match.index > cursorOffset) {
            current = total;
        }
        if (match[0].length === 0) {
            re.lastIndex++;
        }
    }

    if (total === 0) return null;

    return { current: current || total, total, cursorOnMatch };
}

export function formatSearchCount(count: SearchCount): string {
    if (count.total === 0) return '';
    return `[${count.current}/${count.total}]`;
}
