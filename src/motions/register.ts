import type { App } from 'obsidian';
import { VimRegistration } from '../vim/registration';
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
import { tableNextCellMotion, tablePrevCellMotion } from './tables';

export function registerNavigationMotions(reg: VimRegistration): void {
    reg.defineMotion('nextHeading', nextHeading);
    reg.mapCommand(']h', 'motion', 'nextHeading', {});
    reg.defineMotion('prevHeading', prevHeading);
    reg.mapCommand('[h', 'motion', 'prevHeading', {});

    reg.defineMotion('nextHeading1', nextHeading1);
    reg.mapCommand(']1', 'motion', 'nextHeading1', {});
    reg.defineMotion('prevHeading1', prevHeading1);
    reg.mapCommand('[1', 'motion', 'prevHeading1', {});

    reg.defineMotion('nextHeading2', nextHeading2);
    reg.mapCommand(']2', 'motion', 'nextHeading2', {});
    reg.defineMotion('prevHeading2', prevHeading2);
    reg.mapCommand('[2', 'motion', 'prevHeading2', {});

    reg.defineMotion('nextHeading3', nextHeading3);
    reg.mapCommand(']3', 'motion', 'nextHeading3', {});
    reg.defineMotion('prevHeading3', prevHeading3);
    reg.mapCommand('[3', 'motion', 'prevHeading3', {});

    reg.defineMotion('nextHeading4', nextHeading4);
    reg.mapCommand(']4', 'motion', 'nextHeading4', {});
    reg.defineMotion('prevHeading4', prevHeading4);
    reg.mapCommand('[4', 'motion', 'prevHeading4', {});

    reg.defineMotion('nextHeading5', nextHeading5);
    reg.mapCommand(']5', 'motion', 'nextHeading5', {});
    reg.defineMotion('prevHeading5', prevHeading5);
    reg.mapCommand('[5', 'motion', 'prevHeading5', {});

    reg.defineMotion('nextHeading6', nextHeading6);
    reg.mapCommand(']6', 'motion', 'nextHeading6', {});
    reg.defineMotion('prevHeading6', prevHeading6);
    reg.mapCommand('[6', 'motion', 'prevHeading6', {});

    reg.defineMotion('nextListItem', nextListItem);
    reg.mapCommand(']l', 'motion', 'nextListItem', {});
    reg.defineMotion('prevListItem', prevListItem);
    reg.mapCommand('[l', 'motion', 'prevListItem', {});

    reg.defineMotion('nextLink', nextLink);
    reg.mapCommand(']n', 'motion', 'nextLink', {});
    reg.defineMotion('prevLink', prevLink);
    reg.mapCommand('[n', 'motion', 'prevLink', {});
}

export function registerTableMotions(reg: VimRegistration): void {
    reg.defineMotion('tableNextCell', tableNextCellMotion);
    reg.mapCommand(']|', 'motion', 'tableNextCell', {});
    reg.defineMotion('tablePrevCell', tablePrevCellMotion);
    reg.mapCommand('[|', 'motion', 'tablePrevCell', {});
}

export function registerBufferNavigation(reg: VimRegistration, app: App): void {
    reg.defineAction('nextBuffer', nextBuffer(app));
    reg.mapCommand(']b', 'action', 'nextBuffer', {});
    reg.defineAction('prevBuffer', prevBuffer(app));
    reg.mapCommand('[b', 'action', 'prevBuffer', {});
}
