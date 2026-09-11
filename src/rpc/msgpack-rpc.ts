type ReadableStreamHandle = {
    on(event: 'data', listener: (data: Uint8Array) => void): void;
    removeListener(event: 'data', listener: (data: Uint8Array) => void): void;
};

type WritableStreamHandle = {
    write(data: Uint8Array): boolean;
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
};

type NotificationListener = (args: unknown[]) => void;

const INCOMPLETE = new Error('Incomplete msgpack value');
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
    const result = new Uint8Array(left.length + right.length);
    result.set(left);
    result.set(right, left.length);
    return result;
}

function encodeLength(
    prefix: number,
    marker: number,
    length: number,
): number[] {
    if (length < prefix) return [marker + length];
    if (length <= 0xffff)
        return [
            marker === 0x90 ? 0xdc : 0xde,
            (length >>> 8) & 0xff,
            length & 0xff,
        ];
    return [
        marker === 0x90 ? 0xdd : 0xdf,
        (length >>> 24) & 0xff,
        (length >>> 16) & 0xff,
        (length >>> 8) & 0xff,
        length & 0xff,
    ];
}

function encodeValue(value: unknown): number[] {
    if (value === null || value === undefined) return [0xc0];
    if (value === false) return [0xc2];
    if (value === true) return [0xc3];
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= 0 && value <= 0x7f)
            return [value];
        if (Number.isInteger(value) && value >= -32 && value < 0)
            return [0x100 + value];
        if (Number.isInteger(value) && value >= 0 && value <= 0xff)
            return [0xcc, value];
        if (Number.isInteger(value) && value >= 0 && value <= 0xffff)
            return [0xcd, (value >>> 8) & 0xff, value & 0xff];
        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        view.setUint8(0, 0xcb);
        view.setFloat64(1, value);
        return Array.from(new Uint8Array(buffer));
    }
    if (typeof value === 'string') {
        const bytes = textEncoder.encode(value);
        const header =
            bytes.length < 32
                ? [0xa0 + bytes.length]
                : bytes.length <= 0xff
                  ? [0xd9, bytes.length]
                  : bytes.length <= 0xffff
                    ? [0xda, (bytes.length >>> 8) & 0xff, bytes.length & 0xff]
                    : [
                          0xdb,
                          (bytes.length >>> 24) & 0xff,
                          (bytes.length >>> 16) & 0xff,
                          (bytes.length >>> 8) & 0xff,
                          bytes.length & 0xff,
                      ];
        return [...header, ...bytes];
    }
    if (Array.isArray(value)) {
        return [
            ...encodeLength(16, 0x90, value.length),
            ...value.flatMap(encodeValue),
        ];
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        return [
            ...encodeLength(16, 0x80, entries.length),
            ...entries.flatMap(([key, entry]) => [
                ...encodeValue(key),
                ...encodeValue(entry),
            ]),
        ];
    }
    throw new Error(`Unsupported msgpack value: ${typeof value}`);
}

function requireBytes(data: Uint8Array, offset: number, count: number): void {
    if (offset + count > data.length) throw INCOMPLETE;
}

function readLength(
    data: Uint8Array,
    offset: number,
    bytes: 1 | 2 | 4,
): [number, number] {
    requireBytes(data, offset, bytes);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (bytes === 1) return [view.getUint8(offset), offset + 1];
    if (bytes === 2) return [view.getUint16(offset), offset + 2];
    return [view.getUint32(offset), offset + 4];
}

function decodeString(
    data: Uint8Array,
    offset: number,
    length: number,
): [string, number] {
    requireBytes(data, offset, length);
    return [
        textDecoder.decode(data.subarray(offset, offset + length)),
        offset + length,
    ];
}

function decodeArray(
    data: Uint8Array,
    offset: number,
    length: number,
): [unknown[], number] {
    const result: unknown[] = [];
    let cursor = offset;
    for (let index = 0; index < length; index++) {
        const [value, next] = decodeValue(data, cursor);
        result.push(value);
        cursor = next;
    }
    return [result, cursor];
}

function decodeMap(
    data: Uint8Array,
    offset: number,
    length: number,
): [Record<string, unknown>, number] {
    const result: Record<string, unknown> = {};
    let cursor = offset;
    for (let index = 0; index < length; index++) {
        const [key, afterKey] = decodeValue(data, cursor);
        const [value, afterValue] = decodeValue(data, afterKey);
        result[String(key)] = value;
        cursor = afterValue;
    }
    return [result, cursor];
}

function decodeExtension(
    data: Uint8Array,
    offset: number,
    length: number,
): [unknown, number] {
    requireBytes(data, offset, length + 1);
    const payload = data.subarray(offset + 1, offset + 1 + length);
    if (length <= 4) {
        let value = 0;
        for (const byte of payload) value = value * 0x100 + byte;
        return [value, offset + length + 1];
    }
    return [payload.slice(), offset + length + 1];
}

function decodeValue(data: Uint8Array, offset: number): [unknown, number] {
    requireBytes(data, offset, 1);
    const marker = data[offset];
    if (marker === undefined) throw INCOMPLETE;
    if (marker <= 0x7f) return [marker, offset + 1];
    if (marker >= 0xe0) return [marker - 0x100, offset + 1];
    if (marker >= 0xa0 && marker <= 0xbf)
        return decodeString(data, offset + 1, marker & 0x1f);
    if (marker >= 0x90 && marker <= 0x9f)
        return decodeArray(data, offset + 1, marker & 0x0f);
    if (marker >= 0x80 && marker <= 0x8f)
        return decodeMap(data, offset + 1, marker & 0x0f);

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    switch (marker) {
        case 0xc0:
            return [null, offset + 1];
        case 0xc2:
            return [false, offset + 1];
        case 0xc3:
            return [true, offset + 1];
        case 0xc7: {
            const [length, next] = readLength(data, offset + 1, 1);
            return decodeExtension(data, next, length);
        }
        case 0xc8: {
            const [length, next] = readLength(data, offset + 1, 2);
            return decodeExtension(data, next, length);
        }
        case 0xc9: {
            const [length, next] = readLength(data, offset + 1, 4);
            return decodeExtension(data, next, length);
        }
        case 0xca:
            requireBytes(data, offset + 1, 4);
            return [view.getFloat32(offset + 1), offset + 5];
        case 0xcb:
            requireBytes(data, offset + 1, 8);
            return [view.getFloat64(offset + 1), offset + 9];
        case 0xcc:
            requireBytes(data, offset + 1, 1);
            return [view.getUint8(offset + 1), offset + 2];
        case 0xcd:
            requireBytes(data, offset + 1, 2);
            return [view.getUint16(offset + 1), offset + 3];
        case 0xce:
            requireBytes(data, offset + 1, 4);
            return [view.getUint32(offset + 1), offset + 5];
        case 0xcf:
            requireBytes(data, offset + 1, 8);
            return [Number(view.getBigUint64(offset + 1)), offset + 9];
        case 0xd0:
            requireBytes(data, offset + 1, 1);
            return [view.getInt8(offset + 1), offset + 2];
        case 0xd1:
            requireBytes(data, offset + 1, 2);
            return [view.getInt16(offset + 1), offset + 3];
        case 0xd2:
            requireBytes(data, offset + 1, 4);
            return [view.getInt32(offset + 1), offset + 5];
        case 0xd3:
            requireBytes(data, offset + 1, 8);
            return [Number(view.getBigInt64(offset + 1)), offset + 9];
        case 0xd4:
            return decodeExtension(data, offset + 1, 1);
        case 0xd5:
            return decodeExtension(data, offset + 1, 2);
        case 0xd6:
            return decodeExtension(data, offset + 1, 4);
        case 0xd7:
            return decodeExtension(data, offset + 1, 8);
        case 0xd8:
            return decodeExtension(data, offset + 1, 16);
        case 0xd9: {
            const [length, next] = readLength(data, offset + 1, 1);
            return decodeString(data, next, length);
        }
        case 0xda: {
            const [length, next] = readLength(data, offset + 1, 2);
            return decodeString(data, next, length);
        }
        case 0xdb: {
            const [length, next] = readLength(data, offset + 1, 4);
            return decodeString(data, next, length);
        }
        case 0xdc: {
            const [length, next] = readLength(data, offset + 1, 2);
            return decodeArray(data, next, length);
        }
        case 0xdd: {
            const [length, next] = readLength(data, offset + 1, 4);
            return decodeArray(data, next, length);
        }
        case 0xde: {
            const [length, next] = readLength(data, offset + 1, 2);
            return decodeMap(data, next, length);
        }
        case 0xdf: {
            const [length, next] = readLength(data, offset + 1, 4);
            return decodeMap(data, next, length);
        }
        default:
            throw new Error(
                `Unsupported msgpack marker: 0x${marker.toString(16)}`,
            );
    }
}

function formatRpcError(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    try {
        return JSON.stringify(error) ?? 'Unknown RPC error';
    } catch {
        return 'Unknown RPC error';
    }
}

export class MsgpackRpcClient {
    private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
    private nextRequestId = 1;
    private readonly pending = new Map<number, PendingRequest>();
    private readonly notificationListeners = new Map<
        string,
        Set<NotificationListener>
    >();
    private disposed = false;
    private readonly onData = (data: Uint8Array): void => {
        this.buffer = concatBytes(this.buffer, data);
        while (this.buffer.length > 0) {
            try {
                const [message, offset] = decodeValue(this.buffer, 0);
                this.buffer = this.buffer.slice(offset);
                this.handleMessage(message);
            } catch (error) {
                if (error === INCOMPLETE) return;
                this.dispose(
                    error instanceof Error ? error : new Error(String(error)),
                );
                return;
            }
        }
    };

    constructor(
        private readonly input: WritableStreamHandle,
        private readonly output: ReadableStreamHandle,
    ) {
        output.on('data', this.onData);
    }

    request(method: string, args: unknown[]): Promise<unknown> {
        if (this.disposed)
            return Promise.reject(new Error('RPC client closed'));
        const requestId = this.nextRequestId++;
        return new Promise((resolve, reject) => {
            this.pending.set(requestId, { resolve, reject });
            try {
                this.input.write(
                    new Uint8Array(encodeValue([0, requestId, method, args])),
                );
            } catch (error) {
                this.pending.delete(requestId);
                reject(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        });
    }

    notify(method: string, args: unknown[]): void {
        if (this.disposed) return;
        this.input.write(new Uint8Array(encodeValue([2, method, args])));
    }

    onNotification(method: string, listener: NotificationListener): () => void {
        const listeners = this.notificationListeners.get(method) ?? new Set();
        listeners.add(listener);
        this.notificationListeners.set(method, listeners);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) this.notificationListeners.delete(method);
        };
    }

    dispose(reason = new Error('RPC client closed')): void {
        if (this.disposed) return;
        this.disposed = true;
        this.output.removeListener('data', this.onData);
        for (const request of this.pending.values()) request.reject(reason);
        this.pending.clear();
        this.notificationListeners.clear();
        this.buffer = new Uint8Array();
    }

    private handleMessage(message: unknown): void {
        if (!Array.isArray(message)) return;
        const values = message as unknown[];
        if (values[0] === 2) {
            const method = values[1];
            const args = values[2];
            if (typeof method !== 'string' || !Array.isArray(args)) return;
            for (const listener of this.notificationListeners.get(method) ?? [])
                listener(args);
            return;
        }
        if (values[0] !== 1) return;
        const requestId = values[1];
        if (typeof requestId !== 'number') return;
        const request = this.pending.get(requestId);
        if (!request) return;
        this.pending.delete(requestId);
        const error = values[2];
        if (error !== null && error !== undefined) {
            request.reject(
                new Error(`Neovim RPC error: ${formatRpcError(error)}`),
            );
        } else {
            request.resolve(values[3]);
        }
    }
}
