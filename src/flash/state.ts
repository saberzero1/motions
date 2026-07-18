let flashActive = false;

export function isFlashActive(): boolean {
    return flashActive;
}

export function setFlashActive(active: boolean): void {
    flashActive = active;
}

export function cancelFlash(): void {
    flashActive = false;
}

interface LastFlashSearch {
    char: string;
    forward: boolean;
    isTill: boolean;
    timestamp: number;
}

let lastFlashSearch: LastFlashSearch | null = null;

const CLEVER_F_WINDOW_MS = 5000;

export function setLastFlashSearch(
    char: string,
    forward: boolean,
    isTill: boolean,
): void {
    lastFlashSearch = { char, forward, isTill, timestamp: Date.now() };
}

export function getLastFlashSearch(): LastFlashSearch | null {
    if (!lastFlashSearch) return null;
    if (Date.now() - lastFlashSearch.timestamp > CLEVER_F_WINDOW_MS) {
        lastFlashSearch = null;
        return null;
    }
    return lastFlashSearch;
}

export function clearLastFlashSearch(): void {
    lastFlashSearch = null;
}
