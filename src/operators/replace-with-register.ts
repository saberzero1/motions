import type {
    CmAdapter,
    OperatorArgs,
    OperatorRange,
    VimPos,
} from '../types/vim-api';

/**
 * Operator callback for `gr` (replace with register).
 *
 * Replaces the text covered by the motion with the contents of the specified
 * register (default: unnamed register `"`). The replaced text is discarded
 * without being written to any register, so the register supplying the
 * replacement text is preserved.
 *
 * Usage:
 *   gr{motion}      — replace text covered by motion with unnamed register
 *   "agr{motion}    — replace text covered by motion with register a
 *   grr             — replace current line (operator double-press = linewise)
 *   Visual gr       — replace selection with register contents
 *
 * Note: `gr{motion}` is a plugin-provided operator (not a built-in Neovim
 * operator). It is intentionally different from Neovim's LSP `gr*` mappings
 * (grn/grr/gra), which are repurposed by this plugin as Obsidian-specific
 * commands accessible via ex commands (:renamenote, :showbacklinks,
 * :contextactions).
 */
export function replaceWithRegisterOperator(
    cm: CmAdapter,
    operatorArgs: OperatorArgs,
    ranges: OperatorRange[],
    _oldAnchor: VimPos,
    _newHead: VimPos,
): VimPos | void {
    const Vim = window.CodeMirrorAdapter?.Vim;
    if (!Vim) return;

    const regName = operatorArgs.registerName ?? '"';
    const rc = Vim.getRegisterController();
    const reg = rc.getRegister
        ? rc.getRegister(regName)
        : rc.registers[regName.toLowerCase()];
    if (!reg) return;

    const regText = reg.toString();
    if (!regText) return;

    if (ranges.length > 1) {
        // Blockwise visual mode: replace each line in the block independently.
        let registerLines = regText.split('\n');
        if (reg.linewise && registerLines[registerLines.length - 1] === '') {
            registerLines = registerLines.slice(0, -1);
        }

        const getReplacementLine = (index: number): string => {
            if (registerLines.length === 0) return '';
            if (registerLines.length === 1) return registerLines[0] ?? '';
            if (index < registerLines.length) return registerLines[index] ?? '';
            return registerLines[registerLines.length - 1] ?? '';
        };

        let topLeft: VimPos | null = null;

        for (let i = ranges.length - 1; i >= 0; i--) {
            const range = ranges[i];
            if (!range) continue;
            const anchor = range.anchor;
            const head = range.head;
            const from =
                anchor.line < head.line ||
                (anchor.line === head.line && anchor.ch <= head.ch)
                    ? anchor
                    : head;
            const to = from === anchor ? head : anchor;
            const lineText = cm.getLine(to.line) ?? '';
            const lineLen = lineText.length;
            const clampedTo = { line: to.line, ch: Math.min(to.ch, lineLen) };
            const replacementText = getReplacementLine(i);

            cm.replaceRange(replacementText, from, clampedTo);

            if (
                !topLeft ||
                from.line < topLeft.line ||
                (from.line === topLeft.line && from.ch < topLeft.ch)
            ) {
                topLeft = from;
            }
        }

        if (topLeft) {
            return topLeft;
        }
        return;
    }

    const range = ranges[0];
    if (!range) return;

    if (operatorArgs.linewise) {
        // Linewise mode (e.g. grr): replace entire lines.
        // In linewise mode, range.head.line is one past the last affected line
        // (the same convention used by the built-in delete/yank operators).
        const fromLine = Math.min(range.anchor.line, range.head.line);
        const toLine = Math.max(range.anchor.line, range.head.line);

        // Ensure the replacement text ends with a newline so the line count
        // is preserved. Linewise registers already carry a trailing newline;
        // charwise registers need one appended.
        let text = regText;
        if (!reg.linewise && !text.endsWith('\n')) {
            text += '\n';
        }

        // Replace from the start of fromLine to the start of toLine
        // (which is the character position just after the last affected line's
        // newline — exactly the range produced by expandToLine with linewise).
        cm.replaceRange(
            text,
            { line: fromLine, ch: 0 },
            { line: toLine, ch: 0 },
        );

        // Position cursor at the first non-blank character of the first
        // replaced line (Vim convention after linewise operators).
        const lineText = cm.getLine(fromLine) ?? '';
        const firstNonWs = lineText.search(/\S/);
        return { line: fromLine, ch: firstNonWs >= 0 ? firstNonWs : 0 };
    } else {
        // Characterwise mode: replace the exact character range.
        // Normalise so anchor is always the leftmost position.
        let anchor = range.anchor;
        let head = range.head;
        if (
            anchor.line > head.line ||
            (anchor.line === head.line && anchor.ch > head.ch)
        ) {
            [anchor, head] = [head, anchor];
        }

        // When pasting a linewise register into a charwise context, strip the
        // trailing newline so the text is inserted inline rather than adding
        // an unwanted line break.
        let text = regText;
        if (reg.linewise && text.endsWith('\n')) {
            text = text.slice(0, -1);
        }

        cm.replaceRange(text, anchor, head);

        // Cursor at last character of replacement (canonical vim-ReplaceWithRegister
        // convention: land on the last character of the pasted text).
        if (text.length === 0) {
            return anchor;
        }
        const lines = text.split('\n');
        if (lines.length === 1) {
            return { line: anchor.line, ch: anchor.ch + text.length - 1 };
        } else {
            const lastLine = lines[lines.length - 1] ?? '';
            return {
                line: anchor.line + lines.length - 1,
                ch: Math.max(0, lastLine.length - 1),
            };
        }
    }
}
