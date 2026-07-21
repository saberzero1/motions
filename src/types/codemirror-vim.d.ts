declare module '@replit/codemirror-vim' {
    import type { Extension, StateField } from '@codemirror/state';
    import type { EditorView } from '@codemirror/view';

    export type CursorShape = 'block' | 'bar' | 'underline' | 'hollow';

    export interface CursorShapeConfig {
        normal?: CursorShape;
        insert?: CursorShape;
        visual?: CursorShape;
        replace?: CursorShape;
        operatorPending?: CursorShape;
    }

    interface CodeMirror {
        state: { vim: Record<string, unknown> };
        getCursor(type?: string): { line: number; ch: number };
        getValue(): string;
        setValue(value: string): void;
        [key: string]: unknown;
    }

    export function vim(options?: {
        status?: boolean;
        cursorShapes?: CursorShapeConfig;
    }): Extension;
    export function getCM(view: EditorView): CodeMirror | null;
    export function setLivePreviewField(field: StateField<boolean>): void;
    export function setCursorSuppressed(suppressed: boolean): void;
    export const Vim: Record<string, unknown>;
}
