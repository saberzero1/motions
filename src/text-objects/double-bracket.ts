import type { MotionFn } from '../types/vim-api';
import { createAsymmetricPairTextObject } from './pair-util';

export function createDoubleBracketInner(scanLimit: number): MotionFn {
    return createAsymmetricPairTextObject('[[', ']]', true, true, scanLimit);
}

export function createDoubleBracketAround(scanLimit: number): MotionFn {
    return createAsymmetricPairTextObject('[[', ']]', true, false, scanLimit);
}
