import type { App } from 'obsidian';
import type { SnippetFile } from './types';
import { SnippetRegistry } from './registry';
import { compileLuaSnippets, compileLuaSnippetsHybrid } from './lua-compiler';
import type { LuaSnippetDef } from '../lua/snippet-api';
import type { lua_State } from 'fengari';
import {
    isAbsolutePath,
    readExternalFile,
    readExternalDir,
} from '../util/external-fs';

import BUNDLED_GLOBAL from './bundled/global.json';
import BUNDLED_OBSIDIAN_MARKDOWN from './bundled/obsidian-markdown.json';

type SnippetLoadError = { file: string; error: string };

function joinPath(dir: string, file: string): string {
    if (!dir) return file;
    const separator = dir.includes('\\') ? '\\' : '/';
    if (dir.endsWith('/') || dir.endsWith('\\')) {
        return `${dir}${file}`;
    }
    return `${dir}${separator}${file}`;
}

async function readSnippetFile(app: App, path: string): Promise<string | null> {
    if (isAbsolutePath(path)) {
        return readExternalFile(path);
    }
    try {
        return await app.vault.adapter.read(path);
    } catch {
        return null;
    }
}

export function loadSnippetsSync(
    settings: { snippetBundled: boolean },
    luaSnippets?: LuaSnippetDef[],
    luaState?: lua_State,
): SnippetRegistry {
    const registry = new SnippetRegistry();
    if (settings.snippetBundled) {
        registry.loadFile(BUNDLED_GLOBAL, 'bundled');
        registry.loadFile(BUNDLED_OBSIDIAN_MARKDOWN, 'bundled');
    }
    if (luaSnippets && luaSnippets.length > 0) {
        if (luaState) {
            const { staticSnippets, dynamicSnippets } =
                compileLuaSnippetsHybrid(luaSnippets, luaState);
            registry.loadFile(staticSnippets, 'lua');
            for (const [trigger, { def, compiled }] of dynamicSnippets) {
                registry.loadFile(
                    {
                        [trigger]: {
                            prefix: trigger,
                            body: compiled.staticBody,
                            description: `[dynamic] ${trigger}`,
                            context: def.context,
                        },
                    },
                    'lua',
                );
                registry.registerDynamic(trigger, compiled);
            }
        } else {
            const compiled = compileLuaSnippets(luaSnippets);
            registry.loadFile(compiled, 'lua');
        }
    }
    return registry;
}

export async function loadSnippets(
    app: App,
    settings: { snippetBundled: boolean; snippetDirectory: string },
    luaSnippets?: LuaSnippetDef[],
    luaState?: lua_State,
): Promise<{ registry: SnippetRegistry; errors: SnippetLoadError[] }> {
    const registry = new SnippetRegistry();
    const errors: SnippetLoadError[] = [];

    if (settings.snippetBundled) {
        registry.loadFile(BUNDLED_GLOBAL, 'bundled');
        registry.loadFile(BUNDLED_OBSIDIAN_MARKDOWN, 'bundled');
    }

    if (settings.snippetDirectory) {
        const dir = settings.snippetDirectory;
        if (isAbsolutePath(dir)) {
            const entries = await readExternalDir(dir);
            if (!entries) {
                errors.push({ file: dir, error: 'Unable to read directory' });
            } else {
                const jsonFiles = entries.filter((name) =>
                    name.toLowerCase().endsWith('.json'),
                );
                for (const fileName of jsonFiles) {
                    const fullPath = joinPath(dir, fileName);
                    const content = await readSnippetFile(app, fullPath);
                    if (content === null) {
                        errors.push({
                            file: fullPath,
                            error: 'Unable to read file',
                        });
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(content) as SnippetFile;
                        registry.loadFile(parsed, 'user', fullPath);
                    } catch (error) {
                        errors.push({
                            file: fullPath,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : 'Invalid JSON',
                        });
                    }
                }
            }
        } else {
            try {
                const listing = await app.vault.adapter.list(dir);
                const jsonFiles = listing.files.filter((file) =>
                    file.toLowerCase().endsWith('.json'),
                );
                for (const filePath of jsonFiles) {
                    const content = await readSnippetFile(app, filePath);
                    if (content === null) {
                        errors.push({
                            file: filePath,
                            error: 'Unable to read file',
                        });
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(content) as SnippetFile;
                        registry.loadFile(parsed, 'user', filePath);
                    } catch (error) {
                        errors.push({
                            file: filePath,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : 'Invalid JSON',
                        });
                    }
                }
            } catch (error) {
                errors.push({
                    file: dir,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unable to read directory',
                });
            }
        }
    }

    if (luaSnippets && luaSnippets.length > 0) {
        if (luaState) {
            const { staticSnippets, dynamicSnippets } =
                compileLuaSnippetsHybrid(luaSnippets, luaState);
            registry.loadFile(staticSnippets, 'lua');
            for (const [trigger, { def, compiled }] of dynamicSnippets) {
                registry.loadFile(
                    {
                        [trigger]: {
                            prefix: trigger,
                            body: compiled.staticBody,
                            description: `[dynamic] ${trigger}`,
                            context: def.context,
                        },
                    },
                    'lua',
                );
                registry.registerDynamic(trigger, compiled);
            }
        } else {
            const compiled = compileLuaSnippets(luaSnippets);
            registry.loadFile(compiled, 'lua');
        }
    }

    return { registry, errors };
}
