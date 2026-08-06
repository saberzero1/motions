import { describe, it, expect } from 'vitest';
import { resolveVariables } from '../../../src/snippets/variables';
import type { PreprocessContext } from '../../../src/snippets/types';

function makeContext(
    overrides: Partial<PreprocessContext> = {},
): PreprocessContext {
    return {
        filePath: 'folder/subfolder/note.md',
        clipboard: 'clipboard-text',
        selectedText: 'selected-text',
        currentLine: '  const x = 42;',
        currentWord: 'const',
        lineNumber: 5,
        lineIndex: 4,
        workspaceName: 'MyVault',
        ...overrides,
    };
}

describe('resolveVariables', () => {
    describe('selection and content variables', () => {
        it('resolves $TM_SELECTED_TEXT to selectedText', () => {
            const result = resolveVariables(
                'a $TM_SELECTED_TEXT b',
                makeContext(),
            );
            expect(result).toBe('a selected-text b');
        });

        it('resolves $VISUAL as alias for $TM_SELECTED_TEXT', () => {
            const ctx = makeContext();
            const a = resolveVariables('$TM_SELECTED_TEXT', ctx);
            const b = resolveVariables('$VISUAL', ctx);
            expect(a).toBe(b);
            expect(a).toBe('selected-text');
        });

        it('resolves $TM_CURRENT_LINE to currentLine', () => {
            const result = resolveVariables('$TM_CURRENT_LINE', makeContext());
            expect(result).toBe('  const x = 42;');
        });

        it('resolves $TM_CURRENT_WORD to currentWord', () => {
            const result = resolveVariables('$TM_CURRENT_WORD', makeContext());
            expect(result).toBe('const');
        });

        it('resolves $WORD as alias for $TM_CURRENT_WORD', () => {
            const ctx = makeContext();
            const a = resolveVariables('$TM_CURRENT_WORD', ctx);
            const b = resolveVariables('$WORD', ctx);
            expect(a).toBe(b);
            expect(a).toBe('const');
        });

        it('resolves $TM_LINE_NUMBER as 1-based string', () => {
            const result = resolveVariables('$TM_LINE_NUMBER', makeContext());
            expect(result).toBe('5');
        });

        it('resolves $TM_LINE_INDEX as 0-based string', () => {
            const result = resolveVariables('$TM_LINE_INDEX', makeContext());
            expect(result).toBe('4');
        });

        it('resolves $CLIPBOARD to clipboard', () => {
            const result = resolveVariables('$CLIPBOARD', makeContext());
            expect(result).toBe('clipboard-text');
        });
    });

    describe('file and path variables', () => {
        it('resolves $TM_FILENAME to filename with extension', () => {
            const result = resolveVariables('$TM_FILENAME', makeContext());
            expect(result).toBe('note.md');
        });

        it('resolves $TM_FILENAME_BASE to filename without extension', () => {
            const result = resolveVariables('$TM_FILENAME_BASE', makeContext());
            expect(result).toBe('note');
        });

        it('resolves $TM_FILEPATH to full path', () => {
            const result = resolveVariables('$TM_FILEPATH', makeContext());
            expect(result).toBe('folder/subfolder/note.md');
        });

        it('resolves $TM_DIRECTORY to parent directory', () => {
            const result = resolveVariables('$TM_DIRECTORY', makeContext());
            expect(result).toBe('folder/subfolder');
        });

        it('resolves $RELATIVE_FILEPATH as alias for $TM_FILEPATH', () => {
            const ctx = makeContext();
            const a = resolveVariables('$TM_FILEPATH', ctx);
            const b = resolveVariables('$RELATIVE_FILEPATH', ctx);
            expect(a).toBe(b);
        });
    });

    describe('workspace and cursor variables', () => {
        it('resolves $WORKSPACE_NAME to workspaceName', () => {
            const result = resolveVariables('$WORKSPACE_NAME', makeContext());
            expect(result).toBe('MyVault');
        });

        it('resolves $WORKSPACE_FOLDER as alias for $WORKSPACE_NAME', () => {
            const ctx = makeContext();
            const a = resolveVariables('$WORKSPACE_NAME', ctx);
            const b = resolveVariables('$WORKSPACE_FOLDER', ctx);
            expect(a).toBe(b);
        });

        it('resolves $CURSOR_INDEX to 0', () => {
            const result = resolveVariables('$CURSOR_INDEX', makeContext());
            expect(result).toBe('0');
        });

        it('resolves $CURSOR_NUMBER to 1', () => {
            const result = resolveVariables('$CURSOR_NUMBER', makeContext());
            expect(result).toBe('1');
        });
    });

    describe('date and time variables', () => {
        it('resolves $CURRENT_YEAR to 4-digit year', () => {
            const result = resolveVariables('$CURRENT_YEAR', makeContext());
            expect(result).toMatch(/^\d{4}$/);
        });

        it('resolves $CURRENT_YEAR_SHORT to 2-digit year', () => {
            const result = resolveVariables(
                '$CURRENT_YEAR_SHORT',
                makeContext(),
            );
            expect(result).toMatch(/^\d{2}$/);
        });

        it('resolves $CURRENT_MONTH to zero-padded month', () => {
            const result = resolveVariables('$CURRENT_MONTH', makeContext());
            expect(result).toMatch(/^(0[1-9]|1[0-2])$/);
        });

        it('resolves $CURRENT_MONTH_NAME to full month name', () => {
            const result = resolveVariables(
                '$CURRENT_MONTH_NAME',
                makeContext(),
            );
            expect([
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
            ]).toContain(result);
        });

        it('resolves $CURRENT_MONTH_NAME_SHORT to abbreviated month', () => {
            const result = resolveVariables(
                '$CURRENT_MONTH_NAME_SHORT',
                makeContext(),
            );
            expect(result).toMatch(/^[A-Z][a-z]{2}$/);
        });

        it('resolves $CURRENT_DATE to zero-padded day', () => {
            const result = resolveVariables('$CURRENT_DATE', makeContext());
            expect(result).toMatch(/^(0[1-9]|[12]\d|3[01])$/);
        });

        it('resolves $CURRENT_DAY_NAME to full weekday name', () => {
            const result = resolveVariables('$CURRENT_DAY_NAME', makeContext());
            expect([
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
            ]).toContain(result);
        });

        it('resolves $CURRENT_DAY_NAME_SHORT to abbreviated weekday', () => {
            const result = resolveVariables(
                '$CURRENT_DAY_NAME_SHORT',
                makeContext(),
            );
            expect(result).toMatch(/^[A-Z][a-z]{2}$/);
        });

        it('resolves $CURRENT_HOUR to zero-padded hour', () => {
            const result = resolveVariables('$CURRENT_HOUR', makeContext());
            expect(result).toMatch(/^([01]\d|2[0-3])$/);
        });

        it('resolves $CURRENT_MINUTE to zero-padded minute', () => {
            const result = resolveVariables('$CURRENT_MINUTE', makeContext());
            expect(result).toMatch(/^[0-5]\d$/);
        });

        it('resolves $CURRENT_SECOND to zero-padded second', () => {
            const result = resolveVariables('$CURRENT_SECOND', makeContext());
            expect(result).toMatch(/^[0-5]\d$/);
        });

        it('resolves $CURRENT_MILLISECOND to zero-padded 3-digit ms', () => {
            const result = resolveVariables(
                '$CURRENT_MILLISECOND',
                makeContext(),
            );
            expect(result).toMatch(/^\d{3}$/);
        });

        it('resolves $CURRENT_SECONDS_UNIX to numeric timestamp', () => {
            const result = resolveVariables(
                '$CURRENT_SECONDS_UNIX',
                makeContext(),
            );
            expect(result).toMatch(/^\d+$/);
            const ts = parseInt(result, 10);
            expect(ts).toBeGreaterThan(1700000000);
        });

        it('resolves $CURRENT_MILLISECONDS_UNIX to numeric ms timestamp', () => {
            const result = resolveVariables(
                '$CURRENT_MILLISECONDS_UNIX',
                makeContext(),
            );
            expect(result).toMatch(/^\d+$/);
            const ts = parseInt(result, 10);
            expect(ts).toBeGreaterThan(1700000000000);
        });

        it('resolves $CURRENT_TIMEZONE_OFFSET to UTC offset format', () => {
            const result = resolveVariables(
                '$CURRENT_TIMEZONE_OFFSET',
                makeContext(),
            );
            expect(result).toMatch(/^[+-]\d{4}$/);
        });

        it('resolves $CURRENT_TIMEZONE_NAME to a string', () => {
            const result = resolveVariables(
                '$CURRENT_TIMEZONE_NAME',
                makeContext(),
            );
            expect(typeof result).toBe('string');
        });
    });

    describe('random variables', () => {
        it('resolves $RANDOM to 6-digit number', () => {
            const result = resolveVariables('$RANDOM', makeContext());
            expect(result).toMatch(/^\d{6}$/);
        });

        it('resolves $RANDOM_HEX to 6-digit hex', () => {
            const result = resolveVariables('$RANDOM_HEX', makeContext());
            expect(result).toMatch(/^[0-9a-f]{6}$/);
        });

        it('resolves $UUID to valid UUID v4 format', () => {
            const result = resolveVariables('$UUID', makeContext());
            expect(result).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            );
        });
    });

    describe('syntax variants', () => {
        it('supports ${VAR} brace syntax', () => {
            const result = resolveVariables('${TM_FILENAME}', makeContext());
            expect(result).toBe('note.md');
        });

        it('supports $VAR bare syntax', () => {
            const result = resolveVariables('$TM_FILENAME', makeContext());
            expect(result).toBe('note.md');
        });

        it('resolves multiple variables in one template', () => {
            const result = resolveVariables(
                '$TM_FILENAME - $WORKSPACE_NAME',
                makeContext(),
            );
            expect(result).toBe('note.md - MyVault');
        });

        it('resolves adjacent variables without separator', () => {
            const result = resolveVariables(
                '$CURSOR_INDEX$CURSOR_NUMBER',
                makeContext(),
            );
            expect(result).toBe('01');
        });
    });

    describe('edge cases', () => {
        it('resolves unknown variables to empty string', () => {
            const result = resolveVariables('$UNKNOWN_VAR', makeContext());
            expect(result).toBe('');
        });

        it('handles empty selectedText', () => {
            const result = resolveVariables(
                'a$TM_SELECTED_TEXTb',
                makeContext({ selectedText: '' }),
            );
            expect(result).toBe('ab');
        });

        it('handles empty clipboard', () => {
            const result = resolveVariables(
                '$CLIPBOARD',
                makeContext({ clipboard: '' }),
            );
            expect(result).toBe('');
        });

        it('handles empty currentWord', () => {
            const result = resolveVariables(
                '$TM_CURRENT_WORD',
                makeContext({ currentWord: '' }),
            );
            expect(result).toBe('');
        });

        it('handles empty filePath', () => {
            const ctx = makeContext({ filePath: '' });
            expect(resolveVariables('$TM_FILENAME', ctx)).toBe('');
            expect(resolveVariables('$TM_FILENAME_BASE', ctx)).toBe('');
            expect(resolveVariables('$TM_DIRECTORY', ctx)).toBe('');
            expect(resolveVariables('$TM_FILEPATH', ctx)).toBe('');
        });

        it('preserves text without variables', () => {
            const result = resolveVariables('no variables here', makeContext());
            expect(result).toBe('no variables here');
        });

        it('handles template with only a variable', () => {
            const result = resolveVariables('$CLIPBOARD', makeContext());
            expect(result).toBe('clipboard-text');
        });

        it('variable inside tabstop default syntax is resolved', () => {
            const result = resolveVariables(
                '${1:$TM_CURRENT_LINE}',
                makeContext(),
            );
            expect(result).toBe('${1:  const x = 42;}');
        });

        it('adjacent $RANDOM produces two values (may differ)', () => {
            const result = resolveVariables('$RANDOM$RANDOM', makeContext());
            expect(result).toMatch(/^\d{12}$/);
        });
    });
});
