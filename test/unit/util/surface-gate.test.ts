import { describe, it, expect } from 'vitest';
import {
    classifySurfaceBy,
    TABLE_CELL_SELECTOR,
    type EditorSurface,
} from '../../../src/util/surface-gate';

/** Matches exactly the listed selectors, so a test agrees with one string. */
function matcher(...present: string[]): (selector: string) => boolean {
    return (selector) => present.includes(selector);
}

describe('classifySurfaceBy', () => {
    it('reports a table cell when the widget wrapper is an ancestor', () => {
        expect(classifySurfaceBy(matcher(TABLE_CELL_SELECTOR))).toBe(
            'table-cell',
        );
    });

    it('reports a document when nothing matches', () => {
        expect(classifySurfaceBy(matcher())).toBe('document');
    });

    it('does not claim a cell for an unrelated ancestor', () => {
        // Oil views and textarea overlays are real surfaces that deliberately
        // classify as 'document'; a looser selector list would capture them.
        const surfaces: EditorSurface[] = [
            classifySurfaceBy(matcher('.vim-motions-oil-editor')),
            classifySurfaceBy(matcher('.vim-motions-textarea-overlay')),
            classifySurfaceBy(matcher('.cm-table-widget-nope')),
        ];
        expect(surfaces).toStrictEqual(['document', 'document', 'document']);
    });

    it('pins the selector the production guards already use', () => {
        // Three production call sites hard-code this string. If it changes
        // here without changing there, the gate silently stops gating.
        expect(TABLE_CELL_SELECTOR).toBe('.cm-table-widget');
    });

    it('asks only for selectors it means to act on', () => {
        const asked: string[] = [];
        classifySurfaceBy((selector) => {
            asked.push(selector);
            return false;
        });
        expect(asked).toStrictEqual([TABLE_CELL_SELECTOR]);
    });
});
