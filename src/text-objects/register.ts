import { VimRegistration } from '../vim/registration';
import {
    createMultiLineDelimiterTextObject,
    createSmartAsteriskTextObject,
} from './delimiter';
import { linkInnerTextObject, linkAroundTextObject } from './link';
import {
    blockquoteInnerTextObject,
    blockquoteAroundTextObject,
    calloutInnerTextObject,
    calloutAroundTextObject,
} from './blockquote';
import {
    codeBlockInnerTextObject,
    codeBlockAroundTextObject,
} from './code-block';

export function registerTextObjects(reg: VimRegistration): void {
    reg.defineMotion('markdownAsteriskInner', createSmartAsteriskTextObject());
    reg.mapCommand('i*', 'motion', 'markdownAsteriskInner', {
        textObjectInner: true,
    });
    reg.defineMotion('markdownAsteriskAround', createSmartAsteriskTextObject());
    reg.mapCommand('a*', 'motion', 'markdownAsteriskAround', {});

    reg.defineMotion(
        'markdownItalicInner',
        createMultiLineDelimiterTextObject('_'),
    );
    reg.mapCommand('i_', 'motion', 'markdownItalicInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownItalicAround',
        createMultiLineDelimiterTextObject('_'),
    );
    reg.mapCommand('a_', 'motion', 'markdownItalicAround', {});

    reg.defineMotion(
        'markdownCodeInner',
        createMultiLineDelimiterTextObject('`'),
    );
    reg.mapCommand('i`', 'motion', 'markdownCodeInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownCodeAround',
        createMultiLineDelimiterTextObject('`'),
    );
    reg.mapCommand('a`', 'motion', 'markdownCodeAround', {});

    reg.defineMotion(
        'markdownMathInner',
        createMultiLineDelimiterTextObject('$'),
    );
    reg.mapCommand('i$', 'motion', 'markdownMathInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownMathAround',
        createMultiLineDelimiterTextObject('$'),
    );
    reg.mapCommand('a$', 'motion', 'markdownMathAround', {});

    reg.defineMotion('markdownLinkInner', linkInnerTextObject);
    reg.mapCommand('il', 'motion', 'markdownLinkInner', {
        textObjectInner: true,
    });
    reg.defineMotion('markdownLinkAround', linkAroundTextObject);
    reg.mapCommand('al', 'motion', 'markdownLinkAround', {});

    reg.defineMotion('markdownCodeBlockInner', codeBlockInnerTextObject);
    reg.mapCommand('iC', 'motion', 'markdownCodeBlockInner', {
        textObjectInner: true,
    });
    reg.defineMotion('markdownCodeBlockAround', codeBlockAroundTextObject);
    reg.mapCommand('aC', 'motion', 'markdownCodeBlockAround', {});

    reg.defineMotion('markdownBlockquoteInner', blockquoteInnerTextObject);
    reg.mapCommand('iB', 'motion', 'markdownBlockquoteInner', {
        textObjectInner: true,
    });
    reg.defineMotion('markdownBlockquoteAround', blockquoteAroundTextObject);
    reg.mapCommand('aB', 'motion', 'markdownBlockquoteAround', {});

    reg.defineMotion('markdownCalloutInner', calloutInnerTextObject);
    reg.mapCommand('io', 'motion', 'markdownCalloutInner', {
        textObjectInner: true,
    });
    reg.defineMotion('markdownCalloutAround', calloutAroundTextObject);
    reg.mapCommand('ao', 'motion', 'markdownCalloutAround', {});

    reg.defineMotion(
        'markdownStrikethroughInner',
        createMultiLineDelimiterTextObject('~~'),
    );
    reg.mapCommand('i~', 'motion', 'markdownStrikethroughInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownStrikethroughAround',
        createMultiLineDelimiterTextObject('~~'),
    );
    reg.mapCommand('a~', 'motion', 'markdownStrikethroughAround', {});

    reg.defineMotion(
        'markdownHighlightInner',
        createMultiLineDelimiterTextObject('=='),
    );
    reg.mapCommand('i=', 'motion', 'markdownHighlightInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownHighlightAround',
        createMultiLineDelimiterTextObject('=='),
    );
    reg.mapCommand('a=', 'motion', 'markdownHighlightAround', {});
}
