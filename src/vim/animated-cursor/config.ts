import type { AnimatedCursorConfig, CursorShape } from './types';

let currentConfig: AnimatedCursorConfig = {
    enabled: false,
    smoothCursor: true,
    smoothness: 0.5,
    smearTrail: true,
    stiffness: 0.6,
    trailingStiffness: 0.3,
    damping: 0.85,
    maxLength: 400,
};

let cursorShapesByMode: Record<string, CursorShape> = {
    normal: 'block',
    insert: 'bar',
    visual: 'block',
    replace: 'underline',
    operatorPending: 'underline',
};

export function getAnimatedCursorConfig(): AnimatedCursorConfig {
    return currentConfig;
}

export function setAnimatedCursorConfig(
    config: Partial<AnimatedCursorConfig>,
): void {
    currentConfig = { ...currentConfig, ...config };
}

export function getCursorShapeForMode(vimMode?: string): CursorShape {
    if (!vimMode) return cursorShapesByMode['normal'] ?? 'block';
    const mapped = MODE_TO_SHAPE_KEY[vimMode] ?? vimMode;
    return cursorShapesByMode[mapped] ?? 'block';
}

export function setCursorShapes(shapes: Record<string, string>): void {
    cursorShapesByMode = { ...shapes } as Record<string, CursorShape>;
}

const MODE_TO_SHAPE_KEY: Record<string, string> = {
    normal: 'normal',
    insert: 'insert',
    visual: 'visual',
    'visual line': 'visual',
    'visual block': 'visual',
    replace: 'replace',
    'operator-pending': 'operatorPending',
};
