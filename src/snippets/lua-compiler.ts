import type { SnippetFile } from './types';
import type { LuaSnippetDef, LuaSnippetNode } from '../lua/snippet-api';

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

function compileNodes(nodes: LuaSnippetNode[]): string {
    return nodes.map(compileNode).join('');
}

function compileNode(node: LuaSnippetNode): string {
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
