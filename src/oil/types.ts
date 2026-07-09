export interface OilEntry {
    id: number;
    name: string;
    type: 'file' | 'folder';
    path: string;
    parentPath: string;
}

export interface ParsedLine {
    id: number;
    type: 'f' | 'd';
    name: string;
}

export interface OilDiff {
    creates: Array<{ name: string; parentPath: string; isFolder: boolean }>;
    deletes: Array<{ entry: OilEntry }>;
    renames: Array<{ entry: OilEntry; newName: string }>;
}

export interface OilMergedDiff extends OilDiff {
    moves: Array<{ entry: OilEntry; newParentPath: string; newName: string }>;
}

export type OilAction =
    | { type: 'create'; name: string; parentPath: string }
    | { type: 'createFolder'; name: string; parentPath: string }
    | { type: 'delete'; entry: OilEntry }
    | { type: 'rename'; entry: OilEntry; newName: string }
    | { type: 'move'; entry: OilEntry; newParentPath: string; newName: string };

export interface OilCommitResult {
    success: boolean;
    completed: OilAction[];
    failed: Array<{ action: OilAction; error: string }>;
    skipped: OilAction[];
}
