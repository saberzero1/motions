import type { SnippetFile } from './types';
import type { LuaSnippetDef, LuaSnippetNode } from '../lua/snippet-api';
import type { DynamicSnippetDef, DynamicNodeMeta } from './dynamic-bridge';
import type { lua_State } from 'fengari';

export function compileLuaSnippets(defs: LuaSnippetDef[]): SnippetFile {
    const result: SnippetFile = {};
    for (const def of defs) {
        result[def.name] = {
            prefix: def.trigger,
            body: compileNodes(def.nodes),
            description: def.description,
            context: def.context,
        };
    }
    return result;
}

export interface CompilationResult {
    staticSnippets: SnippetFile;
    dynamicSnippets: Map<
        string,
        { def: LuaSnippetDef; compiled: DynamicSnippetDef }
    >;
}

export function compileLuaSnippetsHybrid(
    defs: LuaSnippetDef[],
    luaState: lua_State,
): CompilationResult {
    const staticSnippets: SnippetFile = {};
    const dynamicSnippets = new Map<
        string,
        { def: LuaSnippetDef; compiled: DynamicSnippetDef }
    >();

    for (const def of defs) {
        if (def.hasDynamic) {
            const compiled = compileDynamicDef(def, luaState);
            dynamicSnippets.set(def.trigger, { def, compiled });
        } else {
            staticSnippets[def.name] = {
                prefix: def.trigger,
                body: compileNodes(def.nodes),
                description: def.description,
                context: def.context,
            };
        }
    }

    return { staticSnippets, dynamicSnippets };
}

function compileNodes(nodes: LuaSnippetNode[]): string {
    return nodes.map(compileNode).join('');
}

export function compileNode(node: LuaSnippetNode): string {
    switch (node.type) {
        case 'text':
            return node.text ?? '';
        case 'insert':
            return node.placeholder
                ? `\${${node.index}:${node.placeholder}}`
                : `$${node.index}`;
        case 'choice': {
            const choices = (node.choices ?? [])
                .map((c) => c.text ?? '')
                .join(',');
            return `\${${node.index}|${choices}|}`;
        }
        case 'rep':
            return `$${node.index}`;
        default:
            return '';
    }
}

function compileDynamicDef(
    def: LuaSnippetDef,
    luaState: lua_State,
): DynamicSnippetDef {
    const dynamicNodes: DynamicNodeMeta[] = [];
    let nextSyntheticField = findMaxFieldIndex(def.nodes) + 1;
    const bodyParts: string[] = [];

    for (const node of def.nodes) {
        switch (node.type) {
            case 'function': {
                const fieldIndex = nextSyntheticField++;
                dynamicNodes.push({
                    kind: 'function',
                    luaFnRef: node.luaFnRef!,
                    dependsOn: node.dependsOn ?? [],
                    fieldIndex,
                });
                bodyParts.push(`\${${fieldIndex}:…}`);
                break;
            }
            case 'dynamic': {
                dynamicNodes.push({
                    kind: 'dynamic',
                    luaFnRef: node.luaFnRef!,
                    dependsOn: node.dependsOn ?? [],
                    fieldIndex: node.index!,
                });
                bodyParts.push(`\${${node.index}:}`);
                break;
            }
            default:
                bodyParts.push(compileNode(node));
        }
    }

    return {
        staticBody: bodyParts.join(''),
        dynamicNodes,
        luaState,
        staticFieldCount: nextSyntheticField,
    };
}

function findMaxFieldIndex(nodes: LuaSnippetNode[]): number {
    let max = 0;
    for (const node of nodes) {
        if (node.index !== undefined && node.index > max) max = node.index;
    }
    return max;
}
