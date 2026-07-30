import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';

vi.mock('../../src/workspace/navigation', () => ({
    executeCommand: vi.fn(),
}));
vi.mock('../../src/ui/global-ex-command', () => ({
    executeGlobalExCommand: vi.fn(),
}));
vi.mock('../../src/ui/hint-mode', () => ({
    isHintModeActive: () => false,
}));

import { GlobalKeyHandler } from '../../src/workspace/global-key-handler';
import { GlobalMappingRegistry } from '../../src/workspace/global-mapping-registry';
import { executeCommand } from '../../src/workspace/navigation';

type KeydownListener = (e: Partial<KeyboardEvent>) => void;

let capturedListener: KeydownListener | null = null;

function makeMockDoc(): Document {
    return {
        addEventListener: (_type: string, listener: KeydownListener) => {
            capturedListener = listener;
        },
        removeEventListener: () => {},
        activeElement: null,
        querySelector: () => null,
    } as unknown as Document;
}

function makeApp(mockDoc: Document): App {
    return {
        workspace: {
            containerEl: { ownerDocument: mockDoc },
            getMostRecentLeaf: () => ({
                view: { getViewType: () => 'graph' },
            }),
            on: () => ({ id: 'ref' }),
            offref: () => {},
        },
        commands: { commands: {} },
    } as unknown as App;
}

function makeSettings() {
    return {
        enableWorkspaceNav: true,
        workspaceNavViewTypes: '',
    } as never;
}

function fakeKeyEvent(
    key: string,
    opts?: Record<string, unknown>,
): Partial<KeyboardEvent> {
    return {
        key,
        isComposing: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...opts,
    };
}

function pressKey(key: string, opts?: Record<string, unknown>) {
    capturedListener!(fakeKeyEvent(key, opts));
}

describe('GlobalKeyHandler', () => {
    let registry: GlobalMappingRegistry;
    let handler: GlobalKeyHandler;

    beforeEach(() => {
        vi.useFakeTimers();
        capturedListener = null;
        const mockDoc = makeMockDoc();
        const app = makeApp(mockDoc);
        registry = new GlobalMappingRegistry();
        handler = new GlobalKeyHandler(app, makeSettings(), null, registry);
        handler.install();
    });

    afterEach(() => {
        handler.destroy();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('dispatch count for builtin actions', () => {
        it('passes count=0 when no count prefix typed', () => {
            let received = -1;
            registry.addMapping(
                'x',
                {
                    type: 'builtin',
                    fn: (_app, count) => {
                        received = count;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('x');
            expect(received).toBe(0);
        });

        it('passes count=1 when "1" is typed before key', () => {
            let received = -1;
            registry.addMapping(
                'x',
                {
                    type: 'builtin',
                    fn: (_app, count) => {
                        received = count;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('1');
            pressKey('x');
            expect(received).toBe(1);
        });

        it('passes count=3 when "3" is typed before key', () => {
            let received = -1;
            registry.addMapping(
                'x',
                {
                    type: 'builtin',
                    fn: (_app, count) => {
                        received = count;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('3');
            pressKey('x');
            expect(received).toBe(3);
        });

        it('count resets after dispatch', () => {
            const received: number[] = [];
            registry.addMapping(
                'x',
                {
                    type: 'builtin',
                    fn: (_app, count) => {
                        received.push(count);
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('3');
            pressKey('x');
            pressKey('x');
            expect(received).toEqual([3, 0]);
        });
    });

    describe('dispatch count for obcommand actions', () => {
        it('executes obcommand once when no count prefix typed', () => {
            registry.addMapping(
                'x',
                {
                    type: 'obcommand',
                    commandId: 'workspace:next-tab',
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('x');
            expect(executeCommand).toHaveBeenCalledTimes(1);
        });

        it('repeats obcommand N times when count N is typed', () => {
            registry.addMapping(
                'x',
                {
                    type: 'obcommand',
                    commandId: 'workspace:next-tab',
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('3');
            pressKey('x');
            expect(executeCommand).toHaveBeenCalledTimes(3);
        });
    });

    describe('gt tab navigation (issue #97)', () => {
        it('gt without count triggers next-tab branch (count=0)', () => {
            let nextTabCalled = false;
            let nthTabCalled = false;
            registry.addMapping(
                'gt',
                {
                    type: 'builtin',
                    fn: (_app2, count) => {
                        if (count > 0) {
                            nthTabCalled = true;
                        } else {
                            nextTabCalled = true;
                        }
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('g');
            pressKey('t');

            expect(nextTabCalled).toBe(true);
            expect(nthTabCalled).toBe(false);
        });

        it('3gt triggers nth-tab branch with count=3', () => {
            let receivedCount = -1;
            registry.addMapping(
                'gt',
                {
                    type: 'builtin',
                    fn: (_app2, count) => {
                        receivedCount = count;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('3');
            pressKey('g');
            pressKey('t');

            expect(receivedCount).toBe(3);
        });

        it('1gt triggers nth-tab branch with count=1', () => {
            let receivedCount = -1;
            registry.addMapping(
                'gt',
                {
                    type: 'builtin',
                    fn: (_app2, count) => {
                        receivedCount = count;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('1');
            pressKey('g');
            pressKey('t');

            expect(receivedCount).toBe(1);
        });
    });

    describe('sequence timeout with partial matches (issue #97)', () => {
        it('keeps sequence alive while partial match exists', () => {
            registry.addMapping(
                '<C-w>h',
                { type: 'builtin', fn: () => {} },
                { source: 'default', gate: 'structural' },
            );
            registry.addMapping(
                '<C-w>j',
                { type: 'builtin', fn: () => {} },
                { source: 'default', gate: 'structural' },
            );

            let chordDismissed = false;
            handler.onGlobalChord = (chord) => {
                if (chord === '') chordDismissed = true;
            };

            pressKey('w', { ctrlKey: true });
            expect(chordDismissed).toBe(false);

            vi.advanceTimersByTime(1000);
            expect(chordDismissed).toBe(false);

            vi.advanceTimersByTime(1000);
            expect(chordDismissed).toBe(false);
        });

        it('still dispatches command after timeout restarts', () => {
            let called = false;
            registry.addMapping(
                '<C-w>h',
                {
                    type: 'builtin',
                    fn: () => {
                        called = true;
                    },
                },
                { source: 'default', gate: 'structural' },
            );
            registry.addMapping(
                '<C-w>j',
                { type: 'builtin', fn: () => {} },
                { source: 'default', gate: 'structural' },
            );

            pressKey('w', { ctrlKey: true });
            vi.advanceTimersByTime(1500);

            pressKey('h');
            expect(called).toBe(true);
        });

        it('resets count after timeout so next key has no count', () => {
            let received = -1;
            registry.addMapping(
                'x',
                {
                    type: 'builtin',
                    fn: (_app, count) => {
                        received = count;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('5');
            vi.advanceTimersByTime(1000);

            pressKey('x');
            expect(received).toBe(0);
        });

        it('resets after exact match (no lingering timeout)', () => {
            let callCount = 0;
            registry.addMapping(
                'x',
                {
                    type: 'builtin',
                    fn: () => {
                        callCount++;
                    },
                },
                { source: 'default', gate: 'structural' },
            );

            pressKey('x');
            expect(callCount).toBe(1);

            vi.advanceTimersByTime(2000);
            expect(callCount).toBe(1);
        });
    });
});
