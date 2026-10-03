import { describe, expect, it } from 'vitest';
import { DEFAULT_CURSOR_SHAPES } from '../../src/settings';

/**
 * Pins the cursor-shape defaults that `test/specs/table-cell-caret.e2e.ts`
 * restates.
 *
 * A spec cannot value-import a `src` module — `tsconfig.test.json` includes
 * only `src/**\/*.d.ts`, and pulling an implementation module into a spec
 * surfaces the pre-existing dual-`VimApi` collision. So that spec hard-codes
 * the defaults, and this test is what keeps the copy honest: the owned table
 * cell's insert cursor is asserted to carry `cm-cursor-bar`, which is only the
 * right expectation while `insert` defaults to `bar`.
 */
describe('cursor shape defaults', () => {
    it('matches the values restated in table-cell-caret.e2e.ts', () => {
        expect(DEFAULT_CURSOR_SHAPES).toEqual({
            normal: 'block',
            insert: 'bar',
            visual: 'block',
            replace: 'underline',
            operatorPending: 'underline',
        });
    });
});
