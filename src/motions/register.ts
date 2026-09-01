import type { App } from 'obsidian';
import type { MotionFn } from '../types/vim-api';
import { VimRegistration } from '../vim/registration';
import { armFoldAwareUnfold } from '../vim/fold-sync';
import {
    exCommandFromMotion,
    exCommandFromAction,
} from '../keybindings/action-registry';
import { nextBuffer, prevBuffer } from './buffers';
import {
    nextHeading,
    prevHeading,
    nextHeading1,
    prevHeading1,
    nextHeading2,
    prevHeading2,
    nextHeading3,
    prevHeading3,
    nextHeading4,
    prevHeading4,
    nextHeading5,
    prevHeading5,
    nextHeading6,
    prevHeading6,
} from './headings';
import { nextListItem, prevListItem } from './lists';
import { nextLink, prevLink } from './links';
import {
    tableNextCellMotion,
    tablePrevCellMotion,
    tableNextRowMotion,
    tablePrevRowMotion,
    registerTableActions,
} from './tables';
import {
    subwordBackward,
    subwordEndBackward,
    subwordEndForward,
    subwordForward,
} from './subword';

/**
 * Wrap a structural navigation motion so that jumping into a folded section
 * reveals it (when fold-aware navigation is enabled).  Plain motions like
 * `j`/`k` are intentionally left untouched so they never open folds, matching
 * Neovim's `foldopen` behavior.
 */
function foldAwareNav(fn: MotionFn): MotionFn {
    return (cm, head, motionArgs, vim, inputState) => {
        armFoldAwareUnfold();
        return fn(cm, head, motionArgs, vim, inputState);
    };
}

export function registerNavigationMotions(reg: VimRegistration): void {
    const nextHeadingN = foldAwareNav(nextHeading);
    const prevHeadingN = foldAwareNav(prevHeading);
    const nextHeading1N = foldAwareNav(nextHeading1);
    const prevHeading1N = foldAwareNav(prevHeading1);
    const nextHeading2N = foldAwareNav(nextHeading2);
    const prevHeading2N = foldAwareNav(prevHeading2);
    const nextHeading3N = foldAwareNav(nextHeading3);
    const prevHeading3N = foldAwareNav(prevHeading3);
    const nextHeading4N = foldAwareNav(nextHeading4);
    const prevHeading4N = foldAwareNav(prevHeading4);
    const nextHeading5N = foldAwareNav(nextHeading5);
    const prevHeading5N = foldAwareNav(prevHeading5);
    const nextHeading6N = foldAwareNav(nextHeading6);
    const prevHeading6N = foldAwareNav(prevHeading6);
    const nextListItemN = foldAwareNav(nextListItem);
    const prevListItemN = foldAwareNav(prevListItem);
    const nextLinkN = foldAwareNav(nextLink);
    const prevLinkN = foldAwareNav(prevLink);

    reg.defineMotion('nextHeading', nextHeadingN);
    reg.mapCommand(']h', 'motion', 'nextHeading', {});
    exCommandFromMotion(reg, 'nextheading', '', nextHeadingN);
    reg.defineMotion('prevHeading', prevHeadingN);
    reg.mapCommand('[h', 'motion', 'prevHeading', {});
    exCommandFromMotion(reg, 'prevheading', '', prevHeadingN);

    reg.defineMotion('nextHeading1', nextHeading1N);
    reg.mapCommand(']1', 'motion', 'nextHeading1', {});
    exCommandFromMotion(reg, 'nextheading1', '', nextHeading1N);
    reg.defineMotion('prevHeading1', prevHeading1N);
    reg.mapCommand('[1', 'motion', 'prevHeading1', {});
    exCommandFromMotion(reg, 'prevheading1', '', prevHeading1N);

    reg.defineMotion('nextHeading2', nextHeading2N);
    reg.mapCommand(']2', 'motion', 'nextHeading2', {});
    exCommandFromMotion(reg, 'nextheading2', '', nextHeading2N);
    reg.defineMotion('prevHeading2', prevHeading2N);
    reg.mapCommand('[2', 'motion', 'prevHeading2', {});
    exCommandFromMotion(reg, 'prevheading2', '', prevHeading2N);

    reg.defineMotion('nextHeading3', nextHeading3N);
    reg.mapCommand(']3', 'motion', 'nextHeading3', {});
    exCommandFromMotion(reg, 'nextheading3', '', nextHeading3N);
    reg.defineMotion('prevHeading3', prevHeading3N);
    reg.mapCommand('[3', 'motion', 'prevHeading3', {});
    exCommandFromMotion(reg, 'prevheading3', '', prevHeading3N);

    reg.defineMotion('nextHeading4', nextHeading4N);
    reg.mapCommand(']4', 'motion', 'nextHeading4', {});
    exCommandFromMotion(reg, 'nextheading4', '', nextHeading4N);
    reg.defineMotion('prevHeading4', prevHeading4N);
    reg.mapCommand('[4', 'motion', 'prevHeading4', {});
    exCommandFromMotion(reg, 'prevheading4', '', prevHeading4N);

    reg.defineMotion('nextHeading5', nextHeading5N);
    reg.mapCommand(']5', 'motion', 'nextHeading5', {});
    exCommandFromMotion(reg, 'nextheading5', '', nextHeading5N);
    reg.defineMotion('prevHeading5', prevHeading5N);
    reg.mapCommand('[5', 'motion', 'prevHeading5', {});
    exCommandFromMotion(reg, 'prevheading5', '', prevHeading5N);

    reg.defineMotion('nextHeading6', nextHeading6N);
    reg.mapCommand(']6', 'motion', 'nextHeading6', {});
    exCommandFromMotion(reg, 'nextheading6', '', nextHeading6N);
    reg.defineMotion('prevHeading6', prevHeading6N);
    reg.mapCommand('[6', 'motion', 'prevHeading6', {});
    exCommandFromMotion(reg, 'prevheading6', '', prevHeading6N);

    reg.defineMotion('nextListItem', nextListItemN);
    reg.mapCommand(']l', 'motion', 'nextListItem', {});
    exCommandFromMotion(reg, 'nextlistitem', 'nextlis', nextListItemN);
    reg.defineMotion('prevListItem', prevListItemN);
    reg.mapCommand('[l', 'motion', 'prevListItem', {});
    exCommandFromMotion(reg, 'prevlistitem', 'prevlis', prevListItemN);

    reg.defineMotion('nextLink', nextLinkN);
    reg.mapCommand(']n', 'motion', 'nextLink', {});
    exCommandFromMotion(reg, 'nextlink', '', nextLinkN);
    reg.defineMotion('prevLink', prevLinkN);
    reg.mapCommand('[n', 'motion', 'prevLink', {});
    exCommandFromMotion(reg, 'prevlink', '', prevLinkN);
}

export function registerTableMotions(reg: VimRegistration): void {
    reg.defineMotion('tableNextCell', tableNextCellMotion);
    reg.mapCommand(']|', 'motion', 'tableNextCell', {});
    reg.mapCommand(']c', 'motion', 'tableNextCell', {});
    exCommandFromMotion(
        reg,
        'tablenextcell',
        'tablenextc',
        tableNextCellMotion,
    );
    reg.defineMotion('tablePrevCell', tablePrevCellMotion);
    reg.mapCommand('[|', 'motion', 'tablePrevCell', {});
    reg.mapCommand('[c', 'motion', 'tablePrevCell', {});
    exCommandFromMotion(
        reg,
        'tableprevcell',
        'tableprevc',
        tablePrevCellMotion,
    );
    reg.defineMotion('tableNextRow', tableNextRowMotion);
    reg.mapCommand(']r', 'motion', 'tableNextRow', {});
    exCommandFromMotion(reg, 'tablenextrow', '', tableNextRowMotion);
    reg.defineMotion('tablePrevRow', tablePrevRowMotion);
    reg.mapCommand('[r', 'motion', 'tablePrevRow', {});
    exCommandFromMotion(reg, 'tableprevrow', '', tablePrevRowMotion);
}

export { registerTableActions };

export function registerSubwordMotions(reg: VimRegistration): void {
    reg.defineMotion('subwordForward', subwordForward);
    reg.mapCommand('w', 'motion', 'subwordForward', {});
    reg.defineMotion('subwordBackward', subwordBackward);
    reg.mapCommand('b', 'motion', 'subwordBackward', {});
    reg.defineMotion('subwordEndForward', subwordEndForward);
    reg.mapCommand('e', 'motion', 'subwordEndForward', { inclusive: true });
    reg.defineMotion('subwordEndBackward', subwordEndBackward);
    reg.mapCommand('ge', 'motion', 'subwordEndBackward', { inclusive: true });
}

export function registerBufferNavigation(reg: VimRegistration, app: App): void {
    const nextBuf = nextBuffer(app);
    reg.defineAction('nextBuffer', nextBuf);
    reg.mapCommand(']b', 'action', 'nextBuffer', {});
    exCommandFromAction(reg, 'nextbuffer', 'nextb', nextBuf);
    const prevBuf = prevBuffer(app);
    reg.defineAction('prevBuffer', prevBuf);
    reg.mapCommand('[b', 'action', 'prevBuffer', {});
    exCommandFromAction(reg, 'prevbuffer', 'prevb', prevBuf);
}
