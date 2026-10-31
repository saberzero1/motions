import { describe, expect, it } from 'vitest';
import { imageCommandCount } from '../../../src/vim/image-command';
import type { ExCommandArgs } from '../../../src/types/vim-api';

/**
 * `:image`'s count (#218). Obsidian's own command reads it from the line
 * address, `(lineEnd ?? line) + 1`; the plugin also takes a trailing count,
 * which is the only form the Neovim backend can forward.
 */
function params(
    args: string[],
    line?: number,
    lineEnd?: number,
): ExCommandArgs {
    return {
        args,
        argString: args.join(' '),
        commandName: 'image',
        input: `image ${args.join(' ')}`,
        line,
        lineEnd,
    };
}

describe('imageCommandCount', () => {
    it('is 1 with neither an address nor a count', () => {
        expect(imageCommandCount(params(['grow']))).toBe(1);
    });

    it('reads the address the way Obsidian does, preferring its end', () => {
        expect({
            single: imageCommandCount(params(['grow'], 2)),
            range: imageCommandCount(params(['grow'], 1, 4)),
        }).toEqual({ single: 3, range: 5 });
    });

    it('prefers a trailing count to the address', () => {
        expect(imageCommandCount(params(['shrink', '2'], 6))).toBe(2);
    });

    it('rejects a count that is not a positive whole number', () => {
        for (const count of ['0', 'x', '-1', '1.5']) {
            expect(() => imageCommandCount(params(['grow', count]))).toThrow(
                'Usage: :image grow|shrink|reset|edit [count]',
            );
        }
    });
});
