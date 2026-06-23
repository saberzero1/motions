export interface Target {
    line: number;
    ch: number;
}

export interface LabeledTarget extends Target {
    label: string;
}

export interface VisibleRange {
    fromLine: number;
    toLine: number;
}
