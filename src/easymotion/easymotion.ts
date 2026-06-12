import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { ActionFn, CmAdapter } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';
import { VimRegistration } from '../vim/registration';

const DEFAULT_LABELS = 'asdghklqwertyuiopzxcvbnmfj';

interface Target {
    line: number;
    ch: number;
    label: string;
}

function getVisibleRange(cm: CmAdapter): { fromLine: number; toLine: number } {
    const view = cm.cm6;
    if (!view) return { fromLine: 0, toLine: cm.lastLine() };
    const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const bottom = view.lineBlockAtHeight(
        view.scrollDOM.scrollTop + view.scrollDOM.clientHeight,
    );
    const fromLine = view.state.doc.lineAt(top.from).number - 1;
    const toLine = view.state.doc.lineAt(bottom.to).number - 1;
    return { fromLine, toLine };
}

function findWordTargets(cm: CmAdapter, labels: string): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const targets: Target[] = [];
    const wordRe = /\b\w/g;
    let labelIdx = 0;

    for (
        let line = fromLine;
        line <= toLine && labelIdx < labels.length;
        line++
    ) {
        const text = cm.getLine(line);
        let match: RegExpExecArray | null;
        wordRe.lastIndex = 0;
        while (
            (match = wordRe.exec(text)) !== null &&
            labelIdx < labels.length
        ) {
            const label = labels[labelIdx++];
            if (label) targets.push({ line, ch: match.index, label });
        }
    }
    return targets;
}

function findCharTargets(
    cm: CmAdapter,
    char: string,
    labels: string,
): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const targets: Target[] = [];
    let labelIdx = 0;

    for (
        let line = fromLine;
        line <= toLine && labelIdx < labels.length;
        line++
    ) {
        const text = cm.getLine(line);
        let idx = 0;
        while (idx < text.length && labelIdx < labels.length) {
            const found = text.indexOf(char, idx);
            if (found === -1) break;
            const label = labels[labelIdx++];
            if (label) targets.push({ line, ch: found, label });
            idx = found + 1;
        }
    }
    return targets;
}

function findLineTargets(cm: CmAdapter, labels: string): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const targets: Target[] = [];
    let labelIdx = 0;

    for (
        let line = fromLine;
        line <= toLine && labelIdx < labels.length;
        line++
    ) {
        const text = cm.getLine(line);
        if (text.trim().length === 0) continue;
        const firstNonBlank = text.search(/\S/);
        const label = labels[labelIdx++];
        if (label)
            targets.push({ line, ch: Math.max(0, firstNonBlank), label });
    }
    return targets;
}

function showOverlays(
    cm: CmAdapter,
): { container: HTMLElement; addLabel: (target: Target) => void } | null {
    const view = cm.cm6;
    if (!view) return null;

    const container = createDiv({ cls: 'vim-motions-easymotion' });
    view.scrollDOM.appendChild(container);

    const scrollRect = view.scrollDOM.getBoundingClientRect();
    const scrollLeft = view.scrollDOM.scrollLeft;
    const scrollTop = view.scrollDOM.scrollTop;

    return {
        container,
        addLabel: (target: Target) => {
            const offset = cm.indexFromPos({
                line: target.line,
                ch: target.ch,
            });
            const coords = view.coordsAtPos(offset);
            if (!coords) return;
            const el = container.createSpan({
                cls: 'vim-motions-easymotion-label',
                text: target.label,
            });
            el.setCssProps({
                '--em-left': `${coords.left - scrollRect.left + scrollLeft}px`,
                '--em-top': `${coords.top - scrollRect.top + scrollTop}px`,
            });
        },
    };
}

function waitForKey(): Promise<string | null> {
    return new Promise((resolve) => {
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            activeDocument.removeEventListener('keydown', handler, true);
            if (e.key === 'Escape') {
                resolve(null);
            } else {
                resolve(e.key);
            }
        };
        activeDocument.addEventListener('keydown', handler, true);
    });
}

function createEasyMotionAction(
    app: App,
    mode: 'word' | 'line',
    labels: string,
): ActionFn {
    return () => {
        const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) return;
        const cm = getCmAdapter(markdownView);
        if (!cm) return;

        const targets =
            mode === 'word'
                ? findWordTargets(cm, labels)
                : findLineTargets(cm, labels);

        if (targets.length === 0) return;

        const overlay = showOverlays(cm);
        if (!overlay) return;
        for (const target of targets) overlay.addLabel(target);

        void waitForKey().then((key) => {
            overlay.container.remove();
            if (!key) return;
            const target = targets.find((t) => t.label === key);
            if (target) cm.setCursor(target.line, target.ch);
        });
    };
}

function createFindCharAction(app: App, labels: string): ActionFn {
    return () => {
        const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) return;
        const cm = getCmAdapter(markdownView);
        if (!cm) return;

        void waitForKey().then((charKey) => {
            if (!charKey || charKey.length !== 1) return;

            const targets = findCharTargets(cm, charKey, labels);
            if (targets.length === 0) return;

            const overlay = showOverlays(cm);
            if (!overlay) return;
            for (const target of targets) overlay.addLabel(target);

            void waitForKey().then((labelKey) => {
                overlay.container.remove();
                if (!labelKey) return;
                const target = targets.find((t) => t.label === labelKey);
                if (target) cm.setCursor(target.line, target.ch);
            });
        });
    };
}

export function registerEasyMotion(
    reg: VimRegistration,
    app: App,
    labels?: string,
): void {
    const chars = labels ?? DEFAULT_LABELS;

    reg.defineAction(
        'easyMotionWord',
        createEasyMotionAction(app, 'word', chars),
    );
    reg.mapCommand('<leader><leader>w', 'action', 'easyMotionWord', {});

    reg.defineAction(
        'easyMotionLine',
        createEasyMotionAction(app, 'line', chars),
    );
    reg.mapCommand('<leader><leader>j', 'action', 'easyMotionLine', {});

    reg.defineAction('easyMotionFindChar', createFindCharAction(app, chars));
    reg.mapCommand('<leader><leader>f', 'action', 'easyMotionFindChar', {});
}
