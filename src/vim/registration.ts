import type {
    VimApi,
    MotionFn,
    ActionFn,
    OperatorFn,
    ExCommandFn,
    MapContext,
} from '../types/vim-api';

interface Registration {
    type: 'motion' | 'action' | 'operator' | 'ex' | 'map' | 'mapCommand';
    name: string;
    context?: MapContext;
    keys?: string;
}

const noopMotion: MotionFn = (_cm, head) => head;
const noopAction: ActionFn = () => {};
const noopOperator: OperatorFn = () => {};
const noopEx: ExCommandFn = () => {};

export class VimRegistration {
    private registrations: Registration[] = [];
    private vim: VimApi;

    constructor(vim: VimApi) {
        this.vim = vim;
    }

    defineMotion(name: string, fn: MotionFn): void {
        this.vim.defineMotion(name, fn);
        this.registrations.push({ type: 'motion', name });
    }

    defineAction(name: string, fn: ActionFn): void {
        this.vim.defineAction(name, fn);
        this.registrations.push({ type: 'action', name });
    }

    defineOperator(name: string, fn: OperatorFn): void {
        this.vim.defineOperator(name, fn);
        this.registrations.push({ type: 'operator', name });
    }

    defineEx(name: string, shortName: string, fn: ExCommandFn): void {
        this.vim.defineEx(name, shortName, fn);
        this.registrations.push({ type: 'ex', name });
    }

    map(lhs: string, rhs: string, context?: MapContext): void {
        this.vim.map(lhs, rhs, context);
        this.registrations.push({ type: 'map', name: lhs, context });
    }

    noremap(lhs: string, rhs: string, context?: MapContext): void {
        this.vim.noremap(lhs, rhs, context);
        this.registrations.push({ type: 'map', name: lhs, context });
    }

    mapCommand(
        keys: string,
        type: 'motion' | 'action' | 'operator',
        name: string,
        args?: Record<string, unknown>,
        extra?: Record<string, unknown>,
    ): void {
        this.vim.mapCommand(keys, type, name, args, extra);
        this.registrations.push({ type: 'mapCommand', name, keys });
    }

    getExCommandNames(): string[] {
        return this.registrations
            .filter((r) => r.type === 'ex')
            .map((r) => r.name);
    }

    unregisterAll(): void {
        for (const reg of this.registrations) {
            try {
                switch (reg.type) {
                    case 'map':
                        this.vim.unmap(reg.name, reg.context);
                        break;
                    case 'mapCommand':
                        if (reg.keys) {
                            this.vim.unmap(reg.keys);
                        }
                        break;
                    case 'motion':
                        this.vim.defineMotion(reg.name, noopMotion);
                        break;
                    case 'action':
                        this.vim.defineAction(reg.name, noopAction);
                        break;
                    case 'operator':
                        this.vim.defineOperator(reg.name, noopOperator);
                        break;
                    case 'ex':
                        this.vim.defineEx(reg.name, '', noopEx);
                        break;
                }
            } catch {
                /* intentional: cleanup is best-effort */
            }
        }
        this.registrations = [];
    }
}
