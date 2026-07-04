export interface VimrcCommand {
    type:
        | 'map'
        | 'unmap'
        | 'gmap'
        | 'gunmap'
        | 'gwhichkeylabel'
        | 'gwhichkeygroup'
        | 'set'
        | 'let'
        | 'exmap'
        | 'obcommand'
        | 'source'
        | 'unknown';
    raw: string;
    mapType?: string;
    noremap?: boolean;
    context?: 'normal' | 'visual' | 'insert';
    lhs?: string;
    rhs?: string;
    key?: string;
    value?: string;
    name?: string;
    args?: string;
    path?: string;
}

const MAP_COMMANDS = new Set([
    'map',
    'nmap',
    'imap',
    'vmap',
    'noremap',
    'nnoremap',
    'inoremap',
    'vnoremap',
]);

const UNMAP_COMMANDS = new Set(['unmap', 'nunmap', 'iunmap', 'vunmap']);

const GMAP_COMMANDS = new Set(['gmap', 'gnoremap']);

const GUNMAP_COMMANDS = new Set(['gunmap']);

const GWHICHKEYLABEL_CMD = 'gwhichkeylabel';
const GWHICHKEYGROUP_CMD = 'gwhichkeygroup';

function getMapContext(
    cmd: string,
): 'normal' | 'visual' | 'insert' | undefined {
    if (cmd.startsWith('i')) return 'insert';
    if (cmd.startsWith('v')) return 'visual';
    if (cmd.startsWith('n')) return 'normal';
    return undefined;
}

function isNoremap(cmd: string): boolean {
    return cmd.includes('noremap');
}

export function parseLine(line: string): VimrcCommand | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('"')) return null;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    if (!cmd) return null;

    if (MAP_COMMANDS.has(cmd)) {
        const lhs = parts[1];
        const rhs = parts.slice(2).join(' ');
        if (!lhs || !rhs) return null;
        return {
            type: 'map',
            raw: trimmed,
            mapType: cmd,
            noremap: isNoremap(cmd),
            context: getMapContext(cmd),
            lhs,
            rhs,
        };
    }

    if (UNMAP_COMMANDS.has(cmd)) {
        const lhs = parts[1];
        if (!lhs) return null;
        return {
            type: 'unmap',
            raw: trimmed,
            context: getMapContext(cmd),
            lhs,
        };
    }

    if (GMAP_COMMANDS.has(cmd)) {
        const lhs = parts[1];
        const rhs = parts.slice(2).join(' ');
        if (!lhs || !rhs) return null;
        return {
            type: 'gmap',
            raw: trimmed,
            mapType: cmd,
            noremap: isNoremap(cmd),
            lhs,
            rhs,
        };
    }

    if (GUNMAP_COMMANDS.has(cmd)) {
        const lhs = parts[1];
        if (!lhs) return null;
        return {
            type: 'gunmap',
            raw: trimmed,
            lhs,
        };
    }

    if (cmd === GWHICHKEYLABEL_CMD) {
        const lhs = parts[1];
        const rhs = parts.slice(2).join(' ');
        if (!lhs || !rhs) return null;
        return { type: 'gwhichkeylabel', raw: trimmed, lhs, rhs };
    }

    if (cmd === GWHICHKEYGROUP_CMD) {
        const lhs = parts[1];
        const rhs = parts.slice(2).join(' ');
        if (!lhs || !rhs) return null;
        return { type: 'gwhichkeygroup', raw: trimmed, lhs, rhs };
    }

    if (cmd === 'set') {
        const arg = parts[1];
        if (!arg) return null;
        const eqIdx = arg.indexOf('=');
        if (eqIdx === -1) {
            return { type: 'set', raw: trimmed, key: arg, value: '' };
        }
        return {
            type: 'set',
            raw: trimmed,
            key: arg.substring(0, eqIdx),
            value: arg.substring(eqIdx + 1),
        };
    }

    if (cmd === 'let') {
        const letMatch = trimmed.match(/^let\s+(\S+)\s*=\s*["'](.*)["']\s*$/);
        if (letMatch && letMatch[1] && letMatch[2] !== undefined) {
            return {
                type: 'let',
                raw: trimmed,
                key: letMatch[1],
                value: letMatch[2],
            };
        }
        const varName = parts[1];
        const eq = parts[2];
        const val = parts.slice(3).join(' ');
        if (eq !== '=' || !varName) return null;
        const cleanVal = val.replace(/^["']|["']$/g, '');
        return { type: 'let', raw: trimmed, key: varName, value: cleanVal };
    }

    if (cmd === 'exmap') {
        const name = parts[1];
        const rest = parts.slice(2).join(' ');
        if (!name || !rest) return null;
        return { type: 'exmap', raw: trimmed, name, args: rest };
    }

    if (cmd === 'obcommand') {
        const commandId = parts[1];
        if (!commandId) return null;
        return { type: 'obcommand', raw: trimmed, args: commandId };
    }

    if (cmd === 'source') {
        const path = parts.slice(1).join(' ');
        if (!path) return null;
        return { type: 'source', raw: trimmed, path };
    }

    return { type: 'unknown', raw: trimmed };
}

export function parseVimrc(content: string): VimrcCommand[] {
    const commands: VimrcCommand[] = [];
    for (const line of content.split('\n')) {
        const cmd = parseLine(line);
        if (cmd) {
            commands.push(cmd);
        }
    }
    return commands;
}
