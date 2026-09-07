/**
 * H2 of `.sisyphus/plans/async-keymap-callbacks.md`.
 *
 * The context backing `vim.v` was a module-global that each callback overwrote
 * and then reset to defaults. The damaging case is not mutual overwrite but
 * *premature clear*: an inner callback finishing reset the shared value out
 * from under an outer one still running. Async autocmd callbacks already ran
 * through the coroutine runner, so this was reachable in production rather
 * than being only a hazard for future work.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    setVimVContext,
    restoreVimVContext,
    clearVimVContext,
} from '../../../src/lua/api';

afterEach(() => {
    clearVimVContext();
});

describe('vim.v context lifetime', () => {
    it('P1b: an inner callback completing does not reset an outer one', () => {
        const outerSaved = setVimVContext({ count: 5, register: 'a' });

        const innerSaved = setVimVContext({ count: 9, register: 'b' });
        restoreVimVContext(innerSaved);

        // What the outer callback observes on resume. Before the fix the inner
        // completion reset the shared object, so this read 0 and '"'.
        const observed = setVimVContext({});
        expect(observed.count).toBe(5);
        expect(observed.register).toBe('a');

        restoreVimVContext(outerSaved);
    });

    it('P1b2: unwinds to defaults once the outermost callback completes', () => {
        const saved = setVimVContext({ count: 7 });
        restoreVimVContext(saved);

        const observed = setVimVContext({});
        expect(observed.count).toBe(0);
        expect(observed.register).toBe('"');
        restoreVimVContext(observed);
    });

    it('nests three levels without leaking a context', () => {
        const a = setVimVContext({ count: 1 });
        const b = setVimVContext({ count: 2 });
        const c = setVimVContext({ count: 3 });

        restoreVimVContext(c);
        expect(setVimVContext({ count: 2 }).count).toBe(2);

        restoreVimVContext(b);
        expect(setVimVContext({ count: 1 }).count).toBe(1);

        restoreVimVContext(a);
        expect(setVimVContext({}).count).toBe(0);
    });

    it('P1a: a new context does not inherit fields from the previous one', () => {
        const a = setVimVContext({ count: 5, register: 'z' });
        setVimVContext({ count: 9 });

        const observed = setVimVContext({});
        expect(observed.count).toBe(9);
        expect(observed.register).toBe('"');

        restoreVimVContext(a);
    });

    it('clearVimVContext resets to defaults for non-nested callers', () => {
        setVimVContext({ count: 4 });
        clearVimVContext();
        expect(setVimVContext({}).count).toBe(0);
    });

    // Negative control: reproduces exactly what the callback paths did before
    // the fix. It documents why `clearVimVContext` is wrong for them — if a
    // callback path is ever switched back to clearing, this is the behaviour
    // it gets, and P1b above starts failing.
    it('clearing instead of restoring destroys an outer context', () => {
        setVimVContext({ count: 5, register: 'a' });
        setVimVContext({ count: 9, register: 'b' });
        clearVimVContext();

        const observed = setVimVContext({});
        expect(observed.count).toBe(0);
        expect(observed.register).toBe('"');
    });
});
