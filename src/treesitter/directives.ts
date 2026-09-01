import type { PredicateStep } from './query';

export type Metadata = Record<string, string | number | null>;

export type DirectiveHandler = (
    operands: PredicateStep[],
    metadata: Metadata,
    captureId: number,
    captureNames: string[],
) => void;

function getStringOperand(
    operands: PredicateStep[],
    index: number,
): string | null {
    const step = operands[index];
    if (!step) return null;
    return step.type === 'string' ? step.value : null;
}

const setHandler: DirectiveHandler = (operands, metadata) => {
    const key = getStringOperand(operands, 0);
    if (key === null) return;
    const value = getStringOperand(operands, 1);
    metadata[key] = value;
};

const offsetHandler: DirectiveHandler = (
    operands,
    metadata,
    _captureId,
    _captureNames,
) => {
    const startRow = getStringOperand(operands, 1);
    const startCol = getStringOperand(operands, 2);
    const endRow = getStringOperand(operands, 3);
    const endCol = getStringOperand(operands, 4);

    if (startRow !== null)
        metadata['offset.start_row'] = parseInt(startRow, 10) || 0;
    if (startCol !== null)
        metadata['offset.start_col'] = parseInt(startCol, 10) || 0;
    if (endRow !== null) metadata['offset.end_row'] = parseInt(endRow, 10) || 0;
    if (endCol !== null) metadata['offset.end_col'] = parseInt(endCol, 10) || 0;
};

const gsubHandler: DirectiveHandler = (operands, metadata) => {
    const pattern = getStringOperand(operands, 1);
    const replacement = getStringOperand(operands, 2);
    if (pattern !== null && replacement !== null) {
        metadata['gsub.pattern'] = pattern;
        metadata['gsub.replacement'] = replacement;
    }
};

const trimHandler: DirectiveHandler = (operands, metadata) => {
    const side = getStringOperand(operands, 1);
    metadata['trim'] = side ?? 'both';
};

const builtinDirectives = new Map<string, DirectiveHandler>([
    ['set!', setHandler],
    ['offset!', offsetHandler],
    ['gsub!', gsubHandler],
    ['trim!', trimHandler],
]);

const customDirectives = new Map<string, DirectiveHandler>();

export function registerDirective(
    name: string,
    handler: DirectiveHandler,
): void {
    customDirectives.set(name, handler);
}

export function listDirectives(): string[] {
    const all = new Set([
        ...builtinDirectives.keys(),
        ...customDirectives.keys(),
    ]);
    return [...all].sort();
}

export function applyDirective(
    operator: string,
    operands: PredicateStep[],
    metadata: Metadata,
    captureId: number,
    captureNames: string[],
): void {
    const handler =
        customDirectives.get(operator) ?? builtinDirectives.get(operator);
    if (!handler) return;
    handler(operands, metadata, captureId, captureNames);
}

export function clearCustomDirectives(): void {
    customDirectives.clear();
}
