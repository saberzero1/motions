import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYamlContent } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CommandEntry {
    tier: number | string;
    status: string;
    test_file: string;
    description: string;
    reason?: string;
}

type ManifestSection = Record<string, CommandEntry>;

function parseYaml(content: string): Record<string, ManifestSection> {
    const raw = parseYamlContent(content) as Record<
        string,
        Record<string, unknown>
    > | null;
    if (!raw || typeof raw !== 'object') return {};

    const result: Record<string, ManifestSection> = {};
    for (const [section, commands] of Object.entries(raw)) {
        if (!commands || typeof commands !== 'object') continue;
        result[section] = {};
        for (const [key, entry] of Object.entries(
            commands as Record<string, Record<string, unknown>>,
        )) {
            if (!entry || typeof entry !== 'object') continue;
            result[section][key] = {
                tier: (entry.tier as number | string) ?? '?',
                status: (entry.status as string) ?? 'unknown',
                test_file: (entry.test_file as string) ?? '',
                description: (entry.description as string) ?? '',
                reason: entry.reason as string | undefined,
            };
        }
    }
    return result;
}

function main() {
    const manifestPath = path.resolve(__dirname, 'neovim-command-index.yaml');
    const specsDir = path.resolve(__dirname, 'specs');

    if (!fs.existsSync(manifestPath)) {
        console.error(`Manifest not found: ${manifestPath}`);
        process.exit(1);
    }

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = parseYaml(content);

    let totalTested = 0;
    let totalPending = 0;
    let totalSkipped = 0;
    let totalNA = 0;
    let brokenRefs = 0;

    console.log('Neovim Command Index Coverage');
    console.log('─'.repeat(60));
    console.log('');

    for (const [section, commands] of Object.entries(manifest)) {
        let tested = 0;
        let pending = 0;
        let skipped = 0;
        let na = 0;

        for (const [, cmd] of Object.entries(commands)) {
            if (cmd.status === 'tested') {
                tested++;
                if (cmd.test_file) {
                    const fullPath = path.join(specsDir, cmd.test_file);
                    if (!fs.existsSync(fullPath)) {
                        brokenRefs++;
                        console.error(
                            `  BROKEN REF: ${section} → ${cmd.test_file} does not exist`,
                        );
                    }
                }
            } else if (cmd.status === 'pending') {
                pending++;
            } else if (cmd.status === 'skip') {
                if (String(cmd.tier) === '3') na++;
                else skipped++;
            }
        }

        const total = tested + pending + skipped + na;
        const pct = total > 0 ? Math.round((tested / total) * 100) : 0;
        const parts = [`${tested} tested`];
        if (pending > 0) parts.push(`${pending} pending`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (na > 0) parts.push(`${na} n/a`);

        console.log(
            `${section.padEnd(30)} ${tested}/${total}`.padEnd(42) +
                `(${pct}%) — ${parts.join(', ')}`,
        );

        totalTested += tested;
        totalPending += pending;
        totalSkipped += skipped;
        totalNA += na;
    }

    const grandTotal = totalTested + totalPending + totalSkipped + totalNA;
    const grandPct =
        grandTotal > 0 ? Math.round((totalTested / grandTotal) * 100) : 0;

    console.log('');
    console.log('─'.repeat(60));
    console.log(
        `${'TOTAL'.padEnd(30)} ${totalTested}/${grandTotal}`.padEnd(42) +
            `(${grandPct}%) — ${totalTested} tested, ${totalPending} pending, ${totalSkipped} skipped, ${totalNA} n/a`,
    );

    if (brokenRefs > 0) {
        console.log('');
        console.error(`⚠ ${brokenRefs} broken test_file reference(s) found!`);
    }

    console.log('');
}

main();
