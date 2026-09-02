export interface TarEntry {
    path: string;
    data: string;
}

const decoder = new TextDecoder();

function readString(buf: Uint8Array, offset: number, length: number): string {
    const slice = buf.subarray(offset, offset + length);
    const end = slice.indexOf(0);
    return decoder.decode(slice.subarray(0, end < 0 ? length : end));
}

export function parseTar(buf: Uint8Array): TarEntry[] {
    const entries: TarEntry[] = [];
    let offset = 0;

    while (offset + 512 <= buf.length) {
        const name = readString(buf, offset, 100);
        if (name === '') break;

        const prefix = readString(buf, offset + 345, 155);
        const size = parseInt(
            readString(buf, offset + 124, 12).trim() || '0',
            8,
        );
        const typeflag = buf[offset + 156];
        const isRegularFile = typeflag === 0x30 || typeflag === 0;

        offset += 512;

        if (isRegularFile && size > 0) {
            const fullPath = prefix ? `${prefix}/${name}` : name;
            const stripped = fullPath.replace(/^[^/]+\//, '');
            if (stripped) {
                entries.push({
                    path: stripped,
                    data: decoder.decode(buf.subarray(offset, offset + size)),
                });
            }
        }

        offset += Math.ceil(size / 512) * 512;
    }

    return entries;
}

export function filterLuaFiles(entries: TarEntry[]): TarEntry[] {
    return entries.filter(
        (e) => e.path.startsWith('lua/') && e.path.endsWith('.lua'),
    );
}
