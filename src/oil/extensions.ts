import {
    Decoration,
    type DecorationSet,
    EditorView,
    WidgetType,
} from '@codemirror/view';
import { StateField, type Extension, type Range, type Text } from '@codemirror/state';

const OIL_LINE_RE = /^\/\d+\s+([df])\s/;

class OilIconWidget extends WidgetType {
    constructor(private readonly entryType: string) {
        super();
    }

    toDOM(): HTMLElement {
        const span = createSpan();
        span.className = 'vim-motions-oil-icon';
        span.textContent = this.entryType === 'd' ? '📁 ' : '📄 ';
        span.setAttribute('aria-hidden', 'true');
        return span;
    }

    eq(other: OilIconWidget): boolean {
        return this.entryType === other.entryType;
    }
}

function buildOilDecorations(doc: Text): DecorationSet {
    const decorations: Range<Decoration>[] = [];

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const match = line.text.match(OIL_LINE_RE);
        if (!match || !match[1]) continue;

        const prefixEnd = line.from + match[0].length;
        decorations.push(
            Decoration.replace({
                widget: new OilIconWidget(match[1]),
            }).range(line.from, prefixEnd),
        );
    }

    return Decoration.set(decorations, true);
}

const oilConcealField = StateField.define<DecorationSet>({
    create(state) {
        return buildOilDecorations(state.doc);
    },
    update(prev, tr) {
        if (tr.docChanged) {
            return buildOilDecorations(tr.state.doc);
        }
        return prev;
    },
    provide: (f) => EditorView.decorations.from(f),
});

export function oilConcealExtension(): Extension {
    return oilConcealField;
}
