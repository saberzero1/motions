import type { EditorView } from '@codemirror/view';

/** An image embed's source range, as Obsidian's Live Preview tracks it. */
export interface ImageRange {
    start: number;
    end: number;
}

export type ImageAction = 'grow' | 'shrink' | 'reset' | 'edit';

/**
 * The image half of the Live Preview controller Obsidian 1.13 added. Its own
 * Vim adapter calls these for `h`/`l` and `:image`; the plugin's engine
 * replaces that adapter, so they are reached the way the adapter reaches
 * them, through its class's `livePreview` getter.
 */
export interface ImageController {
    /**
     * The selected image's widget. Not `selectedRange`: a range can outlive
     * its image, measured after the whole note was replaced, and resizing it
     * then did nothing without saying so.
     */
    readonly selectedImage: ImageRange | null;
    /** Selects the image the cursor is beside, or leaves the selected one. */
    enterOrExitImage(forward: boolean): boolean;
    resizeSelectedImage(direction: 'grow' | 'shrink', count: number): boolean;
    resetSelectedImageSize(): boolean;
    editSelectedImageUrl(): boolean;
    imageWidgetAt(
        pos: number,
        accept: (widget: ImageRange) => boolean,
    ): ImageRange | null;
    selectImage(widget: ImageRange): void;
}

const CONTROLLER_METHODS = [
    'enterOrExitImage',
    'resizeSelectedImage',
    'resetSelectedImageSize',
    'editSelectedImageUrl',
    'imageWidgetAt',
    'selectImage',
] as const;

/** Null before Obsidian 1.13, which has no image selection. */
export function getImageController(view: EditorView): ImageController | null {
    const adapter = (
        window as unknown as { CodeMirrorAdapter?: { prototype?: object } }
    ).CodeMirrorAdapter;
    const prototype = adapter?.prototype;
    if (!prototype) return null;
    let controller: unknown;
    try {
        // The getter reads only `this.cm6`.
        controller = Reflect.get(prototype, 'livePreview', { cm6: view });
    } catch {
        return null;
    }
    if (!controller || typeof controller !== 'object') return null;
    const record = controller as Record<string, unknown>;
    return CONTROLLER_METHODS.every(
        (name) => typeof record[name] === 'function',
    )
        ? (controller as ImageController)
        : null;
}

/**
 * Runs an `:image` action and reports whether it changed the document.
 *
 * Obsidian's command acts only on a selected image and otherwise does
 * nothing. With no image selected this selects the one under the cursor
 * first: the Neovim backend cannot select with `h`/`l`, and a command that
 * silently does nothing is worse than one that names what it needs.
 */
export function runImageAction(
    view: EditorView,
    action: ImageAction,
    count: number,
): boolean {
    const controller = getImageController(view);
    if (!controller) throw new Error(':image needs Obsidian 1.13 or later');
    if (!controller.selectedImage) {
        const head = view.state.selection.main.head;
        const widget = controller.imageWidgetAt(
            head,
            (candidate) => candidate.start <= head && head <= candidate.end,
        );
        if (!widget) throw new Error('No image at the cursor');
        controller.selectImage(widget);
    }
    const before = view.state.doc;
    switch (action) {
        case 'grow':
        case 'shrink':
            controller.resizeSelectedImage(action, count);
            break;
        case 'reset':
            controller.resetSelectedImageSize();
            break;
        case 'edit':
            controller.editSelectedImageUrl();
            break;
    }
    return view.state.doc !== before;
}
