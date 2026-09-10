import { describe, it, expect, beforeEach } from 'vitest';
import { VimRegistration } from '../../src/vim/registration';
import type { VimApi } from '../../src/types/vim-api';

/**
 * Reimplements the fork's ex dispatcher exactly as `~/Repos/codemirror-vim`
 * does: `commandMap_` is keyed by ABBREVIATION, and `matchCommand_` walks the
 * typed name from longest prefix to shortest, rejecting an entry whose command
 * name does not start with what was typed.
 *
 * The keying is the whole point. Two commands may claim one abbreviation, and
 * the fork keeps only the later one, so a faithful fake is the only way to
 * reproduce the collision that made `:fold` unreachable.
 */
class FakeExDispatcher {
    exCommands = new Map<string, () => void>();
    commandMap = new Map<string, { name: string; shortName: string }>();

    defineEx(name: string, prefix: string, fn: () => void): void {
        const key = prefix || name;
        if (name.indexOf(key) !== 0) {
            throw new Error(`"${key}" is not a prefix of "${name}"`);
        }
        this.exCommands.set(name, fn);
        this.commandMap.set(key, { name, shortName: key });
    }

    undefineEx(name: string): boolean {
        if (!this.exCommands.has(name)) return false;
        this.exCommands.delete(name);
        for (const [key, cmd] of [...this.commandMap]) {
            if (cmd.name === name) this.commandMap.delete(key);
        }
        return true;
    }

    matchCommand(typed: string): { name: string } | undefined {
        for (let i = typed.length; i > 0; i--) {
            const entry = this.commandMap.get(typed.substring(0, i));
            if (entry && entry.name.indexOf(typed) === 0) return entry;
        }
        return undefined;
    }

    run(typed: string): string {
        const match = this.matchCommand(typed);
        if (!match) return 'UNKNOWN';
        const fn = this.exCommands.get(match.name);
        if (!fn) return 'UNKNOWN';
        lastRun = '';
        fn();
        return lastRun;
    }
}

let lastRun = '';

function makeRegistration(fake: FakeExDispatcher): VimRegistration {
    const vim = {
        defineEx: (n: string, p: string, f: () => void) =>
            fake.defineEx(n, p, f),
        undefineEx: (n: string) => fake.undefineEx(n),
    } as unknown as VimApi;
    return new VimRegistration(vim);
}

describe('VimRegistration ex command lifetime', () => {
    let fake: FakeExDispatcher;
    let reg: VimRegistration;

    beforeEach(() => {
        lastRun = '';
        fake = new FakeExDispatcher();
        reg = makeRegistration(fake);
    });

    function registerColliding(): void {
        reg.defineEx('fold', 'fo', () => {
            lastRun = 'fold';
        });
        reg.defineEx('forward', 'fo', () => {
            lastRun = 'forward';
        });
    }

    it('a torn-down command becomes genuinely unknown, not a silent no-op', () => {
        registerColliding();
        reg.unregisterAll();

        expect(fake.run('fold')).toBe('UNKNOWN');
        expect(fake.run('forward')).toBe('UNKNOWN');
    });

    it('both commands stay reachable by exact name despite sharing an abbreviation', () => {
        registerColliding();

        expect(fake.run('fold')).toBe('fold');
        expect(fake.run('forward')).toBe('forward');
    });

    it('exact names survive a teardown and rebuild cycle', () => {
        registerColliding();
        reg.unregisterAll();
        registerColliding();

        expect(fake.run('fold')).toBe('fold');
        expect(fake.run('forward')).toBe('forward');
    });

    it('the contested abbreviation still resolves to the last registration', () => {
        registerColliding();

        expect(fake.run('fo')).toBe('forward');
    });
});
