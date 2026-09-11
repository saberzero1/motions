import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    ensureLivePreview,
    getNotices,
    isLivePreview,
    loadSingleFileWorkspace,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

const FIXTURE_PATH = 'rpc-latency-runtime.md';
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const SAMPLE_COUNT = 500;
const WARMUP_COUNT = 75;
const BREAK_STABILITY = process.env.RPC_LATENCY_BREAK_STABILITY === '1';

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface DelegationState {
    active: boolean;
    handlerAttached: boolean;
    keyInterceptActive: boolean;
}

interface RpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
        vimEnabled: boolean;
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    getNeovimKeyDelegationState(): DelegationState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

interface TimingSample {
    index: number;
    label: string;
    operationClass: OperationClass;
    elapsed: number;
    beforeHead: number;
    afterHead: number;
}

interface TimingHarness {
    arm(
        index: number,
        label: string,
        operationClass: OperationClass,
        delayMs: number,
        layoutMs: number,
    ): void;
    snapshot(): {
        results: TimingSample[];
        docLength: number;
        layoutWorkMs: number;
    };
    stop(): void;
}

interface Stats {
    n: number;
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
}

type OperationClass = 'motion' | 'operator' | 'insert' | 'undo';
type Condition = 'fork' | 'rpc';

interface CorpusUnit {
    label: string;
    operationClass: OperationClass;
    preludes: string[];
    key: string;
}

interface ConditionResult {
    condition: Condition;
    stats: Stats;
    byClass: Record<OperationClass, Stats>;
    samples: number;
    warmup: number;
    logicalKeydowns: number;
    startDocLength: number;
    endDocLength: number;
    sizeDrift: number;
    motionChanged: boolean;
    layoutWorkMs: number;
}

type HarnessWindow = Window & { __rpcLatencyHarness?: TimingHarness };

const spawnedPids = new Set<number>();

function makeFixture(): string {
    const lines = [
        '---',
        'title: RPC latency certification',
        'tags: [rpc, latency]',
        '---',
    ];
    for (let block = 0; block < 200; block += 1) {
        lines.push(
            `## Section ${block}: realistic editing`,
            `Paragraph ${block} has [[note-${block}|an alias]], [a link](https://example.com/${block}), **bold**, *emphasis*, and \`code\`.`,
            `- Item ${block}.1 has enough words for motions and operators.`,
            `- [ ] Item ${block}.2 includes Unicode é, 界, and 👩‍💻.`,
            `> [!note] Callout ${block}`,
            '> Its body is varied prose that wraps naturally in Live Preview.',
            block % 2 === 0 ? '```ts' : '```lua',
            block % 2 === 0
                ? `const value${block} = "markdown-${block}";`
                : `local value_${block} = "markdown-${block}"`,
            '```',
            `| Row ${block} | Value ${block} | [[table-${block}]] |`,
        );
    }
    return lines.join('\n');
}

const FIXTURE = makeFixture();

function corpusCycle(): CorpusUnit[] {
    const units: CorpusUnit[] = [
        { label: 'j', operationClass: 'motion', preludes: [], key: 'j' },
        { label: 'k', operationClass: 'motion', preludes: [], key: 'k' },
        { label: 'w', operationClass: 'motion', preludes: [], key: 'w' },
        { label: 'b', operationClass: 'motion', preludes: [], key: 'b' },
        {
            label: 'dd',
            operationClass: 'operator',
            preludes: ['d'],
            key: 'd',
        },
        { label: 'undo-dd', operationClass: 'undo', preludes: [], key: 'u' },
        { label: 'p', operationClass: 'operator', preludes: [], key: 'p' },
        { label: 'undo-p', operationClass: 'undo', preludes: [], key: 'u' },
        {
            label: 'dw',
            operationClass: 'operator',
            preludes: ['d'],
            key: 'w',
        },
        { label: 'undo-dw', operationClass: 'undo', preludes: [], key: 'u' },
        {
            label: 'ciw',
            operationClass: 'operator',
            preludes: ['c', 'i'],
            key: 'w',
        },
    ];
    for (const key of 'replacement words ') {
        units.push({
            label: 'ciw-type',
            operationClass: 'insert',
            preludes: [],
            key,
        });
    }
    units.push({
        label: 'undo-ciw',
        operationClass: 'undo',
        preludes: ['Escape'],
        key: 'u',
    });
    const insert = [...'sustained insert typing '];
    units.push({
        label: 'insert-type',
        operationClass: 'insert',
        preludes: ['i'],
        key: insert.shift()!,
    });
    for (const key of insert) {
        units.push({
            label: 'insert-type',
            operationClass: 'insert',
            preludes: [],
            key,
        });
    }
    units.push({
        label: 'undo-insert',
        operationClass: 'undo',
        preludes: ['Escape'],
        key: 'u',
    });
    return units;
}

function calculateStats(values: number[]): Stats {
    if (values.length === 0) throw new Error('Cannot summarize zero samples');
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (quantile: number): number =>
        sorted[Math.ceil(quantile * sorted.length) - 1]!;
    return {
        n: values.length,
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        min: sorted[0]!,
        max: sorted.at(-1)!,
    };
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = configPath;
            plugin.settings.neovimRpcEnabled = nextEnabled;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function pluginSnapshot(): Promise<{
    rpc: RpcState;
    delegation: DelegationState;
    vimEnabled: boolean;
}> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return {
            rpc: plugin.getNeovimConnectionState(),
            delegation: plugin.getNeovimKeyDelegationState(),
            vimEnabled: plugin.settings.vimEnabled,
        };
    })) as {
        rpc: RpcState;
        delegation: DelegationState;
        vimEnabled: boolean;
    };
}

async function requestNeovim(
    method: string,
    args: unknown[],
): Promise<unknown> {
    return browser.executeObsidian(
        async ({ app }, rpcMethod: string, rpcArgs: unknown[]) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            return plugin.requestNeovim(rpcMethod, rpcArgs);
        },
        method,
        args,
    );
}

async function waitForRpc(connected: boolean): Promise<void> {
    try {
        await browser.waitUntil(
            async () => (await pluginSnapshot()).rpc.connected === connected,
            {
                timeout: 10000,
                interval: 100,
                timeoutMsg: `Neovim RPC did not become ${connected ? 'connected' : 'disconnected'}`,
            },
        );
    } catch {
        throw new Error(
            `RPC transition failed: ${JSON.stringify(await pluginSnapshot())} notices=${JSON.stringify(await getNotices())}`,
        );
    }
    const pid = (await pluginSnapshot()).rpc.pid;
    if (pid !== null) spawnedPids.add(pid);
}

async function sendKey(key: string): Promise<void> {
    await browser.keys([key]);
}

async function alignKeydownToFrame(): Promise<void> {
    await browser.execute(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
            }),
    );
}

async function settleRpc(): Promise<void> {
    await requestNeovim('nvim_get_mode', []);
}

async function resetDocument(condition: Condition): Promise<void> {
    if (condition === 'rpc') {
        await requestNeovim('nvim_input', ['<Esc>']);
        await requestNeovim('nvim_buf_set_lines', [
            0,
            0,
            -1,
            true,
            FIXTURE.split('\n'),
        ]);
        await requestNeovim('nvim_win_set_cursor', [0, [5, 0]]);
        await settleRpc();
    } else {
        await sendKey('Escape');
        await browser.executeObsidian(({ app, obsidian }, fixture: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) throw new Error('No active MarkdownView');
            view.editor.setValue(fixture);
            view.editor.setCursor({ line: 4, ch: 0 });
            view.editor.focus();
        }, FIXTURE);
    }
    await browser.waitUntil(
        async () =>
            browser.executeObsidian(({ app, obsidian }, length: number) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                return view?.editor.getValue().length === length;
            }, FIXTURE.length),
        {
            timeout: 5000,
            interval: 20,
            timeoutMsg: `${condition} reset did not reach the fixture length`,
        },
    );
}

async function installTimingHarness(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const markdownView = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        );
        const view = (
            markdownView?.editor as unknown as {
                cm?: {
                    contentDOM: HTMLElement;
                    dom: HTMLElement;
                    state: {
                        doc: { length: number };
                        selection: { main: { head: number } };
                    };
                    dispatch(spec: unknown): void;
                };
            }
        )?.cm;
        if (!view) throw new Error('Latency harness has no CM6 EditorView');
        const { StateEffect } = require('@codemirror/state') as {
            StateEffect: {
                appendConfig: { of(value: unknown): unknown };
            };
        };
        const { EditorView } = require('@codemirror/view') as {
            EditorView: {
                updateListener: {
                    of(
                        listener: (update: {
                            docChanged: boolean;
                            selectionSet: boolean;
                        }) => void,
                    ): unknown;
                };
            };
        };
        type Pending = {
            index: number;
            label: string;
            operationClass: OperationClass;
            delayMs: number;
            layoutMs: number;
            beforeHead: number;
            start?: number;
        };
        let pending: Pending | undefined;
        let active = true;
        let layoutWorkMs = 0;
        const results: TimingSample[] = [];
        const forceLayout = (duration: number): void => {
            const probe = document.createElement('div');
            probe.style.position = 'absolute';
            probe.style.width = '997px';
            probe.textContent = 'forced layout '.repeat(3000);
            view.dom.appendChild(probe);
            const started = performance.now();
            let pass = 0;
            while (performance.now() - started < duration) {
                probe.style.width = `${997 + (pass % 2)}px`;
                void probe.offsetHeight;
                pass += 1;
            }
            layoutWorkMs += performance.now() - started;
            probe.remove();
        };
        const onKeydown = (event: KeyboardEvent): void => {
            const sample = pending;
            if (
                !active ||
                !sample ||
                sample.start !== undefined ||
                !(event.target instanceof Node) ||
                !view.contentDOM.contains(event.target)
            )
                return;
            sample.start = performance.now();
            sample.beforeHead = view.state.selection.main.head;
            if (sample.delayMs > 0) {
                const started = performance.now();
                while (performance.now() - started < sample.delayMs) {
                    // Synchronous-delay negative control.
                }
            }
        };
        window.addEventListener('keydown', onKeydown, true);
        view.dispatch({
            effects: StateEffect.appendConfig.of(
                EditorView.updateListener.of((update) => {
                    const sample = pending;
                    if (
                        !active ||
                        !sample ||
                        sample.start === undefined ||
                        (!update.docChanged && !update.selectionSet)
                    )
                        return;
                    pending = undefined;
                    if (sample.layoutMs > 0) forceLayout(sample.layoutMs);
                    requestAnimationFrame(() => {
                        results.push({
                            index: sample.index,
                            label: sample.label,
                            operationClass: sample.operationClass,
                            elapsed: performance.now() - sample.start!,
                            beforeHead: sample.beforeHead,
                            afterHead: view.state.selection.main.head,
                        });
                    });
                }),
            ),
        });
        (window as HarnessWindow).__rpcLatencyHarness = {
            arm(index, label, operationClass, delayMs, layoutMs) {
                if (pending)
                    throw new Error(
                        `Latency arm overlap: pending=${pending.label}`,
                    );
                pending = {
                    index,
                    label,
                    operationClass,
                    delayMs,
                    layoutMs,
                    beforeHead: view.state.selection.main.head,
                };
            },
            snapshot() {
                return {
                    results: [...results],
                    docLength: view.state.doc.length,
                    layoutWorkMs,
                };
            },
            stop() {
                active = false;
                pending = undefined;
                window.removeEventListener('keydown', onKeydown, true);
                delete (window as HarnessWindow).__rpcLatencyHarness;
            },
        };
    });
}

async function harnessSnapshot(): Promise<
    ReturnType<TimingHarness['snapshot']>
> {
    return (await browser.execute(() => {
        const harness = (window as HarnessWindow).__rpcLatencyHarness;
        if (!harness) throw new Error('Latency harness is not installed');
        return harness.snapshot();
    })) as ReturnType<TimingHarness['snapshot']>;
}

async function runCondition(
    condition: Condition,
    options: {
        samples?: number;
        warmup?: number;
        delayMs?: number;
        layoutMs?: number;
        breakStability?: boolean;
    } = {},
): Promise<ConditionResult> {
    const samples = options.samples ?? SAMPLE_COUNT;
    const warmup = options.warmup ?? WARMUP_COUNT;
    const delayMs = options.delayMs ?? 0;
    const layoutMs = options.layoutMs ?? 0;
    await resetDocument(condition);
    await installTimingHarness();
    const startDocLength = (await harnessSnapshot()).docLength;
    let logicalKeydowns = 0;
    try {
        const cycle = corpusCycle();
        for (let index = 0; index < warmup + samples; index += 1) {
            if (index > 0 && index % cycle.length === 0) {
                await resetDocument(condition);
            }
            const unit = cycle[index % cycle.length]!;
            for (const prelude of unit.preludes) {
                await sendKey(prelude);
                logicalKeydowns += 1;
            }
            if (condition === 'rpc' && unit.preludes.length > 0) {
                // Keep prefix/mode-transition work outside the timed region.
                // Msgpack requests preserve input order; this pause only waits
                // for the production delegation queue to drain before arming.
                await browser.pause(100);
            }
            // Start every real key event from the same frame phase. Without
            // this, asynchronous RPC work can land just before a frame while
            // the immediate fork transaction lands just after one, making the
            // slower path appear faster through rAF phase cancellation.
            await alignKeydownToFrame();
            await browser.execute(
                (
                    sampleIndex: number,
                    label: string,
                    operationClass: OperationClass,
                    synchronousDelay: number,
                    forcedLayout: number,
                ) => {
                    const harness = (window as HarnessWindow)
                        .__rpcLatencyHarness;
                    if (!harness)
                        throw new Error('Latency harness is not installed');
                    harness.arm(
                        sampleIndex,
                        label,
                        operationClass,
                        synchronousDelay,
                        forcedLayout,
                    );
                },
                index,
                unit.label,
                unit.operationClass,
                delayMs,
                layoutMs,
            );
            await sendKey(unit.key);
            logicalKeydowns += 1;
            await browser.waitUntil(
                async () => (await harnessSnapshot()).results.length > index,
                {
                    timeout: 5000,
                    interval: 5,
                    timeoutMsg: `Latency completion timeout: condition=${condition} index=${index} label=${unit.label} key=${JSON.stringify(unit.key)}`,
                },
            );
        }
        if (options.breakStability) {
            await sendKey('i');
            await sendKey('X');
            await sendKey('Escape');
            if (condition === 'rpc') await settleRpc();
        } else {
            await resetDocument(condition);
        }
        const snapshot = await harnessSnapshot();
        const measured = snapshot.results.slice(warmup);
        const grouped = {
            motion: [] as number[],
            operator: [] as number[],
            insert: [] as number[],
            undo: [] as number[],
        };
        for (const sample of measured) {
            grouped[sample.operationClass].push(sample.elapsed);
        }
        const endDocLength = snapshot.docLength;
        const sizeDrift = endDocLength - startDocLength;
        expect(endDocLength).toBe(startDocLength);
        const result: ConditionResult = {
            condition,
            stats: calculateStats(measured.map((sample) => sample.elapsed)),
            byClass: {
                motion: calculateStats(grouped.motion),
                operator: calculateStats(grouped.operator),
                insert: calculateStats(grouped.insert),
                undo: calculateStats(grouped.undo),
            },
            samples,
            warmup,
            logicalKeydowns,
            startDocLength,
            endDocLength,
            sizeDrift,
            motionChanged: measured.some(
                (sample) =>
                    sample.operationClass === 'motion' &&
                    sample.beforeHead !== sample.afterHead,
            ),
            layoutWorkMs: snapshot.layoutWorkMs,
        };
        console.log(`RPC_LATENCY_CONDITION ${JSON.stringify(result)}`);
        return result;
    } finally {
        await browser.execute(() =>
            (window as HarnessWindow).__rpcLatencyHarness?.stop(),
        );
    }
}

async function proveRpcEngagementAndForkIsolation(): Promise<void> {
    const state = await pluginSnapshot();
    expect(state.rpc.connected).toBe(true);
    expect(state.delegation).toEqual({
        active: true,
        handlerAttached: true,
        keyInterceptActive: true,
    });
    await resetDocument('rpc');
    const before = FIXTURE;
    await sendKey('i');
    await settleRpc();
    const isolation = (await browser.executeObsidian(
        async ({ app, obsidian }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const editorView = (
                view?.editor as unknown as {
                    cm?: {
                        cm?: {
                            state?: { vim?: { insertMode?: boolean } };
                        };
                    };
                }
            )?.cm;
            return {
                nvimMode: (await plugin!.requestNeovim(
                    'nvim_get_mode',
                    [],
                )) as {
                    mode?: string;
                },
                forkInsertMode: editorView?.cm?.state?.vim?.insertMode ?? false,
            };
        },
    )) as {
        nvimMode: { mode?: string };
        forkInsertMode: boolean;
    };
    expect(isolation.nvimMode.mode).toBe('i');
    expect(isolation.forkInsertMode).toBe(false);
    await sendKey('x');
    await sendKey('Escape');
    await settleRpc();
    const bridge = (await browser.executeObsidian(async ({ app, obsidian }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const lines = (await plugin!.requestNeovim('nvim_buf_get_lines', [
            0,
            0,
            -1,
            true,
        ])) as string[];
        return {
            neovim: lines.join('\n'),
            cm6: view?.editor.getValue() ?? '',
        };
    })) as { neovim: string; cm6: string };
    expect(bridge.neovim).not.toBe(before);
    expect(bridge.neovim).toBe(bridge.cm6);
    expect(bridge.neovim).toContain('x## Section 0');
    console.log(
        `RPC_LATENCY_ENGAGEMENT ${JSON.stringify({ delegation: state.delegation, nvimMode: isolation.nvimMode.mode, forkInsertMode: isolation.forkInsertMode, markerReachedNeovimAndCm6: bridge.neovim.includes('x## Section 0') && bridge.cm6.includes('x## Section 0') })}`,
    );
    await resetDocument('rpc');
}

describe('M7 RPC key-to-paint latency certification', function () {
    this.timeout(600000);
    let originalPropertiesInDocument: unknown;

    before(function () {
        requireRpcPrerequisites(this);
    });

    before(async () => {
        await setRpcEnabled(false);
        await waitForRpc(false);
        originalPropertiesInDocument = await browser.executeObsidian(
            async ({ app }, path: string, fixture: string) => {
                const vault = app.vault as unknown as {
                    getConfig(key: string): unknown;
                    setConfig(
                        key: string,
                        value: unknown,
                    ): void | Promise<void>;
                };
                const original = vault.getConfig('propertiesInDocument');
                await vault.setConfig('propertiesInDocument', 'source');
                if (await app.vault.adapter.exists(path))
                    await app.vault.adapter.remove(path);
                await app.vault.adapter.write(path, fixture);
                return original;
            },
            FIXTURE_PATH,
            FIXTURE,
        );
        await loadSingleFileWorkspace(FIXTURE_PATH);
        await ensureLivePreview();
        expect(await isLivePreview()).toBe(true);
        const initial = await pluginSnapshot();
        expect(initial.vimEnabled).toBe(true);
    });

    after(async () => {
        await browser.execute(() =>
            (window as HarnessWindow).__rpcLatencyHarness?.stop(),
        );
        await setRpcEnabled(false);
        await waitForRpc(false);
        await browser.executeObsidian(
            async ({ app }, path: string, original: unknown) => {
                const vault = app.vault as unknown as {
                    setConfig(
                        key: string,
                        value: unknown,
                    ): void | Promise<void>;
                };
                if (app.workspace.getActiveFile()?.path === path) {
                    app.workspace.getLeaf(false).detach();
                    await new Promise<void>((resolve) =>
                        window.setTimeout(resolve, 100),
                    );
                }
                if (await app.vault.adapter.exists(path))
                    await app.vault.adapter.remove(path);
                await vault.setConfig('propertiesInDocument', original);
            },
            FIXTURE_PATH,
            originalPropertiesInDocument,
        );
        for (const pid of spawnedPids) {
            try {
                process.kill(pid, 0);
                process.kill(pid, 'SIGKILL');
            } catch {
                // Process already exited.
            }
        }
        spawnedPids.clear();
    });

    it('certifies production RPC latency against the isolated fork', async () => {
        const disconnected = await pluginSnapshot();
        expect(disconnected.rpc.connected).toBe(false);
        expect(disconnected.delegation.keyInterceptActive).toBe(false);
        const fork = await runCondition('fork', {
            breakStability: BREAK_STABILITY,
        });
        expect(fork.motionChanged).toBe(true);

        await setRpcEnabled(true);
        await waitForRpc(true);
        await proveRpcEngagementAndForkIsolation();
        const rpc = await runCondition('rpc');

        const delayed = await runCondition('rpc', {
            samples: 80,
            warmup: 20,
            delayMs: 40,
        });
        const delayRise = delayed.stats.p95 - rpc.stats.p95;
        console.log(
            `RPC_LATENCY_DELAY_CONTROL ${JSON.stringify({ baseline: rpc.stats.p95, delayed: delayed.stats.p95, rise: delayRise })}`,
        );
        expect(delayRise).toBeGreaterThanOrEqual(30);
        expect(delayRise).toBeLessThanOrEqual(70);

        await setRpcEnabled(false);
        await waitForRpc(false);
        const forcedLayout = await runCondition('fork', {
            samples: 50,
            warmup: 10,
            layoutMs: 40,
        });
        const layoutRise = forcedLayout.stats.p95 - fork.stats.p95;
        console.log(
            `RPC_LATENCY_LAYOUT_CONTROL ${JSON.stringify({ baseline: fork.stats.p95, forced: forcedLayout.stats.p95, rise: layoutRise, work: forcedLayout.layoutWorkMs })}`,
        );
        expect(layoutRise).toBeGreaterThanOrEqual(30);
        expect(forcedLayout.layoutWorkMs).toBeGreaterThanOrEqual(1900);

        const sanityPassed = fork.stats.p50 < rpc.stats.p50;
        console.log(
            `RPC_LATENCY_SANITY ${JSON.stringify({ forkP50: fork.stats.p50, rpcP50: rpc.stats.p50, passed: sanityPassed, basis: 'p50 isolates round-trip cost; p95 is dominated by in-renderer vim work the RPC path does not perform' })}`,
        );
        expect(rpc.stats.p50).toBeGreaterThan(fork.stats.p50);

        const p95Delta = rpc.stats.p95 - fork.stats.p95;
        const p99Delta = rpc.stats.p99 - fork.stats.p99;
        console.log(
            `RPC_LATENCY_CERTIFICATION ${JSON.stringify({ samples: SAMPLE_COUNT, warmup: WARMUP_COUNT, fork: fork.stats, rpc: rpc.stats, p95Delta, p99Delta, byClass: { fork: fork.byClass, rpc: rpc.byClass } })}`,
        );
        expect(p95Delta).toBeLessThanOrEqual(25);
        expect(p99Delta).toBeLessThanOrEqual(60);
    });
});
