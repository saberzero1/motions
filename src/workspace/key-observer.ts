import { normalizeKeyEvent } from './global-mapping-registry';

type KeyObserver = (key: string) => void;

const observers = new Set<KeyObserver>();
const ignoredKeys = new Set([
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'AltGraph',
    'CapsLock',
    'Dead',
    'Process',
    'Unidentified',
]);

export function observeKeyEvent(event: KeyboardEvent): void {
    if (observers.size === 0 || event.isComposing || ignoredKeys.has(event.key))
        return;
    let key = normalizeKeyEvent(event);
    if (key === event.key && Array.from(key).length > 1) {
        key = `<${event.shiftKey ? 'S-' : ''}${key}>`;
    }
    dispatchObservedKey(key);
}

export function observeKeys(observer: KeyObserver): () => void {
    observers.add(observer);
    return () => {
        observers.delete(observer);
    };
}

/** Observation only: never consumes or changes the host's keyboard event. */
export function dispatchObservedKey(key: string): void {
    for (const observer of [...observers]) {
        try {
            observer(key);
        } catch (error) {
            console.error('Vim Motions: key observer failed', error);
        }
    }
}
