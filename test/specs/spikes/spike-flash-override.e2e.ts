import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    sendVimEscape,
} from '../../helpers';

/**
 * Spike: Validate that defineMotion('moveToCharacter', ...) overrides
 * the fork's built-in f/F/t/T motions at dispatch time.
 *
 * This is the critical technical assumption for flash.nvim-style motions.
 * If these tests fail, the entire interception approach must be redesigned.
 *
 * Key findings to validate:
 * 1. defineMotion('moveToCharacter', newFn) replaces the built-in motion
 * 2. motionArgs.selectedCharacter is available in the override
 * 3. The override can return a Promise (async motion support)
 * 4. Operator-pending works with the async override (dfa)
 * 5. getMotion('moveToCharacter') returns the current motion function
 * 6. recordLastCharacterSearch is callable from plugin code
 */
describe('Spike: Flash defineMotion override', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('should expose getMotion on the Vim API', async function () {
        const result = await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: Record<string, unknown>;
                    };
                }
            ).CodeMirrorAdapter?.Vim;

            return {
                hasGetMotion: typeof Vim?.getMotion === 'function',
                hasDefineMotion: typeof Vim?.defineMotion === 'function',
                hasRecordLastCharSearch:
                    typeof Vim?.recordLastCharacterSearch === 'function',
                originalMotionExists:
                    typeof (Vim?.getMotion as (n: string) => unknown)?.(
                        'moveToCharacter',
                    ) === 'function',
                originalTillExists:
                    typeof (Vim?.getMotion as (n: string) => unknown)?.(
                        'moveTillCharacter',
                    ) === 'function',
            };
        });

        expect(result.hasGetMotion).toBe(true);
        expect(result.hasDefineMotion).toBe(true);
        expect(result.hasRecordLastCharSearch).toBe(true);
        expect(result.originalMotionExists).toBe(true);
        expect(result.originalTillExists).toBe(true);
    });

    it('should override moveToCharacter via defineMotion', async function () {
        await setupEditor('abcabc', { line: 0, ch: 0 });

        // Override moveToCharacter to jump to a fixed position (col 5)
        const overrideApplied = await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getMotion: (
                                name: string,
                            ) => ((...args: unknown[]) => unknown) | undefined;
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return false;

            // Save original
            const original = Vim.getMotion('moveToCharacter');
            if (!original) return false;

            // Store original on window for restoration
            (window as unknown as Record<string, unknown>).__origMoveToChar =
                original;

            // Override: always jump to column 5
            Vim.defineMotion(
                'moveToCharacter',
                (
                    _cm: unknown,
                    head: { line: number; ch: number },
                    motionArgs: { selectedCharacter?: string },
                ) => {
                    // Verify selectedCharacter is available
                    (
                        window as unknown as Record<string, unknown>
                    ).__lastSelectedChar = motionArgs.selectedCharacter;
                    return { line: head.line, ch: 5 };
                },
            );

            return true;
        });

        expect(overrideApplied).toBe(true);

        // Press fa — should use our override (jump to col 5 regardless of 'a' position)
        await browser.keys(['f', 'a']);
        await browser.pause(100);

        const pos = await getCursorPos();
        expect(pos.ch).toBe(5); // Our override forces col 5

        // Verify selectedCharacter was populated
        const selectedChar = await browser.executeObsidian(() => {
            return (window as unknown as Record<string, unknown>)
                .__lastSelectedChar as string;
        });
        expect(selectedChar).toBe('a');

        // Restore original
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const original = (window as unknown as Record<string, unknown>)
                .__origMoveToChar as (...args: unknown[]) => unknown;
            if (Vim && original) {
                Vim.defineMotion('moveToCharacter', original);
            }
        });
    });

    it('should override moveTillCharacter via defineMotion', async function () {
        await setupEditor('abcabc', { line: 0, ch: 0 });

        // Override moveTillCharacter to jump to col 4
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getMotion: (
                                name: string,
                            ) => ((...args: unknown[]) => unknown) | undefined;
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const original = Vim.getMotion('moveTillCharacter');
            (window as unknown as Record<string, unknown>).__origMoveTillChar =
                original;
            Vim.defineMotion(
                'moveTillCharacter',
                (
                    _cm: unknown,
                    head: { line: number; ch: number },
                    motionArgs: { selectedCharacter?: string },
                ) => {
                    (
                        window as unknown as Record<string, unknown>
                    ).__lastTillChar = motionArgs.selectedCharacter;
                    return { line: head.line, ch: 4 };
                },
            );
        });

        // Press ta — should use override
        await browser.keys(['t', 'a']);
        await browser.pause(100);

        const pos = await getCursorPos();
        expect(pos.ch).toBe(4);

        const selectedChar = await browser.executeObsidian(() => {
            return (window as unknown as Record<string, unknown>)
                .__lastTillChar as string;
        });
        expect(selectedChar).toBe('a');

        // Restore
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const original = (window as unknown as Record<string, unknown>)
                .__origMoveTillChar as (...args: unknown[]) => unknown;
            if (Vim && original) {
                Vim.defineMotion('moveTillCharacter', original);
            }
        });
    });

    it('should support async (Promise) motion override', async function () {
        await setupEditor('abcdefgh', { line: 0, ch: 0 });

        // Override moveToCharacter with an async version
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getMotion: (
                                name: string,
                            ) => ((...args: unknown[]) => unknown) | undefined;
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const original = Vim.getMotion('moveToCharacter');
            (window as unknown as Record<string, unknown>).__origMoveToChar2 =
                original;

            // Return a Promise that resolves to position after a microtask
            Vim.defineMotion(
                'moveToCharacter',
                (_cm: unknown, head: { line: number; ch: number }) => {
                    return Promise.resolve({ line: head.line, ch: 6 });
                },
            );
        });

        // Press fa — async override should resolve to col 6
        await browser.keys(['f', 'a']);
        await browser.pause(300); // Allow async resolution

        const pos = await getCursorPos();
        expect(pos.ch).toBe(6);

        // Restore
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const original = (window as unknown as Record<string, unknown>)
                .__origMoveToChar2 as (...args: unknown[]) => unknown;
            if (Vim && original) {
                Vim.defineMotion('moveToCharacter', original);
            }
        });
    });

    it('should support operator-pending with async override (dfa)', async function () {
        await setupEditor('hello world abc', { line: 0, ch: 0 });

        // Override to return async position at 'a' (col 12)
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getMotion: (
                                name: string,
                            ) => ((...args: unknown[]) => unknown) | undefined;
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const original = Vim.getMotion('moveToCharacter');
            (window as unknown as Record<string, unknown>).__origMoveToChar3 =
                original;

            Vim.defineMotion(
                'moveToCharacter',
                (
                    _cm: unknown,
                    head: { line: number; ch: number },
                    motionArgs: {
                        selectedCharacter?: string;
                        inclusive?: boolean;
                    },
                ) => {
                    // Simulate flash: find the character, return its position async
                    return Promise.resolve({ line: head.line, ch: 12 });
                },
            );
        });

        // Press dfa — delete from cursor to async-resolved position (col 12, inclusive)
        await browser.keys(['d', 'f', 'a']);
        await browser.pause(500);

        const value = await getEditorValue();
        // 'hello world abc' with cursor at 0, delete to col 12 inclusive → 'bc' remains
        // Actually d to col 12 inclusive means delete chars 0-12, leaving 'bc'
        expect(value).toBe('bc');

        // Restore
        await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            defineMotion: (
                                name: string,
                                fn: (...args: unknown[]) => unknown,
                            ) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            const original = (window as unknown as Record<string, unknown>)
                .__origMoveToChar3 as (...args: unknown[]) => unknown;
            if (Vim && original) {
                Vim.defineMotion('moveToCharacter', original);
            }
        });
    });

    it('should expose recordLastCharacterSearch for ;/, repeat', async function () {
        await setupEditor('abcabc', { line: 0, ch: 0 });

        // Call recordLastCharacterSearch from plugin code, then verify ; works
        const result = await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            recordLastCharacterSearch: (
                                increment: number,
                                args: {
                                    forward: boolean;
                                    selectedCharacter: string;
                                },
                            ) => void;
                            getVimGlobalState_: () => {
                                lastCharacterSearch: {
                                    increment: number;
                                    forward: boolean;
                                    selectedCharacter: string;
                                };
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { success: false };

            // Record a search for 'b' forward
            Vim.recordLastCharacterSearch(0, {
                forward: true,
                selectedCharacter: 'b',
            });

            // Verify it was stored
            const state = Vim.getVimGlobalState_().lastCharacterSearch;
            return {
                success: true,
                increment: state.increment,
                forward: state.forward,
                selectedCharacter: state.selectedCharacter,
            };
        });

        expect(result.success).toBe(true);
        expect(result.increment).toBe(0);
        expect(result.forward).toBe(true);
        expect(result.selectedCharacter).toBe('b');
    });
});
