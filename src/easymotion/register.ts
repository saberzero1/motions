import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import type { CmAdapter } from '../types/vim-api';
import { getCmAdapter } from '../vim/vim-api';
import { getVimApi } from '../vim/vim-api';
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
import { showOverlay } from './overlay';
import { waitForKey, waitForLabel } from './keypress';

const DEFAULT_LABELS = 'asdghklqwertyuiopzxcvbnmfj';

type TargetFinder = (app: App, labels: string, shade: boolean) => () => void;

function jumpToTarget(cm: CmAdapter, target: Target): void {
    const vim = cm.state.vim;
    if (vim?.visualMode && cm.cm6) {
        const anchorPos = cm.getCursor('anchor');
        const anchorOffset = cm.indexFromPos(anchorPos);
        const headOffset = cm.indexFromPos({
            line: target.line,
            ch: target.ch,
        });
        cm.cm6.dispatch({
            selection: { anchor: anchorOffset, head: headOffset },
        });
    } else {
        cm.setCursor(target.line, target.ch);
    }
}

function createJumpTrigger(
    app: App,
    labels: string,
    shade: boolean,
    findTargets: () => Target[],
): () => void {
    return () => {
        const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) return;
        const cm = getCmAdapter(markdownView);
        if (!cm) return;

        const targets = findTargets();
        if (targets.length === 0) return;

        const labeled = assignLabels(targets, labels);
        const overlay = showOverlay(cm, labeled, { shade });
        if (!overlay) return;

        void waitForLabel(labeled, (remaining) => {
            overlay.updateLabels(remaining);
        }).then((match) => {
            overlay.cleanup();
            if (match) jumpToTarget(cm, match);
        });
    };
}

function createCharInputTrigger(
    app: App,
    labels: string,
    shade: boolean,
    findTargets: (char: string) => Target[],
): () => void {
    return () => {
        const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) return;
        const cm = getCmAdapter(markdownView);
        if (!cm) return;

        void waitForKey().then((charKey) => {
            if (!charKey || charKey.length !== 1) return;

            const targets = findTargets(charKey);
            if (targets.length === 0) return;

            const labeled = assignLabels(targets, labels);
            const overlay = showOverlay(cm, labeled, { shade });
            if (!overlay) return;

            void waitForLabel(labeled, (remaining) => {
                overlay.updateLabels(remaining);
            }).then((match) => {
                overlay.cleanup();
                if (match) jumpToTarget(cm, match);
            });
        });
    };
}

function getCm(app: App) {
    const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return null;
    return getCmAdapter(markdownView);
}

interface EasyMotionDef {
    name: string;
    keySuffix: string;
    description: string;
    createTrigger: TargetFinder;
}

function wordTrigger(direction: Direction, bigWord: boolean): TargetFinder {
    return (app, labels, shade) =>
        createJumpTrigger(app, labels, shade, () => {
            const cm = getCm(app);
            return cm ? findWordStartTargets(cm, direction, bigWord) : [];
        });
}

function wordEndTrigger(direction: Direction, bigWord: boolean): TargetFinder {
    return (app, labels, shade) =>
        createJumpTrigger(app, labels, shade, () => {
            const cm = getCm(app);
            return cm ? findWordEndTargets(cm, direction, bigWord) : [];
        });
}

function charTrigger(direction: Direction): TargetFinder {
    return (app, labels, shade) =>
        createCharInputTrigger(app, labels, shade, (char) => {
            const cm = getCm(app);
            return cm ? findCharTargets(cm, char, direction) : [];
        });
}

function tillTrigger(direction: Direction): TargetFinder {
    return (app, labels, shade) =>
        createCharInputTrigger(app, labels, shade, (char) => {
            const cm = getCm(app);
            return cm ? findTillTargets(cm, char, direction) : [];
        });
}

function lineTrigger(direction: Direction): TargetFinder {
    return (app, labels, shade) =>
        createJumpTrigger(app, labels, shade, () => {
            const cm = getCm(app);
            return cm ? findLineTargets(cm, direction) : [];
        });
}

function searchTrigger(direction: Direction): TargetFinder {
    return (app, labels, shade) =>
        createJumpTrigger(app, labels, shade, () => {
            const cm = getCm(app);
            const vim = getVimApi();
            return cm && vim ? findSearchTargets(cm, direction, vim) : [];
        });
}

let lastTrigger: (() => void) | null = null;

function trackAndRun(trigger: () => void): () => void {
    return () => {
        lastTrigger = trigger;
        trigger();
    };
}

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
    createTrigger: TargetFinder;
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

export function registerEasyMotion(
    reg: VimRegistration,
    app: App,
    labels: string | undefined,
    leaderRegistry: LeaderRegistry,
    dimming?: boolean,
): void {
    const chars = labels ?? DEFAULT_LABELS;
    const shade = dimming ?? true;
    const leader = leaderRegistry.getLeaderKey();

    // Unmap the leader key's default binding (e.g. <Space> → l) so that
    // mapCommand multi-key sequences starting with the leader can accumulate
    // in codemirror-vim's key buffer instead of being consumed immediately.
    reg.unmapDefaultBinding(leader);

    for (const def of EASYMOTION_DEFS) {
        const trigger = trackAndRun(def.createTrigger(app, chars, shade));
        reg.defineAction(def.name, trigger);
        const keys = leader + leader + def.keySuffix;
        reg.mapCommand(keys, 'action', def.name, {});
        leaderRegistry.addBinding(keys, def.description, 'builtin');
    }

    for (const def of EXTRA_DEFS) {
        const trigger = trackAndRun(def.createTrigger(app, chars, shade));
        reg.defineAction(def.name, trigger);
    }

    reg.defineAction('easyMotionRepeat', () => {
        if (lastTrigger) lastTrigger();
    });
}
