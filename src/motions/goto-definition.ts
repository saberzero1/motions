import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type { ActionFn } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s)>\]]+/g;

interface LinkMatch {
    start: number;
    end: number;
    target: string;
    isExternal: boolean;
}

function findLinksOnLine(lineText: string): LinkMatch[] {
    const results: LinkMatch[] = [];

    let match: RegExpExecArray | null;
    const wikiRe = new RegExp(WIKILINK_RE.source, 'g');
    while ((match = wikiRe.exec(lineText)) !== null) {
        const target = match[1]?.split('|')[0];
        if (target) {
            results.push({
                start: match.index,
                end: match.index + match[0].length,
                target,
                isExternal: false,
            });
        }
    }

    const mdRe = new RegExp(MD_LINK_RE.source, 'g');
    while ((match = mdRe.exec(lineText)) !== null) {
        const url = match[2];
        if (url) {
            results.push({
                start: match.index,
                end: match.index + match[0].length,
                target: url,
                isExternal: /^https?:\/\//.test(url),
            });
        }
    }

    const bareRe = new RegExp(BARE_URL_RE.source, 'g');
    while ((match = bareRe.exec(lineText)) !== null) {
        const alreadyCovered = results.some(
            (r) => match!.index >= r.start && match!.index < r.end,
        );
        if (!alreadyCovered) {
            results.push({
                start: match.index,
                end: match.index + match[0].length,
                target: match[0],
                isExternal: true,
            });
        }
    }

    return results.sort((a, b) => a.start - b.start);
}

export function findLinkAtCursor(
    lineText: string,
    ch: number,
): LinkMatch | null {
    const links = findLinksOnLine(lineText);
    for (const link of links) {
        if (ch >= link.start && ch < link.end) {
            return link;
        }
    }
    return null;
}

export function createGotoDefinitionAction(app: App): ActionFn {
    return () => {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;

        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line);
        const link = findLinkAtCursor(lineText, cursor.ch);
        if (!link) return;

        const sourcePath = view.file?.path ?? '';

        if (link.isExternal) {
            window.open(link.target);
        } else {
            void app.workspace.openLinkText(link.target, sourcePath);
        }
    };
}
