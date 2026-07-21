import type { App } from 'obsidian';
import type { VimApi, MotionFn } from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import { createFlashCharMotion } from './char-mode';
import { createFlashJumpMotion } from './jump-mode';

interface FlashSettings {
    enableFlash: boolean;
    flashMultiLine: boolean;
    flashJumpEnabled: boolean;
    flashJumpKey: string;
    flashCleverF: boolean;
    flashMinPatternLength: number;
    flashSearch: boolean;
    easyMotionDimming: boolean;
    easyMotionLabels: string;
    labelFontSize: number;
    labelMatchFontSize: boolean;
}

let savedOrigMoveToChar: MotionFn | null = null;
let savedOrigMoveTillChar: MotionFn | null = null;

export function registerFlash(
    reg: VimRegistration,
    app: App,
    settings: FlashSettings,
    vim: VimApi,
): void {
    if (!savedOrigMoveToChar) {
        savedOrigMoveToChar =
            (vim.getMotion('moveToCharacter') as MotionFn) ?? null;
    }
    if (!savedOrigMoveTillChar) {
        savedOrigMoveTillChar =
            (vim.getMotion('moveTillCharacter') as MotionFn) ?? null;
    }

    if (!savedOrigMoveToChar || !savedOrigMoveTillChar) return;

    const opts = {
        enableFlash: () => settings.enableFlash,
        multiLine: () => settings.flashMultiLine,
        cleverF: () => settings.flashCleverF,
        labels: () => settings.easyMotionLabels,
        dimming: () => settings.easyMotionDimming,
        fontSize: () => settings.labelFontSize,
        matchFontSize: () => settings.labelMatchFontSize,
        app,
    };

    reg.defineMotion(
        'moveToCharacter',
        createFlashCharMotion(savedOrigMoveToChar, false, opts),
    );

    reg.defineMotion(
        'moveTillCharacter',
        createFlashCharMotion(savedOrigMoveTillChar, true, opts),
    );

    if (settings.flashJumpEnabled && settings.flashJumpKey) {
        const jumpOpts = {
            enabled: () => settings.flashJumpEnabled,
            minPatternLength: () => settings.flashMinPatternLength,
            labels: () => settings.easyMotionLabels,
            dimming: () => settings.easyMotionDimming,
            fontSize: () => settings.labelFontSize,
            matchFontSize: () => settings.labelMatchFontSize,
            app,
        };

        reg.defineMotion('flashJump', createFlashJumpMotion(jumpOpts));
        reg.mapCommand(settings.flashJumpKey, 'motion', 'flashJump', {});
    }
}
