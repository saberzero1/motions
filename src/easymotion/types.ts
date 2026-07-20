export interface Target {
    line: number;
    ch: number;
    /** Number of characters in the match. Defaults to 1 if omitted. */
    matchLength?: number;
}

export interface LabeledTarget extends Target {
    label: string;
}

export interface VisibleRange {
    fromLine: number;
    toLine: number;
}
