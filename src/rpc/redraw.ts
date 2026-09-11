import type { MsgpackRpcClient } from './msgpack-rpc';

export type RedrawEventHandler = (args: unknown) => void;

export class NeovimRedrawDispatcher {
    private readonly handlers = new Map<string, Set<RedrawEventHandler>>();
    private notificationCleanup: (() => void) | null = null;

    constructor(private readonly rpc: MsgpackRpcClient) {}

    on(eventName: string, handler: RedrawEventHandler): () => void {
        const handlers = this.handlers.get(eventName) ?? new Set();
        handlers.add(handler);
        this.handlers.set(eventName, handlers);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) this.handlers.delete(eventName);
        };
    }

    start(): void {
        if (this.notificationCleanup) return;
        this.notificationCleanup = this.rpc.onNotification('redraw', (events) =>
            this.dispatch(events),
        );
    }

    dispose(): void {
        this.notificationCleanup?.();
        this.notificationCleanup = null;
        this.handlers.clear();
    }

    private dispatch(events: unknown[]): void {
        for (const event of events) {
            if (!Array.isArray(event) || typeof event[0] !== 'string') continue;
            const handlers = this.handlers.get(event[0]);
            if (!handlers) continue;
            for (let index = 1; index < event.length; index += 1) {
                for (const handler of handlers) handler(event[index]);
            }
        }
    }
}
