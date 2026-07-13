import type { PreprocessContext } from './types';

const VARIABLE_REGEX = /\$(?:([A-Z_][A-Z0-9_]*)|\{([A-Z_][A-Z0-9_]*)\})/g;

const MONTH_NAMES = [
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
];

const MONTH_NAMES_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const DAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(value: number): string {
    return value.toString().padStart(2, '0');
}

function getFileName(filePath: string): string {
    if (!filePath) return '';
    const lastSlash = Math.max(
        filePath.lastIndexOf('/'),
        filePath.lastIndexOf('\\'),
    );
    return lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
}

function getDirectory(filePath: string): string {
    if (!filePath) return '';
    const lastSlash = Math.max(
        filePath.lastIndexOf('/'),
        filePath.lastIndexOf('\\'),
    );
    return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}

function getFileBaseName(fileName: string): string {
    if (!fileName) return '';
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot <= 0) return fileName;
    return fileName.slice(0, lastDot);
}

function getTimezoneOffset(date: Date): string {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const hours = pad2(Math.floor(abs / 60));
    const minutes = pad2(abs % 60);
    return `${sign}${hours}${minutes}`;
}

function randomHex(length: number): string {
    let result = '';
    for (let i = 0; i < length; i += 1) {
        result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
}

function createUuid(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function resolveVariables(
    template: string,
    ctx: PreprocessContext,
): string {
    const date = new Date();
    const fileName = getFileName(ctx.filePath);
    const replacements: Record<string, string> = {
        CURRENT_YEAR: date.getFullYear().toString(),
        CURRENT_YEAR_SHORT: date.getFullYear().toString().slice(-2),
        CURRENT_MONTH: pad2(date.getMonth() + 1),
        CURRENT_MONTH_NAME: MONTH_NAMES[date.getMonth()] ?? '',
        CURRENT_MONTH_NAME_SHORT: MONTH_NAMES_SHORT[date.getMonth()] ?? '',
        CURRENT_DATE: pad2(date.getDate()),
        CURRENT_DAY_NAME: DAY_NAMES[date.getDay()] ?? '',
        CURRENT_DAY_NAME_SHORT: DAY_NAMES_SHORT[date.getDay()] ?? '',
        CURRENT_HOUR: pad2(date.getHours()),
        CURRENT_MINUTE: pad2(date.getMinutes()),
        CURRENT_SECOND: pad2(date.getSeconds()),
        CURRENT_SECONDS_UNIX: Math.floor(Date.now() / 1000).toString(),
        CURRENT_TIMEZONE_OFFSET: getTimezoneOffset(date),
        TM_FILENAME: fileName,
        TM_FILENAME_BASE: getFileBaseName(fileName),
        TM_DIRECTORY: getDirectory(ctx.filePath),
        TM_FILEPATH: ctx.filePath,
        TM_SELECTED_TEXT: ctx.selectedText,
        CLIPBOARD: ctx.clipboard,
        RANDOM: Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, '0'),
        RANDOM_HEX: randomHex(6),
        UUID: createUuid(),
    };

    return template.replace(
        VARIABLE_REGEX,
        (_match: string, g1: string | undefined, g2: string | undefined) => {
            const key = g1 ?? g2;
            if (!key) return '';
            return replacements[key] ?? '';
        },
    );
}
