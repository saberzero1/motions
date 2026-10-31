import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { hasHostEdit, neovimLineEvent } from '../../../src/rpc/host-edits';

/**
 * Which editor transactions are Obsidian's edits, to be sent on to Neovim.
 * Neovim's own line events are marked so the document sync skips them
 * without diffing the whole note on every keystroke Neovim echoes back.
 */
describe('hasHostEdit', () => {
    const state = EditorState.create({ doc: 'alpha' });

    it('counts an unmarked edit and skips a marked one', () => {
        const host = state.update({ changes: { from: 0, insert: 'x' } });
        const neovim = state.update({
            changes: { from: 0, insert: 'x' },
            annotations: neovimLineEvent.of(true),
        });
        expect({
            host: hasHostEdit([host]),
            neovim: hasHostEdit([neovim]),
            mixed: hasHostEdit([neovim, host]),
        }).toEqual({ host: true, neovim: false, mixed: true });
    });

    it('ignores a transaction that changes no text', () => {
        const selection = state.update({ selection: { anchor: 2 } });
        expect(hasHostEdit([selection])).toBe(false);
    });
});
