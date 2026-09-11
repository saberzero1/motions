import {
    FileSystemAdapter,
    MarkdownView,
    Notice,
    type App,
    type EventRef,
} from 'obsidian';
import type { EditorView } from '@codemirror/view';
import {
    byteToUtf16,
    utf16ToByte,
    type ByteCol,
    type Utf16Col,
} from '../lua/coordinates';
import { runCleanups } from '../util/cleanup';
import { getEditorView } from '../util/editor';
import { NeovimFrontmatterFold } from './frontmatter-fold';
import type { MsgpackRpcClient } from './msgpack-rpc';

export function neovimByteToUtf16(text: string, column: number): number {
    return byteToUtf16(text, column as ByteCol);
}

export function utf16ToNeovimByte(text: string, column: number): number {
    return utf16ToByte(text, column as Utf16Col);
}

function changedSpan(
    previous: string,
    next: string,
): { from: number; to: number; insert: string } {
    const previousCharacters = Array.from(previous);
    const nextCharacters = Array.from(next);
    let prefix = 0;
    while (
        prefix < previousCharacters.length &&
        prefix < nextCharacters.length &&
        previousCharacters[prefix] === nextCharacters[prefix]
    )
        prefix++;
    let suffix = 0;
    while (
        suffix < previousCharacters.length - prefix &&
        suffix < nextCharacters.length - prefix &&
        previousCharacters[previousCharacters.length - suffix - 1] ===
            nextCharacters[nextCharacters.length - suffix - 1]
    )
        suffix++;
    const from = previousCharacters.slice(0, prefix).join('').length;
    const previousEnd = previousCharacters
        .slice(0, previousCharacters.length - suffix)
        .join('').length;
    const nextEnd = nextCharacters
        .slice(0, nextCharacters.length - suffix)
        .join('').length;
    return { from, to: previousEnd, insert: next.slice(from, nextEnd) };
}

export class NeovimDocumentSync {
    private mirror: string[] = [];
    private editorView: EditorView | null = null;
    private leafChangeRef: EventRef | null = null;
    private lineNotificationCleanup: (() => void) | null = null;
    private writeNotificationCleanup: (() => void) | null = null;
    private readNotificationCleanup: (() => void) | null = null;
    private activation = 0;
    private activationPromise: Promise<void> = Promise.resolve();
    private remirroring = false;
    private disposed = false;
    private failureReported = false;
    private buffer: number | null = null;
    private readonly frontmatterFold: NeovimFrontmatterFold;

    constructor(
        private readonly app: App,
        private readonly rpc: MsgpackRpcClient,
    ) {
        this.frontmatterFold = new NeovimFrontmatterFold(app, rpc);
    }

    async start(): Promise<void> {
        const buffer = await this.rpc.request('nvim_create_buf', [true, false]);
        if (typeof buffer !== 'number')
            throw new Error('Neovim returned an invalid buffer handle');
        this.buffer = buffer;
        await this.trackActivation();
        if (this.disposed) return;
        this.lineNotificationCleanup = this.rpc.onNotification(
            'nvim_buf_lines_event',
            (args) => this.handleLinesEvent(args),
        );
        this.writeNotificationCleanup = this.rpc.onNotification(
            'vim_motions_write',
            (args) => this.handleWriteRequest(args),
        );
        this.readNotificationCleanup = this.rpc.onNotification(
            'vim_motions_read',
            (args) => this.handleReadRequest(args),
        );
        this.remirroring = true;
        try {
            await this.rpc.request('nvim_buf_attach', [buffer, true, {}]);
        } finally {
            this.remirroring = false;
        }
        if (this.disposed) return;
        this.leafChangeRef = this.app.workspace.on('active-leaf-change', () => {
            void this.trackActivation().catch((error: unknown) =>
                this.reportFailure(error),
            );
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        ++this.activation;
        const leafChangeRef = this.leafChangeRef;
        const lineNotificationCleanup = this.lineNotificationCleanup;
        const writeNotificationCleanup = this.writeNotificationCleanup;
        const readNotificationCleanup = this.readNotificationCleanup;
        this.leafChangeRef = null;
        this.lineNotificationCleanup = null;
        this.writeNotificationCleanup = null;
        this.readNotificationCleanup = null;
        this.editorView = null;
        this.buffer = null;
        this.mirror = [];
        runCleanups(
            [
                () => lineNotificationCleanup?.(),
                () => writeNotificationCleanup?.(),
                () => readNotificationCleanup?.(),
                () => {
                    if (leafChangeRef) this.app.workspace.offref(leafChangeRef);
                },
            ],
            'Neovim document sync',
        );
    }

    getEditorView(): EditorView | null {
        return this.editorView;
    }

    getBuffer(): number | null {
        return this.buffer;
    }

    bufferPositionToOffset(row: number, byteColumn: number): number | null {
        const editorView = this.editorView;
        if (!editorView) return null;
        const lineNumber = Math.max(
            1,
            Math.min(Math.trunc(row) + 1, editorView.state.doc.lines),
        );
        const line = editorView.state.doc.line(lineNumber);
        const column = neovimByteToUtf16(line.text, byteColumn);
        return Math.min(line.from + column, line.to);
    }

    syncCursor(line: number, byteColumn: number): void {
        const editorView = this.editorView;
        if (!editorView) return;
        const lineNumber = Math.max(
            1,
            Math.min(Math.trunc(line), editorView.state.doc.lines),
        );
        const lineInfo = editorView.state.doc.line(lineNumber);
        const column = neovimByteToUtf16(lineInfo.text, byteColumn);
        editorView.dispatch({
            selection: {
                anchor: Math.min(lineInfo.from + column, lineInfo.to),
            },
            scrollIntoView: true,
        });
    }

    async waitForActivation(): Promise<void> {
        await this.activationPromise;
    }

    async prepareKeyInput(): Promise<void> {
        await this.frontmatterFold.sync();
    }

    private async activateDocument(): Promise<void> {
        const operation = ++this.activation;
        const buffer = this.buffer;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editorView = view ? getEditorView(view) : null;
        const file = view?.file;
        if (!editorView || !file || buffer === null || this.disposed) return;
        const lines = editorView.state.doc.toString().split('\n');
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter))
            throw new Error('Neovim document sync requires a filesystem vault');
        const name = adapter.getFullPath(file.path);
        this.editorView = editorView;
        this.mirror = lines;
        this.remirroring = true;
        try {
            await this.rpc.request('nvim_buf_set_name', [buffer, name]);
            await this.rpc.request('nvim_set_current_buf', [buffer]);
            await this.rpc.request('nvim_command', ['filetype detect']);
            await this.rpc.request('nvim_buf_set_lines', [
                buffer,
                0,
                -1,
                true,
                lines,
            ]);
            await this.rpc.request('nvim_set_option_value', [
                'buftype',
                'acwrite',
                { buf: buffer },
            ]);
            await this.rpc.request('nvim_set_option_value', [
                'modified',
                false,
                { buf: buffer },
            ]);
            await this.frontmatterFold.sync();
        } finally {
            this.remirroring = false;
        }
        if (operation !== this.activation || this.disposed) return;
        this.editorView = editorView;
        this.mirror = lines;
    }

    private trackActivation(): Promise<void> {
        const activation = this.activateDocument();
        this.activationPromise = activation;
        return activation;
    }

    private handleLinesEvent(args: unknown[]): void {
        if (this.disposed || this.remirroring) return;
        const first = args[2];
        const last = args[3];
        const data = args[4];
        if (
            typeof first !== 'number' ||
            typeof last !== 'number' ||
            !Array.isArray(data) ||
            !data.every((line) => typeof line === 'string')
        )
            return;
        try {
            this.applyLines(first, last, data);
        } catch (error) {
            this.reportFailure(error);
        }
    }

    private handleWriteRequest(args: unknown[]): void {
        if (this.disposed || args[0] !== this.buffer || !this.editorView)
            return;
        this.app.commands.executeCommandById('editor:save-file');
    }

    private handleReadRequest(args: unknown[]): void {
        if (this.disposed || args[0] !== this.buffer) return;
        void this.trackActivation().catch((error: unknown) =>
            this.reportFailure(error),
        );
    }

    private applyLines(first: number, last: number, data: string[]): void {
        const editorView = this.editorView;
        if (!editorView) return;
        const doc = editorView.state.doc;
        const previousLine = this.mirror[first];
        const replaced = last === -1 ? this.mirror.length : last - first;
        this.mirror.splice(first, replaced, ...data);

        let from: number;
        let to: number;
        let insert: string;
        if (
            last === first + 1 &&
            data.length === 1 &&
            previousLine !== undefined &&
            first < doc.lines
        ) {
            const line = doc.line(first + 1);
            const change = changedSpan(previousLine, data[0]!);
            from = line.from + change.from;
            to = line.from + change.to;
            insert = change.insert;
        } else if (first === last) {
            if (first === doc.lines) {
                from = doc.length;
                to = doc.length;
                insert = `\n${data.join('\n')}`;
            } else {
                from = doc.line(first + 1).from;
                to = from;
                insert = `${data.join('\n')}\n`;
            }
        } else if (first === 0 && (last === doc.lines || last === -1)) {
            from = 0;
            to = doc.length;
            insert = data.join('\n');
        } else if (last === doc.lines || last === -1) {
            from = doc.line(first).to;
            to = doc.length;
            insert = data.length > 0 ? `\n${data.join('\n')}` : '';
        } else {
            from = doc.line(first + 1).from;
            to = doc.line(last + 1).from;
            insert = data.length > 0 ? `${data.join('\n')}\n` : '';
        }
        if (from !== to || insert.length > 0)
            editorView.dispatch({ changes: { from, to, insert } });
        if (editorView.state.doc.toString() !== this.mirror.join('\n'))
            throw new Error('Neovim line event produced a divergent document');
    }

    private reportFailure(error: unknown): void {
        if (this.failureReported || this.disposed) return;
        this.failureReported = true;
        const message = error instanceof Error ? error.message : String(error);
        new Notice(
            `Vim Motions: Neovim text synchronisation failed: ${message}`,
        );
    }
}
