import type { Node } from 'web-tree-sitter';
import type { PredicateStep } from './query';

export type PredicateHandler = (
    operands: PredicateStep[],
    captures: Map<string, Node[]>,
    source: string,
) => boolean;

function getNodeText(node: Node, source: string): string {
    return source.slice(node.startIndex, node.endIndex);
}

function getCaptureNodes(
    operands: PredicateStep[],
    captures: Map<string, Node[]>,
    startIndex: number,
): Node[] | null {
    const step = operands[startIndex];
    if (!step || step.type !== 'capture') return null;
    return captures.get(step.name) ?? null;
}

function getStringOperand(
    operands: PredicateStep[],
    index: number,
): string | null {
    const step = operands[index];
    if (!step) return null;
    if (step.type === 'string') return step.value;
    return null;
}

const eqHandler: PredicateHandler = (operands, captures, source) => {
    const nodes = getCaptureNodes(operands, captures, 0);
    if (!nodes || nodes.length === 0) return false;

    const second = operands[1];
    if (!second) return false;

    if (second.type === 'string') {
        return nodes.every((n) => getNodeText(n, source) === second.value);
    }
    if (second.type === 'capture') {
        const otherNodes = captures.get(second.name);
        if (!otherNodes || otherNodes.length === 0) return false;
        const text = getNodeText(nodes[0]!, source);
        return otherNodes.every((n) => getNodeText(n, source) === text);
    }
    return false;
};

const matchHandler: PredicateHandler = (operands, captures, source) => {
    const nodes = getCaptureNodes(operands, captures, 0);
    if (!nodes || nodes.length === 0) return false;
    const pattern = getStringOperand(operands, 1);
    if (pattern === null) return false;
    try {
        const re = new RegExp(pattern);
        return nodes.every((n) => re.test(getNodeText(n, source)));
    } catch {
        return false;
    }
};

const luaMatchHandler: PredicateHandler = (operands, captures, source) => {
    return matchHandler(operands, captures, source);
};

const containsHandler: PredicateHandler = (operands, captures, source) => {
    const nodes = getCaptureNodes(operands, captures, 0);
    if (!nodes || nodes.length === 0) return false;
    const substring = getStringOperand(operands, 1);
    if (substring === null) return false;
    return nodes.every((n) => getNodeText(n, source).includes(substring));
};

const anyOfHandler: PredicateHandler = (operands, captures, source) => {
    const nodes = getCaptureNodes(operands, captures, 0);
    if (!nodes || nodes.length === 0) return false;
    const values: string[] = [];
    for (let i = 1; i < operands.length; i++) {
        const val = getStringOperand(operands, i);
        if (val !== null) values.push(val);
    }
    return nodes.every((n) => values.includes(getNodeText(n, source)));
};

const hasAncestorHandler: PredicateHandler = (operands, captures) => {
    const nodes = getCaptureNodes(operands, captures, 0);
    if (!nodes || nodes.length === 0) return false;
    const types: string[] = [];
    for (let i = 1; i < operands.length; i++) {
        const val = getStringOperand(operands, i);
        if (val !== null) types.push(val);
    }
    if (types.length === 0) return false;
    return nodes.every((n) => {
        let current = n.parent;
        while (current) {
            if (types.includes(current.type)) return true;
            current = current.parent;
        }
        return false;
    });
};

const hasParentHandler: PredicateHandler = (operands, captures) => {
    const nodes = getCaptureNodes(operands, captures, 0);
    if (!nodes || nodes.length === 0) return false;
    const types: string[] = [];
    for (let i = 1; i < operands.length; i++) {
        const val = getStringOperand(operands, i);
        if (val !== null) types.push(val);
    }
    if (types.length === 0) return false;
    return nodes.every((n) => {
        const parent = n.parent;
        return parent !== null && types.includes(parent.type);
    });
};

const builtinPredicates = new Map<string, PredicateHandler>([
    ['eq?', eqHandler],
    ['match?', matchHandler],
    ['vim-match?', matchHandler],
    ['lua-match?', luaMatchHandler],
    ['contains?', containsHandler],
    ['any-of?', anyOfHandler],
    ['has-ancestor?', hasAncestorHandler],
    ['has-parent?', hasParentHandler],
]);

const customPredicates = new Map<string, PredicateHandler>();

export function registerPredicate(
    name: string,
    handler: PredicateHandler,
): void {
    customPredicates.set(name, handler);
}

export function listPredicates(): string[] {
    const all = new Set([
        ...builtinPredicates.keys(),
        ...customPredicates.keys(),
    ]);
    return [...all].sort();
}

export function evaluatePredicate(
    rawOperator: string,
    operands: PredicateStep[],
    captures: Map<string, Node[]>,
    source: string,
): boolean {
    let operator = rawOperator;
    let shouldMatch = true;
    let anyMode = false;

    if (operator.startsWith('not-')) {
        operator = operator.slice(4);
        shouldMatch = false;
    }
    if (operator.startsWith('any-')) {
        operator = operator.slice(4);
        anyMode = true;
    }

    const handler =
        customPredicates.get(operator) ?? builtinPredicates.get(operator);
    if (!handler) return true;

    if (anyMode) {
        const captureStep = operands[0];
        if (!captureStep || captureStep.type !== 'capture') {
            return shouldMatch
                ? handler(operands, captures, source)
                : !handler(operands, captures, source);
        }
        const nodes = captures.get(captureStep.name) ?? [];
        const anyPass = nodes.some((node) => {
            const singleCaptures = new Map(captures);
            singleCaptures.set(captureStep.name, [node]);
            return handler(operands, singleCaptures, source);
        });
        return shouldMatch ? anyPass : !anyPass;
    }

    const result = handler(operands, captures, source);
    return shouldMatch ? result : !result;
}

export function clearCustomPredicates(): void {
    customPredicates.clear();
}
