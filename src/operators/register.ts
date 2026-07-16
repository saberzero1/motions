import { VimRegistration } from '../vim/registration';
import { hardWrapOperator, hardWrapKeepCursorOperator } from './hardwrap';
import { replaceWithRegisterOperator } from './replace-with-register';
import { registerFoldCommands } from '../fold/commands';

export function registerOperators(reg: VimRegistration): void {
    reg.defineOperator('hardWrap', hardWrapOperator);
    reg.mapCommand('gq', 'operator', 'hardWrap', {});

    reg.defineOperator('hardWrapKeepCursor', hardWrapKeepCursorOperator);
    reg.mapCommand('gw', 'operator', 'hardWrapKeepCursor', {});

    reg.defineOperator('replaceWithRegister', replaceWithRegisterOperator);
    reg.mapCommand('gr', 'operator', 'replaceWithRegister', {});

    registerFoldCommands(reg);
}
