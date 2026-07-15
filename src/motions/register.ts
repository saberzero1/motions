import type { App } from 'obsidian';
import { VimRegistration } from '../vim/registration';
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

export function registerNavigationMotions(reg: VimRegistration): void {
    reg.defineMotion('nextHeading', nextHeading);
    reg.mapCommand(']h', 'motion', 'nextHeading', {});
    exCommandFromMotion(reg, 'nextheading', '', nextHeading);
    reg.defineMotion('prevHeading', prevHeading);
    reg.mapCommand('[h', 'motion', 'prevHeading', {});
    exCommandFromMotion(reg, 'prevheading', '', prevHeading);

    reg.defineMotion('nextHeading1', nextHeading1);
    reg.mapCommand(']1', 'motion', 'nextHeading1', {});
    exCommandFromMotion(reg, 'nextheading1', '', nextHeading1);
    reg.defineMotion('prevHeading1', prevHeading1);
    reg.mapCommand('[1', 'motion', 'prevHeading1', {});
    exCommandFromMotion(reg, 'prevheading1', '', prevHeading1);

    reg.defineMotion('nextHeading2', nextHeading2);
    reg.mapCommand(']2', 'motion', 'nextHeading2', {});
    exCommandFromMotion(reg, 'nextheading2', '', nextHeading2);
    reg.defineMotion('prevHeading2', prevHeading2);
    reg.mapCommand('[2', 'motion', 'prevHeading2', {});
    exCommandFromMotion(reg, 'prevheading2', '', prevHeading2);

    reg.defineMotion('nextHeading3', nextHeading3);
    reg.mapCommand(']3', 'motion', 'nextHeading3', {});
    exCommandFromMotion(reg, 'nextheading3', '', nextHeading3);
    reg.defineMotion('prevHeading3', prevHeading3);
    reg.mapCommand('[3', 'motion', 'prevHeading3', {});
    exCommandFromMotion(reg, 'prevheading3', '', prevHeading3);

    reg.defineMotion('nextHeading4', nextHeading4);
    reg.mapCommand(']4', 'motion', 'nextHeading4', {});
    exCommandFromMotion(reg, 'nextheading4', '', nextHeading4);
    reg.defineMotion('prevHeading4', prevHeading4);
    reg.mapCommand('[4', 'motion', 'prevHeading4', {});
    exCommandFromMotion(reg, 'prevheading4', '', prevHeading4);

    reg.defineMotion('nextHeading5', nextHeading5);
    reg.mapCommand(']5', 'motion', 'nextHeading5', {});
    exCommandFromMotion(reg, 'nextheading5', '', nextHeading5);
    reg.defineMotion('prevHeading5', prevHeading5);
    reg.mapCommand('[5', 'motion', 'prevHeading5', {});
    exCommandFromMotion(reg, 'prevheading5', '', prevHeading5);

    reg.defineMotion('nextHeading6', nextHeading6);
    reg.mapCommand(']6', 'motion', 'nextHeading6', {});
    exCommandFromMotion(reg, 'nextheading6', '', nextHeading6);
    reg.defineMotion('prevHeading6', prevHeading6);
    reg.mapCommand('[6', 'motion', 'prevHeading6', {});
    exCommandFromMotion(reg, 'prevheading6', '', prevHeading6);

    reg.defineMotion('nextListItem', nextListItem);
    reg.mapCommand(']l', 'motion', 'nextListItem', {});
    exCommandFromMotion(reg, 'nextlistitem', 'nextlis', nextListItem);
    reg.defineMotion('prevListItem', prevListItem);
    reg.mapCommand('[l', 'motion', 'prevListItem', {});
    exCommandFromMotion(reg, 'prevlistitem', 'prevlis', prevListItem);

    reg.defineMotion('nextLink', nextLink);
    reg.mapCommand(']n', 'motion', 'nextLink', {});
    exCommandFromMotion(reg, 'nextlink', '', nextLink);
    reg.defineMotion('prevLink', prevLink);
    reg.mapCommand('[n', 'motion', 'prevLink', {});
    exCommandFromMotion(reg, 'prevlink', '', prevLink);
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
