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
    leaderScoped?: boolean;
}

const noopMotion: MotionFn = (_cm, head) => head;
const noopAction: ActionFn = () => {};
const noopOperator: OperatorFn = () => {};
const noopEx: ExCommandFn = () => {};

const SPECIAL_KEYS: Record<string, string> = {
    ' ': '<Space>',
    '\t': '<Tab>',
};

function keyToCmNotation(key: string): string | null {
    if (key.length === 0) return null;
    return SPECIAL_KEYS[key] ?? null;
}

export class VimRegistration {
    private registrations: Registration[] = [];
    private vim: VimApi;
    private _leaderScope = false;

    constructor(vim: VimApi) {
        this.vim = vim;
    }

    /** Mark subsequent registrations as leader-scoped. */
    beginLeaderScope(): void {
        this._leaderScope = true;
    }

    /** Stop marking subsequent registrations as leader-scoped. */
    endLeaderScope(): void {
        this._leaderScope = false;
    }

    private pushReg(reg: Omit<Registration, 'leaderScoped'>): void {
        this.registrations.push({
            ...reg,
            leaderScoped: this._leaderScope || undefined,
        });
    }

    defineMotion(name: string, fn: MotionFn): void {
        this.vim.defineMotion(name, fn);
        this.pushReg({ type: 'motion', name });
    }

    defineAction(name: string, fn: ActionFn): void {
        this.vim.defineAction(name, fn);
        this.pushReg({ type: 'action', name });
    }

    defineOperator(name: string, fn: OperatorFn): void {
        this.vim.defineOperator(name, fn);
        this.pushReg({ type: 'operator', name });
    }

    defineEx(name: string, shortName: string, fn: ExCommandFn): void {
        this.vim.defineEx(name, shortName, fn);
        this.pushReg({ type: 'ex', name });
    }

    map(lhs: string, rhs: string, context?: MapContext): void {
        this.vim.map(lhs, rhs, context);
        this.pushReg({ type: 'map', name: lhs, context });
    }

    noremap(lhs: string, rhs: string, context?: MapContext): void {
        this.vim.noremap(lhs, rhs, context);
        this.pushReg({ type: 'map', name: lhs, context });
    }

    mapCommand(
        keys: string,
        type: 'motion' | 'action' | 'operator',
        name: string,
        args?: Record<string, unknown>,
        extra?: Record<string, unknown>,
    ): void {
        this.vim.mapCommand(keys, type, name, args, extra);
        this.pushReg({ type: 'mapCommand', name, keys });
    }

    unmapDefaultBinding(key: string): void {
        const cmKey = keyToCmNotation(key);
        if (cmKey) {
            try {
                this.vim.unmap(cmKey);
            } catch {
                /* no default binding for this key */
            }
        }
        try {
            this.vim.unmap(key);
        } catch {
            /* no default binding for literal key — expected for backslash */
        }
    }

    getExCommandNames(): string[] {
        return this.registrations
            .filter((r) => r.type === 'ex')
            .map((r) => r.name);
    }

    private removeRegistration(reg: Registration): void {
        switch (reg.type) {
            case 'map':
                this.vim.unmap(reg.name, reg.context);
                break;
            case 'mapCommand':
                if (reg.keys) {
                    this.vim.removeMapCommand(reg.keys);
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
    }

    unregisterLeaderBindings(): void {
        const kept: Registration[] = [];
        for (const reg of this.registrations) {
            if (!reg.leaderScoped) {
                kept.push(reg);
                continue;
            }
            try {
                this.removeRegistration(reg);
            } catch {
                /* intentional: cleanup is best-effort */
            }
        }
        this.registrations = kept;
    }

    unregisterAll(): void {
        for (const reg of this.registrations) {
            try {
                this.removeRegistration(reg);
            } catch {
                /* intentional: cleanup is best-effort */
            }
        }
        this.registrations = [];
    }
}
