import { VimRegistration } from '../vim/registration';
import {
    createMultiLineDelimiterTextObject,
    createSmartAsteriskTextObject,
    createSmartDollarTextObject,
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
import { createInnerTagMotion, createAroundTagMotion } from './tag';
import { tableCellTextObject } from './table-cell';
import { tableRowTextObject } from './table-row';

export function registerTextObjects(
    reg: VimRegistration,
    scanLimit = 20,
): void {
    reg.defineMotion(
        'markdownAsteriskInner',
        createSmartAsteriskTextObject(scanLimit),
    );
    reg.mapCommand('i*', 'motion', 'markdownAsteriskInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownAsteriskAround',
        createSmartAsteriskTextObject(scanLimit),
    );
    reg.mapCommand('a*', 'motion', 'markdownAsteriskAround', {});

    reg.defineMotion(
        'markdownItalicInner',
        createMultiLineDelimiterTextObject('_', scanLimit),
    );
    reg.mapCommand('i_', 'motion', 'markdownItalicInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownItalicAround',
        createMultiLineDelimiterTextObject('_', scanLimit),
    );
    reg.mapCommand('a_', 'motion', 'markdownItalicAround', {});

    reg.defineMotion(
        'markdownCodeInner',
        createMultiLineDelimiterTextObject('`', scanLimit),
    );
    reg.mapCommand('i`', 'motion', 'markdownCodeInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownCodeAround',
        createMultiLineDelimiterTextObject('`', scanLimit),
    );
    reg.mapCommand('a`', 'motion', 'markdownCodeAround', {});

    reg.defineMotion(
        'markdownMathInner',
        createSmartDollarTextObject(scanLimit),
    );
    reg.mapCommand('i$', 'motion', 'markdownMathInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownMathAround',
        createSmartDollarTextObject(scanLimit),
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
        createMultiLineDelimiterTextObject('~~', scanLimit),
    );
    reg.mapCommand('i~', 'motion', 'markdownStrikethroughInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownStrikethroughAround',
        createMultiLineDelimiterTextObject('~~', scanLimit),
    );
    reg.mapCommand('a~', 'motion', 'markdownStrikethroughAround', {});

    reg.defineMotion(
        'markdownHighlightInner',
        createMultiLineDelimiterTextObject('==', scanLimit),
    );
    reg.mapCommand('i=', 'motion', 'markdownHighlightInner', {
        textObjectInner: true,
    });
    reg.defineMotion(
        'markdownHighlightAround',
        createMultiLineDelimiterTextObject('==', scanLimit),
    );
    reg.mapCommand('a=', 'motion', 'markdownHighlightAround', {});

    reg.defineMotion('htmlTagInner', createInnerTagMotion());
    reg.mapCommand('it', 'motion', 'htmlTagInner', {
        textObjectInner: true,
    });
    reg.defineMotion('htmlTagAround', createAroundTagMotion());
    reg.mapCommand('at', 'motion', 'htmlTagAround', {});

    reg.defineMotion('tableCellInner', tableCellTextObject);
    reg.mapCommand('i|', 'motion', 'tableCellInner', {
        textObjectInner: true,
    });
    reg.defineMotion('tableCellAround', tableCellTextObject);
    reg.mapCommand('a|', 'motion', 'tableCellAround', {});

    reg.defineMotion('tableRowInner', tableRowTextObject);
    reg.mapCommand('ir', 'motion', 'tableRowInner', {
        textObjectInner: true,
    });
    reg.defineMotion('tableRowAround', tableRowTextObject);
    reg.mapCommand('ar', 'motion', 'tableRowAround', {});
}
