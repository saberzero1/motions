import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickerFileType } from '../../src/picker/sources/display-name';

/**
 * The picker's file icons are SVG data URIs in `styles.css`, one rule per
 * file type (#171). A broken data URI or a type without its two variables
 * would show nothing, with no error anywhere.
 */

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

const TYPES = [
    'file',
    'markdown',
    'canvas',
    'base',
    'excalidraw',
    'pdf',
    'image',
    'svg',
    'audio',
    'video',
    'table',
    'json',
    'text',
    'html',
    'css',
    'javascript',
    'typescript',
    'python',
    'archive',
    'word',
    'presentation',
    'epub',
];

function iconUrl(type: string): string | null {
    const match = new RegExp(
        `--vim-motions-icon-${type},\\s*url\\("data:image/svg\\+xml,([^"]+)"\\)`,
    ).exec(css);
    return match ? decodeURIComponent(match[1]!) : null;
}

describe('picker file icons in styles.css', () => {
    it('gives every type an icon that decodes to an SVG', () => {
        const broken = TYPES.filter((type) => {
            const svg = iconUrl(type);
            return (
                !svg ||
                !/^<svg[^>]*xmlns='http:\/\/www\.w3\.org\/2000\/svg'/.test(
                    svg,
                ) ||
                !svg.endsWith('</svg>')
            );
        });

        expect(broken).toEqual([]);
    });

    it('gives every type an overridable colour', () => {
        const missing = TYPES.filter(
            (type) =>
                !new RegExp(`var\\(\\s*--vim-motions-icon-${type}-color,`).test(
                    css,
                ),
        );

        expect(missing).toEqual([]);
    });

    it('maps the common vault file types to their icons', () => {
        const ruleFor = (ext: string): string | undefined => {
            const at = css.indexOf(`[data-ext='${ext}']`);
            if (at < 0) return undefined;
            return /--vim-motions-icon-([\w-]+?),/.exec(css.slice(at))?.[1];
        };

        expect({
            md: ruleFor('md'),
            canvas: ruleFor('canvas'),
            base: ruleFor('base'),
            pdf: ruleFor('pdf'),
            png: ruleFor('png'),
            mp3: ruleFor('mp3'),
            mp4: ruleFor('mp4'),
            csv: ruleFor('csv'),
            txt: ruleFor('txt'),
            docx: ruleFor('docx'),
            epub: ruleFor('epub'),
            excalidraw: ruleFor('excalidraw'),
        }).toEqual({
            md: 'markdown',
            canvas: 'canvas',
            base: 'base',
            pdf: 'pdf',
            png: 'image',
            mp3: 'audio',
            mp4: 'video',
            csv: 'table',
            txt: 'text',
            docx: 'word',
            epub: 'epub',
            excalidraw: 'excalidraw',
        });
    });
});

describe('pickerFileType', () => {
    it('is the lower-cased extension, or excalidraw for a drawing in Markdown', () => {
        expect(pickerFileType('notes/Report.PDF')).toBe('pdf');
        expect(pickerFileType('Board.canvas')).toBe('canvas');
        expect(pickerFileType('Sketch.excalidraw.md')).toBe('excalidraw');
        expect(pickerFileType('Plain.md')).toBe('md');
        expect(pickerFileType('Makefile')).toBe('');
        expect(pickerFileType('.hidden')).toBe('');
    });
});
