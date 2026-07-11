import { VimRegistration } from '../vim/registration';
import { hardWrapOperator, hardWrapKeepCursorOperator } from './hardwrap';
import { registerFoldCommands } from '../fold/commands';

export function registerOperators(reg: VimRegistration): void {
    reg.defineOperator('hardWrap', hardWrapOperator);
    reg.mapCommand('gq', 'operator', 'hardWrap', {});

    reg.defineOperator('hardWrapKeepCursor', hardWrapKeepCursorOperator);
    reg.mapCommand('gw', 'operator', 'hardWrapKeepCursor', {});

    registerFoldCommands(reg);
}
