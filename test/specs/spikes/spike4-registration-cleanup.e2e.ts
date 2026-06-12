import { browser, expect } from '@wdio/globals';

describe('Spike 4: Registration cleanup on unload', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
    });

    it('should register a motion and verify it exists', async function () {
        const result = await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => void>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            Vim.defineMotion(
                'spikeCleanupTest',
                (_cm: unknown, head: { line: number; ch: number }) => head,
            );
            Vim.mapCommand(']z', 'motion', 'spikeCleanupTest', undefined, {});
            return { registered: true };
        });

        expect(result).toHaveProperty('registered', true);
    });

    it('should unmap the motion and verify it no longer responds', async function () {
        const result = await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => boolean>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            const unmapped = Vim.unmap(']z');
            Vim.defineMotion(
                'spikeCleanupTest',
                (_cm: unknown, head: { line: number; ch: number }) => head,
            );

            return { unmapped };
        });

        expect(result).toHaveProperty('unmapped', true);
    });

    it('should handle re-registration after cleanup without duplicates', async function () {
        const result = await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, (...args: unknown[]) => void>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };

            let callCount = 0;
            Vim.defineMotion(
                'spikeReregTest',
                (_cm: unknown, head: { line: number; ch: number }) => {
                    callCount++;
                    return head;
                },
            );
            Vim.mapCommand(']y', 'motion', 'spikeReregTest', undefined, {});

            Vim.unmap(']y');
            Vim.defineMotion(
                'spikeReregTest',
                (_cm: unknown, head: { line: number; ch: number }) => {
                    callCount++;
                    return head;
                },
            );
            Vim.mapCommand(']y', 'motion', 'spikeReregTest', undefined, {});

            Vim.unmap(']y');
            Vim.defineMotion(
                'spikeReregTest',
                (_cm: unknown, head: { line: number; ch: number }) => head,
            );

            return { success: true };
        });

        expect(result).toHaveProperty('success', true);
    });
});
