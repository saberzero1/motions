if (typeof globalThis.window === 'undefined') {
    const handler: ProxyHandler<typeof globalThis> = {
        get(_target, prop) {
            return (globalThis as Record<string | symbol, unknown>)[prop];
        },
    };
    (globalThis as Record<string, unknown>).window = new Proxy(
        globalThis,
        handler,
    );
}
