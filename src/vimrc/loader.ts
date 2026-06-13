import type { App } from 'obsidian';
import type { VimApi, MapContext } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { parseVimrc, type VimrcCommand } from './parser';

function getVimrcPath(app: App): string {
    return `${app.vault.configDir}.vimrc`;
}

async function readVimrcFile(app: App, path: string): Promise<string | null> {
    try {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file) return null;
        return await app.vault.read(
            file as Parameters<typeof app.vault.read>[0],
        );
    } catch {
        return null;
    }
}

function toMapContext(context?: string): MapContext | undefined {
    if (context === 'normal') return 'normal';
    if (context === 'insert') return 'insert';
    if (context === 'visual') return 'visual';
    return undefined;
}

function applyCommand(
    vim: VimApi,
    cmd: VimrcCommand,
    lhs: string | undefined,
    rhs: string | undefined,
    args: string | undefined,
    app: App,
    exmaps: Map<string, string>,
): void {
    switch (cmd.type) {
        case 'map': {
            if (!lhs || !rhs) break;
            if (cmd.noremap) {
                vim.noremap(lhs, rhs, toMapContext(cmd.context));
            } else {
                vim.map(lhs, rhs, toMapContext(cmd.context));
            }
            break;
        }
        case 'unmap': {
            if (!lhs) break;
            vim.unmap(lhs, toMapContext(cmd.context));
            break;
        }
        case 'set': {
            if (!cmd.key) break;
            let optName = cmd.key;
            const rawVal = cmd.value ?? '';
            if (rawVal === '' && optName.startsWith('no')) {
                optName = optName.slice(2);
                vim.setOption(optName, false);
            } else {
                const numVal = parseInt(rawVal, 10);
                const resolved =
                    rawVal === '' ? true : !isNaN(numVal) ? numVal : rawVal;
                vim.setOption(optName, resolved);
            }
            break;
        }
        case 'exmap': {
            const exmapArgs = args;
            if (cmd.name && exmapArgs) {
                exmaps.set(cmd.name, exmapArgs);
                vim.defineEx(cmd.name, '', (_cm, _params) => {
                    const fullCmd = exmaps.get(cmd.name ?? '');
                    if (!fullCmd) return;
                    const parts = fullCmd.split(/\s+/);
                    const exCmd = parts[0];
                    const exArgs = parts.slice(1).join(' ');
                    if (exCmd === 'obcommand' && exArgs) {
                        (
                            app as unknown as {
                                commands: {
                                    executeCommandById: (id: string) => void;
                                };
                            }
                        ).commands.executeCommandById(exArgs);
                    }
                });
            }
            break;
        }
        case 'obcommand': {
            if (cmd.args) {
                (
                    app as unknown as {
                        commands: { executeCommandById: (id: string) => void };
                    }
                ).commands.executeCommandById(cmd.args);
            }
            break;
        }
        default:
            break;
    }
}

export async function loadVimrc(
    app: App,
    vim: VimApi,
    leaderRegistry?: LeaderRegistry,
): Promise<void> {
    await loadVimrcFile(app, vim, getVimrcPath(app), '\\', leaderRegistry);
}

async function loadVimrcFile(
    app: App,
    vim: VimApi,
    path: string,
    leaderKey = '\\',
    leaderRegistry?: LeaderRegistry,
): Promise<void> {
    const content = await readVimrcFile(app, path);
    if (content === null) return;

    const commands = parseVimrc(content);
    const exmaps = new Map<string, string>();
    let currentLeader = leaderKey;

    for (const cmd of commands) {
        if (cmd.type === 'source' && cmd.path) {
            await loadVimrcFile(
                app,
                vim,
                cmd.path,
                currentLeader,
                leaderRegistry,
            );
            continue;
        }
        if (cmd.type === 'let' && cmd.key === 'mapleader' && cmd.value) {
            currentLeader = cmd.value;
            if (leaderRegistry) leaderRegistry.setLeaderKey(currentLeader);
            continue;
        }
        const lhs = cmd.lhs?.replace(/<leader>/gi, currentLeader);
        const rhs = cmd.rhs?.replace(/<leader>/gi, currentLeader);
        const args = cmd.args?.replace(/<leader>/gi, currentLeader);
        if (leaderRegistry && cmd.type === 'map' && lhs && rhs) {
            leaderRegistry.addBinding(lhs, rhs);
        }
        try {
            applyCommand(vim, cmd, lhs, rhs, args, app, exmaps);
        } catch {
            /* intentional: skip malformed vimrc lines */
        }
    }
}
