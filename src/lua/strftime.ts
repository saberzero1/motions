const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];
const MONTH_SHORT = [
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
const MONTH_FULL = [
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

function pad(value: number, length: number, fill = '0'): string {
    return String(value).padStart(length, fill);
}

function padSpace(value: number, length: number): string {
    return String(value).padStart(length, ' ');
}

function isLeapYear(year: number): boolean {
    if (year % 4 !== 0) return false;
    if (year % 100 !== 0) return true;
    return year % 400 === 0;
}

function dayOfYear(date: Date): number {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const monthDays = [
        31,
        isLeapYear(year) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let total = 0;
    for (let i = 0; i < month; i++) total += monthDays[i] ?? 0;
    return total + day;
}

function weekNumberSunday(date: Date): number {
    const doy = dayOfYear(date);
    const weekday = date.getDay();
    return Math.floor((doy + 6 - weekday) / 7);
}

function weekNumberMonday(date: Date): number {
    const doy = dayOfYear(date);
    const weekday = (date.getDay() + 6) % 7;
    return Math.floor((doy + 6 - weekday) / 7);
}

function isoWeek(date: Date): { week: number; year: number } {
    const temp = new Date(date.getTime());
    const weekday = (temp.getDay() + 6) % 7;
    temp.setDate(temp.getDate() - weekday + 3);
    const isoYear = temp.getFullYear();
    const jan4 = new Date(isoYear, 0, 4);
    const jan4Weekday = (jan4.getDay() + 6) % 7;
    const week1 = new Date(isoYear, 0, 4 - jan4Weekday);
    const diff = temp.getTime() - week1.getTime();
    const week = Math.floor(diff / 604800000) + 1;
    return { week, year: isoYear };
}

function timezoneName(date: Date): string {
    if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return '';
    const parts = new Intl.DateTimeFormat('en', {
        timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

export function strftime(format: string, date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    const weekday = date.getDay();

    const { week: isoWeekNum, year: isoYear } = isoWeek(date);

    let result = '';
    for (let i = 0; i < format.length; i++) {
        const ch = format[i];
        if (ch !== '%') {
            result += ch;
            continue;
        }
        const next = format[i + 1];
        if (next === undefined) {
            result += '%';
            continue;
        }
        i++;
        switch (next) {
            case 'a':
                result += WEEKDAY_SHORT[weekday];
                break;
            case 'A':
                result += WEEKDAY_FULL[weekday];
                break;
            case 'b':
            case 'h':
                result += MONTH_SHORT[month];
                break;
            case 'B':
                result += MONTH_FULL[month];
                break;
            case 'c':
                result += `${WEEKDAY_SHORT[weekday]} ${MONTH_SHORT[month]} ${padSpace(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)} ${year}`;
                break;
            case 'd':
                result += pad(day, 2);
                break;
            case 'D':
                result += `${pad(month + 1, 2)}/${pad(day, 2)}/${pad(year % 100, 2)}`;
                break;
            case 'e':
                result += padSpace(day, 2);
                break;
            case 'F':
                result += `${pad(year, 4)}-${pad(month + 1, 2)}-${pad(day, 2)}`;
                break;
            case 'g':
                result += pad(isoYear % 100, 2);
                break;
            case 'G':
                result += pad(isoYear, 4);
                break;
            case 'H':
                result += pad(hour, 2);
                break;
            case 'I': {
                const hour12 = hour % 12 === 0 ? 12 : hour % 12;
                result += pad(hour12, 2);
                break;
            }
            case 'j':
                result += pad(dayOfYear(date), 3);
                break;
            case 'k':
                result += padSpace(hour, 2);
                break;
            case 'l': {
                const hour12 = hour % 12 === 0 ? 12 : hour % 12;
                result += padSpace(hour12, 2);
                break;
            }
            case 'm':
                result += pad(month + 1, 2);
                break;
            case 'M':
                result += pad(minute, 2);
                break;
            case 'n':
                result += '\n';
                break;
            case 'p':
                result += hour < 12 ? 'AM' : 'PM';
                break;
            case 'P':
                result += hour < 12 ? 'am' : 'pm';
                break;
            case 'r': {
                const hour12 = hour % 12 === 0 ? 12 : hour % 12;
                const suffix = hour < 12 ? 'AM' : 'PM';
                result += `${pad(hour12, 2)}:${pad(minute, 2)}:${pad(second, 2)} ${suffix}`;
                break;
            }
            case 'R':
                result += `${pad(hour, 2)}:${pad(minute, 2)}`;
                break;
            case 'S':
                result += pad(second, 2);
                break;
            case 's':
                result += String(Math.floor(date.getTime() / 1000));
                break;
            case 't':
                result += '\t';
                break;
            case 'T':
                result += `${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
                break;
            case 'u': {
                const isoDay = weekday === 0 ? 7 : weekday;
                result += String(isoDay);
                break;
            }
            case 'U':
                result += pad(weekNumberSunday(date), 2);
                break;
            case 'V':
                result += pad(isoWeekNum, 2);
                break;
            case 'w':
                result += String(weekday);
                break;
            case 'W':
                result += pad(weekNumberMonday(date), 2);
                break;
            case 'x':
                result += `${pad(month + 1, 2)}/${pad(day, 2)}/${pad(year % 100, 2)}`;
                break;
            case 'X':
                result += `${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
                break;
            case 'y':
                result += pad(year % 100, 2);
                break;
            case 'Y':
                result += pad(year, 4);
                break;
            case 'z': {
                const offsetMinutes = -date.getTimezoneOffset();
                const sign = offsetMinutes >= 0 ? '+' : '-';
                const absMinutes = Math.abs(offsetMinutes);
                const offsetHours = Math.floor(absMinutes / 60);
                const offsetRemain = absMinutes % 60;
                result += `${sign}${pad(offsetHours, 2)}${pad(offsetRemain, 2)}`;
                break;
            }
            case 'Z':
                result += timezoneName(date);
                break;
            case '%':
                result += '%';
                break;
            default:
                result += `%${next}`;
        }
    }

    return result;
}
