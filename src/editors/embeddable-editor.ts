/**
 * Reusable embeddable Markdown editor.
 *
 * Extracts Obsidian's internal ScrollableMarkdownEditor prototype via
 * app.embedRegistry and exposes a lightweight editor mountable in any
 * DOM container with full CM6 + vim support.
 *
 * Based on mgmeyers' technique (obsidian-kanban) and Fevol's
 * EmbeddableMarkdownEditor generalization.
 */

import { App, Scope } from 'obsidian';
import { EditorSelection, type Extension } from '@codemirror/state';
import {
    EditorView,
    keymap,
    placeholder,
    type ViewUpdate,
} from '@codemirror/view';
import { around } from '../util/around';
import { pushKeymapScope, popKeymapScope } from '../util/keymap';
import { isVimEnabled } from '../vim/vim-api';
import {
    createBundledVimExtension,
    isBundledVimActive,
} from '../vim/bundled-vim';
import type { CursorShapes } from '../settings';

// -- Obsidian internal types (undocumented, used by embedRegistry) --

interface ScrollableMarkdownEditorCtor {
    new (
        app: App,
        containerEl: HTMLElement,
        owner: Record<string, unknown>,
    ): ScrollableMarkdownEditorInstance;
}

interface ScrollableMarkdownEditorInstance {
    editor: { cm: EditorView };
    cm: EditorView;
    containerEl: HTMLElement;
    editorEl: HTMLElement;
    owner: Record<string, unknown>;
    activeCM: EditorView;
    _loaded: boolean;

    set(value: string): void;
    onUpdate(update: ViewUpdate, changed: boolean): void;
    buildLocalExtensions(): Extension[];
    destroy(): void;
    load(): void;
    unload(): void;
    register(cb: () => void): void;
}

interface WidgetEditorView {
    editable: boolean;
    showEditor(): void;
    editMode?: { constructor: ScrollableMarkdownEditorCtor } | null;
    unload(): void;
}

// -- Prototype resolution --

let resolvedCtor: ScrollableMarkdownEditorCtor | null = null;

/**
 * Extract and cache the ScrollableMarkdownEditor constructor from
 * Obsidian's embed registry.
 *
 * @throws If app.embedRegistry is unavailable or the prototype chain
 *   doesn't match (Obsidian version incompatibility).
 */
export function resolveEditorPrototype(app: App): ScrollableMarkdownEditorCtor {
    if (resolvedCtor) return resolvedCtor;

    const registry = (app as unknown as Record<string, unknown>)
        .embedRegistry as
        | { embedByExtension: { md: (...args: unknown[]) => WidgetEditorView } }
        | undefined;

    if (!registry?.embedByExtension?.md) {
        throw new Error(
            '[Vim Motions] Cannot resolve editor prototype: ' +
                'app.embedRegistry.embedByExtension.md is unavailable. ' +
                `Obsidian version: ${(app as unknown as Record<string, string>).version ?? 'unknown'}.`,
        );
    }

    const widgetEditorView = registry.embedByExtension.md(
        { app, containerEl: createDiv() },
        null,
        '',
    );

    widgetEditorView.editable = true;
    widgetEditorView.showEditor();

    const editMode = widgetEditorView.editMode;
    if (!editMode) {
        widgetEditorView.unload();
        throw new Error(
            '[Vim Motions] Cannot resolve editor prototype: ' +
                'editMode is null after showEditor(). ' +
                `Obsidian version: ${(app as unknown as Record<string, string>).version ?? 'unknown'}.`,
        );
    }

    const proto = Object.getPrototypeOf(Object.getPrototypeOf(editMode)) as {
        constructor: ScrollableMarkdownEditorCtor;
    };
    resolvedCtor = proto.constructor;
    widgetEditorView.unload();
    return resolvedCtor;
}

export function resetEditorPrototype(): void {
    resolvedCtor = null;
}

// -- Options --

export interface EmbeddableEditorOptions {
    value?: string;
    cls?: string;
    placeholder?: string;
    /** Additional CM6 extensions (e.g. oilConcealExtension). */
    extensions?: Extension[];
    cursorShapes?: CursorShapes;
    cursorLocation?: { anchor: number; head: number };
    /**
     * When true, the editor will NOT set `workspace.activeEditor` on
     * focus or clear it on destroy.  Use for lightweight overlays
     * (textarea replacements) that should not interfere with
     * Obsidian's editor tracking.
     */
    skipActiveEditor?: boolean;

    onEnter?: (
        editor: EmbeddableMarkdownEditor,
        mod: boolean,
        shift: boolean,
    ) => boolean;
    onEscape?: (editor: EmbeddableMarkdownEditor) => void;
    onSubmit?: (editor: EmbeddableMarkdownEditor) => void;
    onBlur?: (editor: EmbeddableMarkdownEditor) => void;
    onPaste?: (e: ClipboardEvent, editor: EmbeddableMarkdownEditor) => void;
    onChange?: (update: ViewUpdate) => void;
}

const noop = () => {};
const noopFalse = () => false;

const defaultOptions: Required<EmbeddableEditorOptions> = {
    value: '',
    cls: '',
    placeholder: '',
    extensions: [],
    cursorShapes: undefined!,
    cursorLocation: { anchor: 0, head: 0 },
    skipActiveEditor: false,
    onEnter: noopFalse,
    onEscape: noop,
    onSubmit: noop,
    onBlur: noop,
    onPaste: noop,
    onChange: noop,
};

// -- Public type --

export interface EmbeddableMarkdownEditor {
    readonly initialValue: string;
    getValue(): string;
    setValue(content: string): void;
    getEditorView(): EditorView;
    focus(): void;

    _loaded: boolean;
    load(): void;
    unload(): void;
    destroy(): void;

    editor: { cm: EditorView };
    containerEl: HTMLElement;
    editorEl: HTMLElement;
    owner: Record<string, unknown>;
}

// -- Factory --

let CachedEditorClass:
    | (new (
          app: App,
          container: HTMLElement,
          options?: Partial<EmbeddableEditorOptions>,
      ) => EmbeddableMarkdownEditor)
    | null = null;

/**
 * Create an EmbeddableMarkdownEditor instance.
 *
 * Resolves and caches the editor prototype on first call.
 * Mount via `parentComponent.addChild(editor)`.
 */
export function createEmbeddableEditor(
    app: App,
    container: HTMLElement,
    options?: Partial<EmbeddableEditorOptions>,
): EmbeddableMarkdownEditor {
    if (!CachedEditorClass) {
        CachedEditorClass = buildEditorClass(app);
    }
    return new CachedEditorClass(app, container, options);
}

function buildEditorClass(
    app: App,
): new (
    app: App,
    container: HTMLElement,
    options?: Partial<EmbeddableEditorOptions>,
) => EmbeddableMarkdownEditor {
    const BaseCtor = resolveEditorPrototype(app);

    const builtinVimOn = isVimEnabled(app);

    class ConcreteEmbeddableEditor extends (BaseCtor as unknown as {
        new (...args: unknown[]): ScrollableMarkdownEditorInstance;
    }) {
        _opts: Required<EmbeddableEditorOptions>;
        _scope: Scope;
        _app: App;
        initialValue: string;

        constructor(
            editorApp: App,
            container: HTMLElement,
            options?: Partial<EmbeddableEditorOptions>,
        ) {
            const opts: Required<EmbeddableEditorOptions> = {
                ...defaultOptions,
                ...options,
            };

            super(editorApp, container, {
                app: editorApp,
                onMarkdownScroll: noop,
                getMode: () => 'source',
            });

            this._app = editorApp;
            this._opts = opts;
            this.initialValue = opts.value;
            this._scope = new Scope(
                (editorApp as unknown as { scope: Scope }).scope,
            );

            this._scope.register(['Mod'], 'Enter', () => true);

            // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed for closure capture in event listeners
            const self = this;
            this.owner.editMode = self;
            this.owner.editor = self.editor;

            this.set(opts.value);

            this.register(
                around(
                    editorApp.workspace as unknown as Record<
                        string,
                        (...args: unknown[]) => unknown
                    >,
                    {
                        setActiveLeaf:
                            (oldMethod) =>
                            (...args: unknown[]) => {
                                if (!self.activeCM?.hasFocus) {
                                    oldMethod.apply(editorApp.workspace, args);
                                }
                            },
                    },
                ),
            );

            this.editor.cm.contentDOM.addEventListener('focusin', () => {
                pushKeymapScope(editorApp, self._scope);
                if (!opts.skipActiveEditor) {
                    (
                        editorApp.workspace as unknown as {
                            activeEditor: unknown;
                        }
                    ).activeEditor = self.owner;
                }
            });

            this.editor.cm.contentDOM.addEventListener('blur', () => {
                popKeymapScope(editorApp, self._scope);
                if (self._loaded && opts.onBlur !== noop) {
                    opts.onBlur(self);
                }
            });

            if (opts.cls) {
                this.editorEl.classList.add(opts.cls);
            }

            if (opts.cursorLocation) {
                this.editor.cm.dispatch({
                    selection: EditorSelection.range(
                        opts.cursorLocation.anchor,
                        opts.cursorLocation.head,
                    ),
                });
            }
        }

        buildLocalExtensions(): Extension[] {
            const extensions = super.buildLocalExtensions();

            if (!builtinVimOn && isBundledVimActive()) {
                extensions.push(
                    createBundledVimExtension(this._opts.cursorShapes),
                );
            }

            if (this._opts.extensions.length > 0) {
                extensions.push(...this._opts.extensions);
            }

            if (this._opts.placeholder) {
                extensions.push(placeholder(this._opts.placeholder));
            }

            extensions.push(
                EditorView.domEventHandlers({
                    paste: (event) => {
                        this._opts.onPaste(event, this);
                    },
                }),
            );

            extensions.push(
                keymap.of([
                    {
                        key: 'Enter',
                        run: () => this._opts.onEnter(this, false, false),
                        shift: () => this._opts.onEnter(this, false, true),
                    },
                    {
                        key: 'Mod-Enter',
                        run: () => this._opts.onEnter(this, true, false),
                        shift: () => this._opts.onEnter(this, true, true),
                    },
                    {
                        key: 'Escape',
                        run: () => {
                            this._opts.onEscape(this);
                            return true;
                        },
                        preventDefault: true,
                    },
                ]),
            );

            return extensions;
        }

        onUpdate(update: ViewUpdate, changed: boolean): void {
            super.onUpdate(update, changed);
            if (changed) {
                this._opts.onChange(update);
            }
        }

        destroy(): void {
            if (this._loaded) this.unload();
            popKeymapScope(this._app, this._scope);
            if (!this._opts.skipActiveEditor) {
                (
                    this._app.workspace as unknown as { activeEditor: unknown }
                ).activeEditor = null;
            }
            this.containerEl.empty();
            super.destroy();
        }

        getValue(): string {
            return this.editor.cm.state.doc.toString();
        }

        setValue(content: string): void {
            this.set(content);
        }

        getEditorView(): EditorView {
            return this.editor.cm;
        }

        focus(): void {
            this.editor.cm.focus();
        }
    }

    return ConcreteEmbeddableEditor;
}
