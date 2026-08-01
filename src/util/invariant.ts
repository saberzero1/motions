import { Notice } from 'obsidian';

export interface Violation {
    message: string;
    timestamp: number;
    stack?: string;
}

const MAX_VIOLATIONS = 200;
const violations: Violation[] = [];

let lastNoticeTime = 0;
const NOTICE_COOLDOWN = 5000;

export function invariant(
    condition: unknown,
    message: string,
): asserts condition {
    if (condition) return;

    const violation: Violation = {
        message,
        timestamp: Date.now(),
        stack: __DEV__ ? new Error().stack : undefined,
    };

    if (violations.length < MAX_VIOLATIONS) {
        violations.push(violation);
    }

    console.error(`[invariant] ${message}`);

    const now = Date.now();
    if (now - lastNoticeTime >= NOTICE_COOLDOWN) {
        lastNoticeTime = now;
        new Notice(`Vim Motions: invariant violation — ${message}`, 8000);
    }
}

export function devAssert(
    condition: unknown,
    message: string,
): asserts condition {
    if (!__DEV__) return;
    if (condition) return;

    const violation: Violation = {
        message: `[dev] ${message}`,
        timestamp: Date.now(),
        stack: new Error().stack,
    };

    if (violations.length < MAX_VIOLATIONS) {
        violations.push(violation);
    }

    console.warn(`[devAssert] ${message}`);
}

export function getViolations(): readonly Violation[] {
    return violations.slice();
}

export function clearViolations(): void {
    violations.length = 0;
}
