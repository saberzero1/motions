import { readFileSync } from 'node:fs';

const [, , logPath, exitCodeRaw] = process.argv;
const exitCode = Number(exitCodeRaw ?? '0');

let text = '';
try {
    text = readFileSync(logPath, 'utf8');
} catch {
    text = '';
}

function parseMarker(marker) {
    return text
        .split('\n')
        .filter((line) => line.includes(marker))
        .map((line) => {
            const start = line.indexOf('{');
            if (start < 0) {
                return null;
            }
            try {
                return JSON.parse(line.slice(start));
            } catch {
                return null;
            }
        })
        .filter((entry) => entry !== null);
}

function ms(value) {
    return typeof value === 'number' ? value.toFixed(1) : '—';
}

const conditions = parseMarker('RPC_LATENCY_CONDITION');
const controls = parseMarker('RPC_LATENCY_DELAY_CONTROL');

const lines = ['## RPC latency benchmark', ''];

lines.push(
    exitCode === 0
        ? 'Result: passed.'
        : 'Result: **did not pass**. This job is non-blocking; the failure is reported here and as a warning annotation.',
);
lines.push('');

if (conditions.length > 0) {
    lines.push('| condition | samples | p50 (ms) | p95 (ms) | p99 (ms) |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const entry of conditions) {
        const stats = entry.stats ?? {};
        lines.push(
            `| ${entry.condition ?? '—'} | ${stats.n ?? '—'} | ${ms(stats.p50)} | ${ms(stats.p95)} | ${ms(stats.p99)} |`,
        );
    }
    lines.push('');
} else {
    lines.push(
        'No `RPC_LATENCY_CONDITION` samples were recorded, so the run ended before measuring. Check the job log for the underlying error.',
    );
    lines.push('');
}

for (const control of controls) {
    lines.push(
        `Delay control: baseline ${ms(control.baseline)} ms, delayed ${ms(control.delayed)} ms, rise ${ms(control.rise)} ms.`,
    );
}
if (controls.length > 0) {
    lines.push('');
}

lines.push(
    'These percentiles come from a shared GitHub runner and move with its load, so read them as a trend rather than a thresholded gate. The certified figures were measured locally and are recorded in `docs/features/neovim-backend.md`.',
);

console.log(lines.join('\n'));
