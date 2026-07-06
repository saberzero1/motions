export interface HighlightAttrs {
    fg?: string;
    bg?: string;
    sp?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    undercurl?: boolean;
    underdouble?: boolean;
    underdotted?: boolean;
    underdashed?: boolean;
    strikethrough?: boolean;
    reverse?: boolean;
    blend?: number;
    link?: string;
    default?: boolean;
    update?: boolean;
}

export class HighlightManager {
    private groups = new Map<string, HighlightAttrs>();
    private styleEl: HTMLStyleElement | null = null;
    private doc: Document | null = null;

    private static readonly PLUGIN_GROUPS: Record<string, string> = {
        EasyMotionTarget: '--vim-motions-em',
        EasyMotionShade: '--vim-motions-em-shade',
        HintTarget: '--vim-motions-hint',
        StatusLineNormal: '--vim-pl-normal',
        StatusLineInsert: '--vim-pl-insert',
        StatusLineVisual: '--vim-pl-visual',
        StatusLineReplace: '--vim-pl-replace',
        StatusLineVLine: '--vim-pl-v-line',
        StatusLineVBlock: '--vim-pl-v-block',
        StatusLineCommand: '--vim-pl-command',
        StatusLineSearch: '--vim-pl-search',
        StatusLineSelect: '--vim-pl-select',
        StatusLineVReplace: '--vim-pl-vreplace',
    };

    constructor(doc?: Document) {
        this.doc = doc ?? null;
    }

    setHighlight(group: string, attrs: HighlightAttrs): void {
        if (attrs.default && this.groups.has(group)) return;

        if (attrs.link) {
            const linked = this.groups.get(attrs.link);
            if (linked) {
                this.groups.set(group, { ...linked });
            } else {
                this.groups.set(group, { link: attrs.link });
            }
            this.updateStyles();
            return;
        }

        if (attrs.update) {
            const existing = this.groups.get(group) ?? {};
            const merged = { ...existing };
            if (attrs.fg !== undefined) merged.fg = attrs.fg;
            if (attrs.bg !== undefined) merged.bg = attrs.bg;
            if (attrs.sp !== undefined) merged.sp = attrs.sp;
            if (attrs.bold !== undefined) merged.bold = attrs.bold;
            if (attrs.italic !== undefined) merged.italic = attrs.italic;
            if (attrs.underline !== undefined)
                merged.underline = attrs.underline;
            if (attrs.undercurl !== undefined)
                merged.undercurl = attrs.undercurl;
            if (attrs.underdouble !== undefined)
                merged.underdouble = attrs.underdouble;
            if (attrs.underdotted !== undefined)
                merged.underdotted = attrs.underdotted;
            if (attrs.underdashed !== undefined)
                merged.underdashed = attrs.underdashed;
            if (attrs.strikethrough !== undefined)
                merged.strikethrough = attrs.strikethrough;
            if (attrs.reverse !== undefined) merged.reverse = attrs.reverse;
            if (attrs.blend !== undefined) merged.blend = attrs.blend;
            delete merged.update;
            delete merged.default;
            this.groups.set(group, merged);
        } else {
            const cleaned = { ...attrs };
            delete cleaned.update;
            delete cleaned.default;
            this.groups.set(group, cleaned);
        }

        this.updateStyles();
    }

    getHighlight(group: string): HighlightAttrs | null {
        const attrs = this.groups.get(group);
        if (!attrs) return null;
        if (attrs.link) {
            return this.groups.get(attrs.link) ?? attrs;
        }
        return { ...attrs };
    }

    clearHighlight(group: string): void {
        this.groups.delete(group);
        this.updateStyles();
    }

    destroy(): void {
        if (this.styleEl?.parentNode) {
            this.styleEl.parentNode.removeChild(this.styleEl);
        }
        this.styleEl = null;
        this.groups.clear();
    }

    private updateStyles(): void {
        if (!this.doc) return;

        if (!this.styleEl) {
            this.styleEl = this.doc.createElement('style');
            this.styleEl.id = 'vim-motions-highlights';
            this.doc.head.appendChild(this.styleEl);
        }

        const rules: string[] = [];
        const rootVars: string[] = [];

        for (const [group, attrs] of this.groups) {
            const resolved = attrs.link
                ? (this.groups.get(attrs.link) ?? attrs)
                : attrs;
            if (resolved.link && !this.groups.has(resolved.link)) continue;

            const prefix = HighlightManager.PLUGIN_GROUPS[group];
            if (prefix) {
                if (resolved.fg) rootVars.push(`${prefix}-fg: ${resolved.fg};`);
                if (resolved.bg) rootVars.push(`${prefix}-bg: ${resolved.bg};`);
            } else {
                const css = this.attrsToCSS(resolved);
                if (css) {
                    rules.push(`.vim-hl-${group} { ${css} }`);
                }
            }
        }

        const parts: string[] = [];
        if (rootVars.length > 0) {
            parts.push(`:root { ${rootVars.join(' ')} }`);
        }
        parts.push(...rules);
        this.styleEl.textContent = parts.join('\n');
    }

    private attrsToCSS(attrs: HighlightAttrs): string {
        const props: string[] = [];
        let fg = attrs.fg;
        let bg = attrs.bg;

        if (attrs.reverse && fg && bg) {
            [fg, bg] = [bg, fg];
        }

        if (fg) props.push(`color: ${fg}`);
        if (bg) props.push(`background-color: ${bg}`);
        if (attrs.bold) props.push('font-weight: bold');
        if (attrs.italic) props.push('font-style: italic');

        const decoLines: string[] = [];
        const decoStyles: string[] = [];
        if (attrs.underline) {
            decoLines.push('underline');
        }
        if (attrs.undercurl) {
            decoLines.push('underline');
            decoStyles.push('wavy');
        }
        if (attrs.underdouble) {
            decoLines.push('underline');
            decoStyles.push('double');
        }
        if (attrs.underdotted) {
            decoLines.push('underline');
            decoStyles.push('dotted');
        }
        if (attrs.underdashed) {
            decoLines.push('underline');
            decoStyles.push('dashed');
        }
        if (attrs.strikethrough) {
            decoLines.push('line-through');
        }
        if (decoLines.length > 0) {
            props.push(
                `text-decoration-line: ${[...new Set(decoLines)].join(' ')}`,
            );
        }
        if (decoStyles.length > 0) {
            props.push(`text-decoration-style: ${decoStyles[0]}`);
        }
        if (attrs.sp) {
            props.push(`text-decoration-color: ${attrs.sp}`);
        }
        if (attrs.blend !== undefined) {
            props.push(`opacity: ${attrs.blend / 100}`);
        }

        return props.join('; ');
    }
}
