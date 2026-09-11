import { describe, expect, it } from 'vitest';
import type { ActionFn, MotionFn, VimApi } from '../../src/types/vim-api';
import { VimRegistration } from '../../src/vim/registration';

const motion: MotionFn = (_cm, head) => head;
const action: ActionFn = () => {};

function registerFeaturePass(registration: VimRegistration): void {
    for (let index = 0; index < 75; index++) {
        registration.defineMotion(
            index === 0 ? 'nextHeading' : `motion${index}`,
            motion,
        );
    }
    const selectedActions = ['pickerFiles', 'harpoonSelect1', 'splitVertical'];
    for (let index = 0; index < 78; index++) {
        registration.defineAction(
            selectedActions[index] ?? `action${index}`,
            action,
        );
    }
    registration.mapCommand(']h', 'motion', 'nextHeading');
    for (const [index, name] of selectedActions.entries()) {
        registration.mapCommand(`key${index}`, 'action', name);
    }
    for (let index = 4; index < 164; index++) {
        registration.mapCommand(`key${index}`, 'action', 'action3');
    }
    registration.defineEx('Oil', '', () => {});
    registration.defineEx('sidebar', '', () => {});
    for (let index = 2; index < 102; index++) {
        registration.defineEx(`command${index}`, '', () => {});
    }
}

describe('feature registration inventory', () => {
    it('keeps the measured registration surface and bridge selections', () => {
        const registration = new VimRegistration({
            defineMotion: () => {},
            defineAction: () => {},
            mapCommand: () => {},
            defineEx: () => {},
        } as unknown as VimApi);
        registerFeaturePass(registration);

        expect(registration.getInventory()).toEqual({
            motions: 75,
            actions: 78,
            mapCommands: 164,
            exCommands: 102,
        });
        expect(
            registration
                .getMapCommands(
                    new Set([
                        'pickerFiles',
                        'harpoonSelect1',
                        'splitVertical',
                        'nextHeading',
                    ]),
                )
                .map(({ name }) => name),
        ).toEqual([
            'nextHeading',
            'pickerFiles',
            'harpoonSelect1',
            'splitVertical',
        ]);
        expect(
            registration
                .getExCommands(new Set(['Oil', 'sidebar']))
                .map(({ name }) => name),
        ).toEqual(['Oil', 'sidebar']);
    });
});
