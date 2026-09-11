import type {
    VimApi,
    MotionFn,
    ActionFn,
    OperatorFn,
    ExCommandFn,
    MapContext,
} from '../types/vim-api';

interface Registration {
    type:
        | 'motion'
        | 'action'
        | 'actionOverride'
        | 'operator'
        | 'ex'
        | 'map'
        | 'mapCommand';
    name: string;
    context?: MapContext;
    keys?: string;
    leaderScoped?: boolean;
    originalFn?: ActionFn;
    actionFn?: ActionFn;
    motionFn?: MotionFn;
    exFn?: ExCommandFn;
    commandType?: 'motion' | 'action' | 'operator';
    args?: Record<string, unknown>;
}

export interface RegisteredMapCommand {
    name: string;
    keys: string;
    context?: MapContext;
    actionFn?: ActionFn;
    motionFn?: MotionFn;
    args?: Record<string, unknown>;
}

export interface RegisteredExCommand {
    name: string;
    fn: ExCommandFn;
}

export interface RegistrationInventory {
    motions: number;
    actions: number;
    mapCommands: number;
    exCommands: number;
}

const noopMotion: MotionFn = (_cm, head) => head;
const noopAction: ActionFn = () => {};
const noopOperator: OperatorFn = () => {};

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
        this.pushReg({ type: 'motion', name, motionFn: fn });
    }

    defineAction(name: string, fn: ActionFn): void {
        this.vim.defineAction(name, fn);
        this.pushReg({ type: 'action', name, actionFn: fn });
    }

    defineActionOverride(
        name: string,
        factory: (original: ActionFn) => ActionFn,
    ): void {
        const original = this.vim.getAction?.(name) ?? noopAction;
        const replacement = factory(original);
        this.vim.defineAction(name, replacement);
        this.pushReg({
            type: 'actionOverride',
            name,
            originalFn: original,
            actionFn: replacement,
        });
    }

    defineOperator(name: string, fn: OperatorFn): void {
        this.vim.defineOperator(name, fn);
        this.pushReg({ type: 'operator', name });
    }

    defineEx(name: string, shortName: string, fn: ExCommandFn): void {
        this.vim.defineEx(name, shortName, fn);
        // The fork keys its dispatcher by abbreviation, so two commands
        // sharing one (`:fold` and `:forward` both take `fo`) leave only the
        // later registration reachable — `matchCommand_('fold')` finds `fo`,
        // sees it names `forward`, and gives up. Anchoring the full name keeps
        // the exact spelling resolvable regardless of registration order.
        // `undefineEx` removes every entry naming the command, so both go.
        if (shortName && shortName !== name) {
            this.vim.defineEx(name, '', fn);
        }
        this.pushReg({ type: 'ex', name, exFn: fn });
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
        const context = extra?.context;
        this.pushReg({
            type: 'mapCommand',
            name,
            keys,
            commandType: type,
            args,
            context:
                typeof context === 'string'
                    ? (context as MapContext)
                    : undefined,
        });
    }

    unmapDefaultBinding(key: string): void {
        const cmKey = keyToCmNotation(key);
        if (cmKey) {
            try {
                this.vim.unmap(cmKey, undefined, { includeDefaults: true });
            } catch {
                /* no default binding for this key */
            }
        }
        try {
            this.vim.unmap(key, undefined, { includeDefaults: true });
        } catch {
            /* no default binding for literal key — expected for backslash */
        }
    }

    getExCommandNames(): string[] {
        return this.registrations
            .filter((r) => r.type === 'ex')
            .map((r) => r.name);
    }

    getMapCommands(names: ReadonlySet<string>): RegisteredMapCommand[] {
        const definitions = new Map<string, Registration>();
        for (const registration of this.registrations) {
            if (
                registration.type === 'action' ||
                registration.type === 'actionOverride' ||
                registration.type === 'motion'
            ) {
                definitions.set(registration.name, registration);
            }
        }
        return this.registrations.flatMap((registration) => {
            if (
                registration.type !== 'mapCommand' ||
                !registration.keys ||
                !names.has(registration.name)
            )
                return [];
            const definition = definitions.get(registration.name);
            if (!definition) return [];
            return [
                {
                    name: registration.name,
                    keys: registration.keys,
                    context: registration.context,
                    actionFn: definition.actionFn,
                    motionFn: definition.motionFn,
                    args: registration.args,
                },
            ];
        });
    }

    getExCommands(names: ReadonlySet<string>): RegisteredExCommand[] {
        return this.registrations.flatMap((registration) =>
            registration.type === 'ex' &&
            registration.exFn &&
            names.has(registration.name)
                ? [{ name: registration.name, fn: registration.exFn }]
                : [],
        );
    }

    getInventory(): RegistrationInventory {
        return {
            motions: this.registrations.filter(
                (registration) => registration.type === 'motion',
            ).length,
            actions: this.registrations.filter(
                (registration) =>
                    registration.type === 'action' ||
                    registration.type === 'actionOverride',
            ).length,
            mapCommands: this.registrations.filter(
                (registration) => registration.type === 'mapCommand',
            ).length,
            exCommands: this.registrations.filter(
                (registration) => registration.type === 'ex',
            ).length,
        };
    }

    private removeRegistration(reg: Registration): void {
        switch (reg.type) {
            case 'map':
                this.vim.unmap(reg.name, reg.context);
                break;
            case 'mapCommand':
                if (
                    reg.keys &&
                    typeof this.vim.removeMapCommand === 'function'
                ) {
                    this.vim.removeMapCommand(reg.keys);
                }
                break;
            case 'motion':
                this.vim.defineMotion(reg.name, noopMotion);
                break;
            case 'action':
                this.vim.defineAction(reg.name, noopAction);
                break;
            case 'actionOverride':
                if (reg.originalFn) {
                    this.vim.defineAction(reg.name, reg.originalFn);
                }
                break;
            case 'operator':
                this.vim.defineOperator(reg.name, noopOperator);
                break;
            case 'ex':
                this.vim.undefineEx(reg.name);
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
