import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';
import { getVimApi } from '../vim/vim-api';
import { getJumpListInstance } from '../workspace/navigate';
import { VimRegistration } from '../vim/registration';
import type { LeaderRegistry } from '../ui/which-key';
import type { Target } from './types';
import type { Direction } from './targets';
import {
    findWordStartTargets,
    findWordEndTargets,
    findCharTargets,
    findTillTargets,
    findLineTargets,
    findSearchTargets,
} from './targets';
import { assignLabels } from './labels';
import { showOverlay, filterVisibleTargets } from './overlay';
import { waitForKey, waitForLabel } from './keypress';

const DEFAULT_LABELS = 'asdghklqwertyuiopzxcvbnmfj';

let easyMotionActive = false;

export function isEasyMotionActive(): boolean {
    return easyMotionActive;
}

interface OverlayOptions {
    shade: () => boolean;
    fontSize: () => number;
    matchFontSize: () => boolean;
}

type MotionTriggerFactory = (
    app: App,
    labels: string,
    opts: OverlayOptions,
) => (cm: CmAdapter) => Promise<{ line: number; ch: number } | null>;

function createMotionTrigger(
    labels: string,
    opts: OverlayOptions,
    findTargets: (cm: CmAdapter) => Target[],
): (cm: CmAdapter) => Promise<{ line: number; ch: number } | null> {
    return async (cm) => {
        easyMotionActive = true;
        try {
            const targets = filterVisibleTargets(cm, findTargets(cm));
            if (targets.length === 0) return null;

            const labeled = assignLabels(targets, labels);
            const overlay = showOverlay(cm, labeled, {
                shade: opts.shade(),
                fontSize: opts.fontSize(),
                matchFontSize: opts.matchFontSize(),
            });
            if (!overlay) return null;

            try {
                const match = await waitForLabel(labeled, (remaining) => {
                    overlay.updateLabels(remaining);
                });
                return match ? { line: match.line, ch: match.ch } : null;
            } finally {
                overlay.cleanup();
            }
        } finally {
            easyMotionActive = false;
        }
    };
}

function createCharMotionTrigger(
    labels: string,
    opts: OverlayOptions,
    findTargets: (cm: CmAdapter, char: string) => Target[],
): (cm: CmAdapter) => Promise<{ line: number; ch: number } | null> {
    return async (cm) => {
        easyMotionActive = true;
        try {
            const charKey = await waitForKey();
            if (!charKey || charKey.length !== 1) return null;

            const targets = filterVisibleTargets(cm, findTargets(cm, charKey));
            if (targets.length === 0) return null;

            const labeled = assignLabels(targets, labels);
            const overlay = showOverlay(cm, labeled, {
                shade: opts.shade(),
                fontSize: opts.fontSize(),
                matchFontSize: opts.matchFontSize(),
            });
            if (!overlay) return null;

            try {
                const match = await waitForLabel(labeled, (remaining) => {
                    overlay.updateLabels(remaining);
                });
                return match ? { line: match.line, ch: match.ch } : null;
            } finally {
                overlay.cleanup();
            }
        } finally {
            easyMotionActive = false;
        }
    };
}

interface EasyMotionDef {
    name: string;
    keySuffix: string;
    description: string;
    createTrigger: MotionTriggerFactory;
}

function wordTrigger(
    direction: Direction,
    bigWord: boolean,
): MotionTriggerFactory {
    return (_app, labels, opts) =>
        createMotionTrigger(labels, opts, (cm) =>
            findWordStartTargets(cm, direction, bigWord),
        );
}

function wordEndTrigger(
    direction: Direction,
    bigWord: boolean,
): MotionTriggerFactory {
    return (_app, labels, opts) =>
        createMotionTrigger(labels, opts, (cm) =>
            findWordEndTargets(cm, direction, bigWord),
        );
}

function charTrigger(direction: Direction): MotionTriggerFactory {
    return (_app, labels, opts) =>
        createCharMotionTrigger(labels, opts, (cm, char) =>
            findCharTargets(cm, char, direction),
        );
}

function tillTrigger(direction: Direction): MotionTriggerFactory {
    return (_app, labels, opts) =>
        createCharMotionTrigger(labels, opts, (cm, char) =>
            findTillTargets(cm, char, direction),
        );
}

function lineTrigger(direction: Direction): MotionTriggerFactory {
    return (_app, labels, opts) =>
        createMotionTrigger(labels, opts, (cm) =>
            findLineTargets(cm, direction),
        );
}

function searchTrigger(direction: Direction): MotionTriggerFactory {
    return (_app, labels, opts) =>
        createMotionTrigger(labels, opts, (cm) => {
            const vim = getVimApi();
            return vim ? findSearchTargets(cm, direction, vim) : [];
        });
}

let lastMotionFactory:
    | ((cm: CmAdapter) => Promise<{ line: number; ch: number } | null>)
    | null = null;

const EASYMOTION_DEFS: EasyMotionDef[] = [
    {
        name: 'easyMotionFindChar',
        keySuffix: 'f',
        description: 'EasyMotion: find char',
        createTrigger: charTrigger('forward'),
    },
    {
        name: 'easyMotionFindCharBack',
        keySuffix: 'F',
        description: 'EasyMotion: find char backward',
        createTrigger: charTrigger('backward'),
    },
    {
        name: 'easyMotionBdFind',
        keySuffix: 's',
        description: 'EasyMotion: find char bidirectional',
        createTrigger: charTrigger('bidirectional'),
    },
    {
        name: 'easyMotionTillChar',
        keySuffix: 't',
        description: 'EasyMotion: till char',
        createTrigger: tillTrigger('forward'),
    },
    {
        name: 'easyMotionTillCharBack',
        keySuffix: 'T',
        description: 'EasyMotion: till char backward',
        createTrigger: tillTrigger('backward'),
    },
    {
        name: 'easyMotionWord',
        keySuffix: 'w',
        description: 'EasyMotion: word',
        createTrigger: wordTrigger('forward', false),
    },
    {
        name: 'easyMotionWordBack',
        keySuffix: 'b',
        description: 'EasyMotion: word backward',
        createTrigger: wordTrigger('backward', false),
    },
    {
        name: 'easyMotionEndWord',
        keySuffix: 'e',
        description: 'EasyMotion: end of word',
        createTrigger: wordEndTrigger('forward', false),
    },
    {
        name: 'easyMotionEndWordBack',
        keySuffix: 'ge',
        description: 'EasyMotion: end of word backward',
        createTrigger: wordEndTrigger('backward', false),
    },
    {
        name: 'easyMotionWORD',
        keySuffix: 'W',
        description: 'EasyMotion: WORD',
        createTrigger: wordTrigger('forward', true),
    },
    {
        name: 'easyMotionWORDBack',
        keySuffix: 'B',
        description: 'EasyMotion: WORD backward',
        createTrigger: wordTrigger('backward', true),
    },
    {
        name: 'easyMotionEndWORD',
        keySuffix: 'E',
        description: 'EasyMotion: end of WORD',
        createTrigger: wordEndTrigger('forward', true),
    },
    {
        name: 'easyMotionEndWORDBack',
        keySuffix: 'gE',
        description: 'EasyMotion: end of WORD backward',
        createTrigger: wordEndTrigger('backward', true),
    },
    {
        name: 'easyMotionLine',
        keySuffix: 'j',
        description: 'EasyMotion: line down',
        createTrigger: lineTrigger('forward'),
    },
    {
        name: 'easyMotionLineBack',
        keySuffix: 'k',
        description: 'EasyMotion: line up',
        createTrigger: lineTrigger('backward'),
    },
    {
        name: 'easyMotionSearchNext',
        keySuffix: 'n',
        description: 'EasyMotion: search next',
        createTrigger: searchTrigger('forward'),
    },
    {
        name: 'easyMotionSearchPrev',
        keySuffix: 'N',
        description: 'EasyMotion: search prev',
        createTrigger: searchTrigger('backward'),
    },
];

interface ExtraEasyMotionDef {
    name: string;
    createTrigger: MotionTriggerFactory;
}

const EXTRA_DEFS: ExtraEasyMotionDef[] = [
    {
        name: 'easyMotionBdWord',
        createTrigger: wordTrigger('bidirectional', false),
    },
    {
        name: 'easyMotionBdEndWord',
        createTrigger: wordEndTrigger('bidirectional', false),
    },
    {
        name: 'easyMotionBdWORD',
        createTrigger: wordTrigger('bidirectional', true),
    },
    {
        name: 'easyMotionBdEndWORD',
        createTrigger: wordEndTrigger('bidirectional', true),
    },
    {
        name: 'easyMotionBdLine',
        createTrigger: lineTrigger('bidirectional'),
    },
    {
        name: 'easyMotionBdTill',
        createTrigger: tillTrigger('bidirectional'),
    },
];

function recordJumpOnResolve(
    app: App,
    cm: CmAdapter,
    factory: (cm: CmAdapter) => Promise<{ line: number; ch: number } | null>,
): Promise<{ line: number; ch: number } | null> {
    const fromPos = cm.getCursor();
    const filePath =
        app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
    return factory(cm).then((result) => {
        if (result && filePath) {
            const jumpList = getJumpListInstance();
            jumpList?.recordJump(filePath, fromPos.line, fromPos.ch);
        }
        return result;
    });
}

export function registerEasyMotion(
    reg: VimRegistration,
    app: App,
    labels: string | undefined,
    leaderRegistry: LeaderRegistry,
    dimming: () => boolean,
    fontSize: () => number,
    matchFontSize: () => boolean,
): void {
    const chars = labels ?? DEFAULT_LABELS;
    const leader = leaderRegistry.getLeaderKey();
    const opts: OverlayOptions = { shade: dimming, fontSize, matchFontSize };

    // Unmap the leader key's default binding (e.g. <Space> → l) so that
    // mapCommand multi-key sequences starting with the leader can accumulate
    // in codemirror-vim's key buffer instead of being consumed immediately.
    reg.unmapDefaultBinding(leader);

    for (const def of EASYMOTION_DEFS) {
        const motionFactory = def.createTrigger(app, chars, opts);
        reg.defineMotion(def.name, (cm) => {
            lastMotionFactory = motionFactory;
            return recordJumpOnResolve(app, cm, motionFactory);
        });
        const keys = leader + leader + def.keySuffix;
        reg.mapCommand(keys, 'motion', def.name, {});
        leaderRegistry.addBinding(keys, def.description, 'builtin');
    }

    leaderRegistry.addGroupLabel(leader, 'EasyMotion', true, 'zap', 'yellow');

    for (const def of EXTRA_DEFS) {
        const motionFactory = def.createTrigger(app, chars, opts);
        reg.defineMotion(def.name, (cm) => {
            lastMotionFactory = motionFactory;
            return recordJumpOnResolve(app, cm, motionFactory);
        });
    }

    reg.defineAction('easyMotionRepeat', () => {
        if (!lastMotionFactory) return;
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;
        void lastMotionFactory(cm).then((pos) => {
            if (pos) cm.setCursor(pos.line, pos.ch);
        });
    });
}
