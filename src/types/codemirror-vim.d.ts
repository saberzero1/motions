declare module '@replit/codemirror-vim' {
    import type { Extension } from '@codemirror/state';
    import type { EditorView } from '@codemirror/view';

    interface CodeMirror {
        state: { vim: Record<string, unknown> };
        getCursor(type?: string): { line: number; ch: number };
        getValue(): string;
        setValue(value: string): void;
        [key: string]: unknown;
    }

    export function vim(options?: { status?: boolean }): Extension;
    export function getCM(view: EditorView): CodeMirror | null;
    export const Vim: Record<string, unknown>;
}
