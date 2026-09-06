import { to_jsstring, to_luastring } from '../lib/fengari';

// Neovim src/nvim/keycodes.h and special_to_buf() in keycodes.c.
// These are bytes in Lua strings, NOT UTF-8 encodings of U+0080/U+00FC.
const SPECIAL = 0x80;
const MODIFIER = 0xfc;
const specialKeys: Record<string, readonly [number, number]> = {
    bs: [0x6b, 0x62],
    del: [0x6b, 0x44],
    up: [0x6b, 0x75],
    down: [0x6b, 0x64],
    left: [0x6b, 0x6c],
    right: [0x6b, 0x72],
    home: [0x6b, 0x68],
    end: [0x40, 0x37],
    pageup: [0x6b, 0x50],
    pagedown: [0x6b, 0x4e],
    insert: [0x6b, 0x49],
    f1: [0x6b, 0x31],
    f2: [0x6b, 0x32],
    f3: [0x6b, 0x33],
    f4: [0x6b, 0x34],
    f5: [0x6b, 0x35],
    f6: [0x6b, 0x36],
    f7: [0x6b, 0x37],
    f8: [0x6b, 0x38],
    f9: [0x6b, 0x39],
    f10: [0x6b, 0x3b],
    f11: [0x46, 0x31],
    f12: [0x46, 0x32],
};
const aliases: Record<string, string> = {
    enter: 'cr',
    return: 'cr',
    escape: 'esc',
    backspace: 'bs',
    delete: 'del',
    ins: 'insert',
    lf: 'nl',
    newline: 'nl',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
};
const characters: Record<string, string> = {
    cr: '\r',
    esc: '\x1b',
    tab: '\t',
    space: ' ',
    nl: '\n',
    lt: '<',
    bslash: '\\',
    bar: '|',
    nul: '\0',
};
const canonical: Record<string, string> = {
    bs: 'BS',
    del: 'Del',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    insert: 'Ins',
};

function lookup<T>(table: Record<string, T>, key: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(table, key)
        ? table[key]
        : undefined;
}

function escapeBytes(bytes: Uint8Array): number[] {
    const result: number[] = [];
    for (const byte of bytes) {
        if (byte === SPECIAL) result.push(SPECIAL, 0xfe, 0x58);
        else if (byte === 0) result.push(SPECIAL, 0xff, 0x58);
        else result.push(byte);
    }
    return result;
}

function encodeKey(notation: string): number[] | null {
    let name = notation.slice(1, -1);
    let modifiers = 0;
    while (/^[CSAM]-/i.test(name)) {
        const modifier = name[0]!.toLowerCase();
        modifiers |= modifier === 's' ? 2 : modifier === 'c' ? 4 : 8;
        name = name.slice(2);
    }
    const lower = name.toLowerCase();
    const normalized = lookup(aliases, lower) ?? lower;
    let special = lookup(specialKeys, normalized);
    let character =
        lookup(characters, normalized) ??
        (Array.from(name).length === 1 ? name : null);
    if (!special && character === null) return null;

    if (modifiers & 2) {
        if (normalized === 'tab') {
            special = [0x6b, 0x42];
            modifiers &= ~2;
        } else if (/^f(?:[1-9]|1[0-2])$/.test(normalized)) {
            special = [0xfd, 5 + Number(normalized.slice(1))];
            modifiers &= ~2;
        } else if (
            character !== null &&
            /^[a-z]$/i.test(character) &&
            !(modifiers & 4)
        ) {
            character = character.toUpperCase();
            modifiers &= ~2;
        }
    }
    if (modifiers & 4 && character !== null) {
        if (/^[a-z]$/i.test(character) || '@[\\]^_'.includes(character)) {
            character = String.fromCharCode(
                character.toUpperCase().charCodeAt(0) & 0x1f,
            );
            modifiers &= ~4;
        } else if (character === ' ') {
            character = '\0';
            modifiers &= ~4;
        } else if (character === '?') {
            character = '\x7f';
            modifiers &= ~4;
        }
    }
    const bytes = special
        ? [SPECIAL, ...special]
        : escapeBytes(to_luastring(character ?? ''));
    return modifiers ? [SPECIAL, MODIFIER, modifiers, ...bytes] : bytes;
}

export function replaceTermcodes(
    input: Uint8Array,
    doLt: boolean,
    special: boolean,
): Uint8Array {
    const result: number[] = [];
    let end = input.indexOf(0x3e);
    for (let i = 0; i < input.length; i++) {
        if (input[i] === 0x3c) {
            if (end !== -1 && end < i) end = input.indexOf(0x3e, i + 1);
            // Bound candidate parsing; arbitrary unknown text remains literal.
            if (end !== -1 && end - i <= 64) {
                const notation = to_jsstring(input, i, end + 1, true);
                const isLt = notation.toLowerCase() === '<lt>';
                // do_lt remains useful even with special=false in this shim.
                // Neovim itself requires both flags for <lt> expansion.
                const bytes = isLt
                    ? doLt
                        ? [0x3c]
                        : null
                    : special
                      ? encodeKey(notation)
                      : null;
                if (bytes) {
                    result.push(...bytes);
                    i = end;
                    continue;
                }
            }
        }
        result.push(...escapeBytes(input.subarray(i, i + 1)));
    }
    return new Uint8Array(result);
}

const decodedSpecial = new Map(
    Object.entries(specialKeys).map(([name, [a, b]]) => [
        a * 256 + b,
        canonical[name] ?? name.toUpperCase(),
    ]),
);
decodedSpecial.set(0x6b42, 'S-Tab');
for (let i = 1; i <= 12; i++) decodedSpecial.set(0xfd00 + 5 + i, `S-F${i}`);

function controlKey(byte: number): string | null {
    switch (byte) {
        case 0:
            return 'C-@';
        case 9:
            return 'Tab';
        case 10:
            return 'C-j';
        case 13:
            return 'CR';
        case 27:
            return 'Esc';
        case 28:
            return 'C-\\';
        case 29:
            return 'C-]';
        case 30:
            return 'C-^';
        case 31:
            return 'C-_';
        case 127:
            return 'BS';
        default:
            return byte < 32 ? `C-${String.fromCharCode(byte + 96)}` : null;
    }
}

/** Convert internal byte strings at the boundary to the fork's notation API.
 * Keymaps accept notation too; feedkeys accepts literal text/internal codes.
 */
export function termcodesToNotation(
    input: Uint8Array,
    keepNotation = false,
): string {
    const output: string[] = [];
    const text: number[] = [];
    let modifiers = 0;
    const flush = (): void => {
        if (!text.length) return;
        const value = to_jsstring(new Uint8Array(text));
        output.push(keepNotation ? value : value.replace(/</g, '<lt>'));
        text.length = 0;
    };
    const emit = (key: string): void => {
        flush();
        const prefix = `${modifiers & 4 ? 'C-' : ''}${modifiers & 8 ? 'A-' : ''}${modifiers & 2 ? 'S-' : ''}`;
        output.push(`<${prefix}${key}>`);
        modifiers = 0;
    };
    for (let i = 0; i < input.length; i++) {
        let byte = input[i]!;
        if (byte === SPECIAL && i + 2 < input.length) {
            const a = input[i + 1]!;
            const b = input[i + 2]!;
            if (a === MODIFIER) {
                modifiers = b;
                i += 2;
                continue;
            }
            if ((a === 0xfe || a === 0xff) && b === 0x58) {
                byte = a === 0xfe ? SPECIAL : 0;
                i += 2;
            } else {
                const key = decodedSpecial.get(a * 256 + b);
                if (key) {
                    emit(key);
                    i += 2;
                    continue;
                }
            }
        }
        const key = controlKey(byte);
        if (key) emit(key);
        else if (modifiers && byte < 128) emit(String.fromCharCode(byte));
        else text.push(byte);
    }
    flush();
    return output.join('');
}
