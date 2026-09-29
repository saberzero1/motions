import {
    FileSystemAdapter,
    MarkdownView,
    Notice,
    type App,
    type EventRef,
} from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import {
    byteToUtf16,
    utf16ToByte,
    type ByteCol,
    type Utf16Col,
} from '../lua/coordinates';
import { runCleanups } from '../util/cleanup';
import { getEditorView } from '../util/editor';
import { showYankHighlight } from '../vim/yank-highlight';
import { NeovimFrontmatterFold } from './frontmatter-fold';
import type { MsgpackRpcClient } from './msgpack-rpc';
import { setVisualSelection, type VisualRange } from './visual-selection';

export interface NeovimEditorOptions {
    textwidth: number;
    listContinuation: boolean;
    indent: { useTab: boolean; tabSize: number };
    yankHighlight: { mode: 'off' | 'solid' | 'fade'; duration: number };
}

// Numbered lists are out of reach here: `comments` cannot increment a counter.
const APPLY_EDITOR_OPTIONS_LUA = `
local buf, textwidth, listContinuation, yankHighlight, useTab, tabSize = ...
vim.api.nvim_set_option_value('textwidth', textwidth, { buf = buf })
-- Vim rebuilds a continued or reindented line's indent from its column count
-- rather than copying the original bytes, so these decide the style Obsidian
-- gets back. The Markdown ftplugin sets expandtab, which silently converts a
-- tab-indented vault to spaces on every o/O.
vim.api.nvim_set_option_value('expandtab', not useTab, { buf = buf })
vim.api.nvim_set_option_value('tabstop', tabSize, { buf = buf })
vim.api.nvim_set_option_value('shiftwidth', tabSize, { buf = buf })
vim.api.nvim_set_option_value('softtabstop', tabSize, { buf = buf })
-- Derive from the ftplugin's values, captured once, so that turning the
-- setting off restores them and turning it on repeatedly cannot accumulate.
if vim.b[buf].vim_motions_stock_comments == nil then
    vim.b[buf].vim_motions_stock_comments =
        vim.api.nvim_get_option_value('comments', { buf = buf })
    vim.b[buf].vim_motions_stock_formatoptions =
        vim.api.nvim_get_option_value('formatoptions', { buf = buf })
end
local stock_comments = vim.b[buf].vim_motions_stock_comments
vim.api.nvim_set_option_value('comments', stock_comments, { buf = buf })
vim.api.nvim_set_option_value(
    'formatoptions', vim.b[buf].vim_motions_stock_formatoptions, { buf = buf })
pcall(vim.keymap.del, 'n', 'o', { buffer = buf })
pcall(vim.keymap.del, 'n', 'O', { buffer = buf })
if listContinuation then
    local formatoptions = vim.b[buf].vim_motions_stock_formatoptions
    for flag in ('ro'):gmatch('.') do
        if not formatoptions:find(flag, 1, true) then
            formatoptions = formatoptions .. flag
        end
    end
    vim.api.nvim_set_option_value('formatoptions', formatoptions, { buf = buf })
    -- 'comments' decides both what o continues and how gq wraps a list, and
    -- the ftplugin's f flag is what separates them: it gives gq its hanging
    -- indent while stopping o repeating the marker. Dropping f outright makes
    -- gq re-bullet every wrapped line, so the continuation form is swapped in
    -- only for the duration of an o/O insert. The mapping is expr and returns
    -- the key, so count, undo and dot-repeat stay native.
    for _, key in ipairs({ 'o', 'O' }) do
        vim.keymap.set('n', key, function()
            vim.api.nvim_set_option_value(
                'comments', 'b:-,b:*,b:+,n:>', { buf = buf })
            vim.api.nvim_create_autocmd('InsertLeave', {
                buffer = buf,
                once = true,
                callback = function()
                    vim.api.nvim_set_option_value(
                        'comments', stock_comments, { buf = buf })
                end,
            })
            return key
        end, { buffer = buf, expr = true })
    end
end
local group = vim.api.nvim_create_augroup('vim_motions_rpc_yank', { clear = false })
vim.api.nvim_clear_autocmds({ group = group, buffer = buf })
if yankHighlight then
    vim.api.nvim_create_autocmd('TextYankPost', {
        group = group,
        buffer = buf,
        callback = function()
            local event = vim.v.event or {}
            if event.operator ~= 'y' then return end
            vim.rpcnotify(
                0,
                'vim_motions_yank',
                buf,
                vim.api.nvim_buf_get_mark(buf, '['),
                vim.api.nvim_buf_get_mark(buf, ']'),
                event.regtype or 'v')
        end,
    })
end
`;

// Undo history belongs to the buffer, and one buffer mirrors every note, so a
// plain nvim_buf_set_lines leaves the previous note's history reachable from
// the next one. Undo is not merely wrong there, it destroys data: the oldest
// entry is the buffer's original empty state, so `u` on a freshly opened note
// empties it, the line events mirror that into CM6, and Obsidian autosaves it.
// Reseeding at undolevels = -1 discards the history instead. Reading the option
// yields -123456 ("use the global value") when no buffer-local value is set, so
// saving and restoring it does not pin a local value.
// One buffer mirrors every note, renamed in place, which breaks two things a
// language server depends on. It is still attached to the previous note's URI,
// so without an explicit detach it goes on attributing edits to that note; and
// `vim.lsp.enable()` attaches on FileType but skips a buffer whose 'buftype' is
// already set, so after the first activation left it `acwrite` no later
// activation could ever attach one. Detaching here closes the old document, and
// clearing 'buftype' makes each activation look like the first to Neovim's own
// attach rule; the caller restores `acwrite` once the content is in place.
//
// The mirror carries the note's absolute path and is permanently modified, so
// Neovim would give it a swap file like any other named buffer -- one per note
// visited, because the buffer is renamed rather than reopened. Disconnect
// sends SIGTERM, and Neovim's signal handler *preserves* swap files rather
// than deleting them, so they are left behind by design; the next session
// names the same buffer and gets E325, a blocking prompt that an embedded
// Neovim cannot answer, so activation never completes and RPC fails to
// connect. Obsidian owns saving and undo here, which is what a swap file would
// be protecting, so the mirror opts out. This is buffer-local on purpose: the
// user's own buffers keep whatever their config asked for. Issue #199.
const PREPARE_ACTIVATION_LUA = `
local buf = ...
for _, client in ipairs(vim.lsp.get_clients({ bufnr = buf })) do
    pcall(vim.lsp.buf_detach_client, buf, client.id)
end
vim.bo[buf].swapfile = false
vim.bo[buf].buftype = ''
`;

const RESEED_BUFFER_LUA = `
local buf, lines = ...
local undolevels = vim.bo[buf].undolevels
vim.bo[buf].undolevels = -1
vim.api.nvim_buf_set_lines(buf, 0, -1, true, lines)
vim.bo[buf].undolevels = undolevels
`;

export function neovimByteToUtf16(text: string, column: number): number {
    return byteToUtf16(text, column as ByteCol);
}

export function utf16ToNeovimByte(text: string, column: number): number {
    return utf16ToByte(text, column as Utf16Col);
}

export type VisualKind = 'char' | 'line' | 'block';

function clampLine(doc: Text, line: number): number {
    return Math.max(1, Math.min(Math.trunc(line), doc.lines));
}

function charLength(doc: Text, offset: number): number {
    if (offset >= doc.length) return 0;
    const codePoint = doc
        .sliceString(offset, Math.min(doc.length, offset + 2))
        .codePointAt(0);
    return codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
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
    private cursorNotificationCleanup: (() => void) | null = null;
    private yankNotificationCleanup: (() => void) | null = null;
    private activation = 0;
    private activationPromise: Promise<void> = Promise.resolve();
    private remirroring = false;
    private disposed = false;
    private failureReported = false;
    private buffer: number | null = null;
    private mirrorObserver: (() => void) | null = null;
    private visualShown = false;
    private readonly frontmatterFold: NeovimFrontmatterFold;

    constructor(
        private readonly app: App,
        private readonly rpc: MsgpackRpcClient,
        private editorOptions: NeovimEditorOptions,
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
        this.cursorNotificationCleanup = this.rpc.onNotification(
            'vim_motions_cursor',
            (args) => this.handleCursorNotification(args),
        );
        this.yankNotificationCleanup = this.rpc.onNotification(
            'vim_motions_yank',
            (args) => this.handleYankNotification(args),
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
        const cursorNotificationCleanup = this.cursorNotificationCleanup;
        const yankNotificationCleanup = this.yankNotificationCleanup;
        this.yankNotificationCleanup = null;
        this.leafChangeRef = null;
        this.lineNotificationCleanup = null;
        this.writeNotificationCleanup = null;
        this.readNotificationCleanup = null;
        this.cursorNotificationCleanup = null;
        this.editorView = null;
        this.buffer = null;
        this.mirror = [];
        runCleanups(
            [
                () => lineNotificationCleanup?.(),
                () => writeNotificationCleanup?.(),
                () => readNotificationCleanup?.(),
                () => cursorNotificationCleanup?.(),
                () => yankNotificationCleanup?.(),
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

    /**
     * Notified once CM6 holds Neovim's text and cursor. Overlays that anchor to
     * the cursor cannot use the redraw event that spawned them, because that
     * event and these notifications share one unordered stream.
     */
    setMirrorObserver(observer: (() => void) | null): void {
        this.mirrorObserver = observer;
    }

    async setEditorOptions(options: NeovimEditorOptions): Promise<void> {
        this.editorOptions = options;
        await this.applyEditorOptions();
    }

    private async applyEditorOptions(): Promise<void> {
        const buffer = this.buffer;
        if (buffer === null || this.disposed) return;
        const { textwidth, listContinuation, indent, yankHighlight } =
            this.editorOptions;
        await this.rpc.request('nvim_exec_lua', [
            APPLY_EDITOR_OPTIONS_LUA,
            [
                buffer,
                textwidth,
                listContinuation,
                yankHighlight.mode !== 'off',
                indent.useTab,
                indent.tabSize,
            ],
        ]);
    }

    // Neovim reports the yanked region and Obsidian renders it with the same
    // component bundled-fork mode uses. Routing it through an extmark instead
    // looks simpler and does not work: a yank changes no text, so the
    // decoration provider never re-runs and the mark reaches CM6 only on some
    // later redraw -- long after the highlight was due to expire. That path
    // also cannot express the 'fade' mode, which is a CSS animation.
    private handleYankNotification(args: unknown[]): void {
        const [buffer, start, end, regtype] = args;
        if (buffer !== this.buffer || this.disposed) return;
        const { mode, duration } = this.editorOptions.yankHighlight;
        const editorView = this.editorView;
        if (mode === 'off' || !editorView) return;
        if (!Array.isArray(start) || !Array.isArray(end)) return;
        if (regtype === '\x16') return;
        const from = this.bufferPositionToOffset(
            Number(start[0]) - 1,
            Number(start[1]),
        );
        const lastCharacter = this.bufferPositionToOffset(
            Number(end[0]) - 1,
            Number(end[1]),
        );
        if (from === null || lastCharacter === null) return;
        const document = editorView.state.doc;
        const to =
            regtype === 'V'
                ? document.lineAt(lastCharacter).to
                : Math.min(
                      document.length,
                      lastCharacter +
                          ([
                              ...document.sliceString(
                                  lastCharacter,
                                  Math.min(document.length, lastCharacter + 2),
                              ),
                          ][0]?.length ?? 0),
                  );
        if (from >= to) return;
        showYankHighlight(editorView, [{ from, to }], duration, mode);
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

    /**
     * Mirrors Neovim's visual selection.
     *
     * Neovim's charwise and linewise selections include the character under the
     * head; a CM6 range does not include its `to`, so the end that carries the
     * cursor is extended by one character. Extending by a fixed 1 would split a
     * surrogate pair, so the extension measures the code point.
     *
     * Blockwise selections become one range per row, which is what CM6 can
     * represent. The columns are byte offsets rather than display cells, so a
     * block over rows of differing width is approximate in the same way the
     * rest of the bridge's cell mapping is.
     */
    syncSelection(
        anchor: [number, number],
        head: [number, number],
        kind: VisualKind,
    ): void {
        const editorView = this.editorView;
        if (!editorView) return;
        const ranges = this.visualRanges(editorView, anchor, head, kind);
        this.visualShown = ranges.length > 0;
        this.dispatchCursor(editorView, head[0], head[1], ranges);
    }

    private visualRanges(
        editorView: EditorView,
        anchor: [number, number],
        head: [number, number],
        kind: VisualKind,
    ): VisualRange[] {
        const doc = editorView.state.doc;
        if (kind === 'line') {
            const first = doc.line(
                clampLine(doc, Math.min(anchor[0], head[0])),
            );
            const last = doc.line(clampLine(doc, Math.max(anchor[0], head[0])));
            return [{ from: first.from, to: last.to }];
        }
        if (kind === 'block') {
            const ranges: VisualRange[] = [];
            const firstRow = Math.min(anchor[0], head[0]);
            const lastRow = Math.max(anchor[0], head[0]);
            for (let row = firstRow; row <= lastRow; row += 1) {
                const left = this.bufferPositionToOffset(row - 1, anchor[1]);
                const right = this.bufferPositionToOffset(row - 1, head[1]);
                if (left === null || right === null) continue;
                const lineEnd = doc.line(clampLine(doc, row)).to;
                const trailing = Math.max(left, right);
                ranges.push({
                    from: Math.min(left, right),
                    to: Math.min(lineEnd, trailing + charLength(doc, trailing)),
                });
            }
            return ranges;
        }
        const anchorOffset = this.bufferPositionToOffset(
            anchor[0] - 1,
            anchor[1],
        );
        const headOffset = this.bufferPositionToOffset(head[0] - 1, head[1]);
        if (anchorOffset === null || headOffset === null) return [];
        const trailing = Math.max(anchorOffset, headOffset);
        return [
            {
                from: Math.min(anchorOffset, headOffset),
                to: trailing + charLength(doc, trailing),
            },
        ];
    }

    syncCursor(line: number, byteColumn: number): void {
        const editorView = this.editorView;
        if (!editorView) return;
        const clearing = this.visualShown;
        this.visualShown = false;
        this.dispatchCursor(editorView, line, byteColumn, clearing ? [] : null);
    }

    private dispatchCursor(
        editorView: EditorView,
        line: number,
        byteColumn: number,
        ranges: VisualRange[] | null,
    ): void {
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
            effects: ranges === null ? [] : [setVisualSelection.of(ranges)],
            scrollIntoView: true,
        });
        this.mirrorObserver?.();
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
            await this.rpc.request('nvim_exec_lua', [
                PREPARE_ACTIVATION_LUA,
                [buffer],
            ]);
            await this.rpc.request('nvim_buf_set_name', [buffer, name]);
            await this.rpc.request('nvim_set_current_buf', [buffer]);
            await this.rpc.request('nvim_command', ['filetype detect']);
            await this.rpc.request('nvim_exec_lua', [
                RESEED_BUFFER_LUA,
                [buffer, lines],
            ]);
            await this.rpc.request('nvim_set_option_value', [
                'buftype',
                'acwrite',
                { buf: buffer },
            ]);
            await this.applyEditorOptions();
            await this.rpc.request('nvim_set_option_value', [
                'modified',
                false,
                { buf: buffer },
            ]);
            await this.frontmatterFold.syncForActivation();
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

    private handleCursorNotification(args: unknown[]): void {
        if (
            this.disposed ||
            args[0] !== this.buffer ||
            typeof args[1] !== 'number' ||
            typeof args[2] !== 'number'
        )
            return;
        this.syncCursor(args[1], args[2]);
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
        this.mirrorObserver?.();
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
