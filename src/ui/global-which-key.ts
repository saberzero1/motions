import type { App } from 'obsidian';
import type { GlobalMapEntry } from '../workspace/global-mapping-registry';
import type { GlobalKeyHandler } from '../workspace/global-key-handler';

const SHOW_DELAY = 500;

export class GlobalWhichKeyOverlay {
    private app: App;
    private mode: 'leader' | 'all';
    private leaderKey: string;
    private commandLabels: Map<string, string>;
    private groupLabels: Map<string, string>;
    private overlay: HTMLElement | null = null;
    private showTimer: number | null = null;
    private handler: GlobalKeyHandler | null = null;

    constructor(
        app: App,
        mode: 'leader' | 'all',
        leaderKey: string,
        commandLabels: Map<string, string>,
        groupLabels: Map<string, string>,
    ) {
        this.app = app;
        this.mode = mode;
        this.leaderKey = leaderKey;
        this.commandLabels = commandLabels;
        this.groupLabels = groupLabels;
    }

    attach(handler: GlobalKeyHandler): void {
        this.handler = handler;
        handler.onGlobalChord = (chord, completions, doc) => {
            this.onChord(chord, completions, doc);
        };
    }

    destroy(): void {
        if (this.handler) {
            this.handler.onGlobalChord = undefined;
            this.handler = null;
        }
        this.dismiss();
    }

    private onChord(
        chord: string,
        completions: GlobalMapEntry[],
        doc: Document,
    ): void {
        if (!chord || completions.length === 0) {
            this.dismiss();
            return;
        }

        if (this.mode === 'leader') {
            const seq = chord.replace(/^\d+/, '');
            if (!seq.startsWith(this.leaderKey)) {
                this.dismiss();
                return;
            }
        }

        this.clearTimer();
        const capturedChord = chord;
        const capturedCompletions = completions;
        const capturedDoc = doc;
        this.showTimer = window.setTimeout(() => {
            this.showOverlay(capturedChord, capturedCompletions, capturedDoc);
        }, SHOW_DELAY);
    }

    private showOverlay(
        chord: string,
        completions: GlobalMapEntry[],
        doc: Document,
    ): void {
        this.dismiss();

        const container = this.getContainer(doc);
        if (!container) return;

        const keyPrefix = chord.replace(/^\d+/, '');

        const overlay = doc.createElement('div');
        overlay.className = 'vim-motions-which-key';

        const title = doc.createElement('div');
        title.className = 'vim-motions-which-key-title';
        title.textContent = chord + ' \u2026';
        overlay.appendChild(title);

        const grid = doc.createElement('div');
        grid.className = 'vim-motions-which-key-grid';

        const entries = this.buildEntries(keyPrefix, completions);
        for (const entry of entries) {
            const row = doc.createElement('div');
            row.className = entry.group
                ? 'vim-motions-which-key-row vim-motions-which-key-group'
                : 'vim-motions-which-key-row';

            const keySpan = doc.createElement('span');
            keySpan.className = 'vim-motions-which-key-key';
            keySpan.textContent = entry.key;
            row.appendChild(keySpan);

            const cmdSpan = doc.createElement('span');
            cmdSpan.className = 'vim-motions-which-key-cmd';
            cmdSpan.textContent = entry.description;
            row.appendChild(cmdSpan);

            grid.appendChild(row);
        }

        overlay.appendChild(grid);
        container.appendChild(overlay);
        this.overlay = overlay;
    }

    private buildEntries(
        keyPrefix: string,
        completions: GlobalMapEntry[],
    ): Array<{ key: string; description: string; group?: boolean }> {
        const groups = new Map<
            string,
            Array<{ suffix: string; entry: GlobalMapEntry }>
        >();

        for (const entry of completions) {
            if (!entry.keys.startsWith(keyPrefix)) continue;
            const suffix = entry.keys.slice(keyPrefix.length);
            if (!suffix) continue;

            const firstKey = suffix.startsWith('<')
                ? suffix.slice(0, suffix.indexOf('>') + 1) || suffix[0]
                : suffix[0];
            if (!firstKey) continue;

            let group = groups.get(firstKey);
            if (!group) {
                group = [];
                groups.set(firstKey, group);
            }
            group.push({ suffix, entry });
        }

        const result: Array<{
            key: string;
            description: string;
            group?: boolean;
        }> = [];

        for (const [nextKey, items] of groups) {
            if (items.length === 1) {
                const item = items[0]!;
                const label =
                    this.commandLabels.get(item.entry.keys) ??
                    item.entry.label ??
                    this.describeAction(item.entry);
                result.push({ key: item.suffix, description: label });
            } else {
                const groupLabel = this.groupLabels.get(keyPrefix + nextKey);
                const label = groupLabel
                    ? `${groupLabel} (+${items.length})`
                    : `+${items.length} keys`;
                result.push({
                    key: nextKey,
                    description: label,
                    group: true,
                });
            }
        }

        return result;
    }

    private describeAction(entry: GlobalMapEntry): string {
        const action = entry.action;
        if (action.type === 'obcommand') return ':ob ' + action.commandId;
        if (action.type === 'ex') return ':' + action.command;
        return '(builtin)';
    }

    private getContainer(doc: Document): HTMLElement | null {
        const mainDoc =
            this.app.workspace.containerEl.ownerDocument ?? activeDocument;
        if (doc === mainDoc) {
            return this.app.workspace.containerEl;
        }
        return doc.body.querySelector<HTMLElement>('.workspace') ?? null;
    }

    private clearTimer(): void {
        if (this.showTimer !== null) {
            window.clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    private dismiss(): void {
        this.clearTimer();
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}
