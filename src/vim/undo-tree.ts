const DEFAULT_MAX_NODES = 1000;

function hasToJSON(value: unknown): value is { toJSON(): unknown } {
    return (
        value !== null &&
        typeof value === 'object' &&
        'toJSON' in value &&
        typeof (value as Record<string, unknown>).toJSON === 'function'
    );
}

export interface UndoNode {
    seq: number;
    timestamp: number;
    parent: UndoNode | null;
    children: UndoNode[];
    altNext: UndoNode | null;
    altPrev: UndoNode | null;
    saved: boolean;
    changeSummary: { inserted: number; deleted: number } | null;
    changeSet: unknown;
    inverseChangeSet: unknown;
    changeSetJson?: unknown;
    inverseChangeSetJson?: unknown;
}

export interface SerializedUndoNode {
    seq: number;
    timestamp: number;
    parentSeq: number | null;
    saved: boolean;
    changeSummary: { inserted: number; deleted: number } | null;
    changeSetJson?: unknown;
    inverseChangeSetJson?: unknown;
}

export interface SerializedUndoTree {
    nodes: SerializedUndoNode[];
    currentSeq: number;
    headSeq: number;
    seqCounter: number;
}

export interface NeovimUndoEntry {
    seq: number;
    time: number;
    newhead?: 1;
    curhead?: 1;
    save?: number;
    alt?: NeovimUndoEntry[];
}

export type UndoTreeCommandFn = () => UndoNode | null;

export class UndoTree {
    private root: UndoNode;
    private current: UndoNode;
    private head: UndoNode;
    private seqCounter: number;
    private nodeCount: number;
    private maxNodes: number;
    private nodeMap: Map<number, UndoNode>;
    private navigating = false;

    constructor(maxNodes: number = DEFAULT_MAX_NODES) {
        const now = Date.now();
        this.root = {
            seq: 0,
            timestamp: now,
            parent: null,
            children: [],
            altNext: null,
            altPrev: null,
            saved: false,
            changeSummary: null,
            changeSet: null,
            inverseChangeSet: null,
        };
        this.current = this.root;
        this.head = this.root;
        this.seqCounter = 1;
        this.nodeCount = 1;
        this.maxNodes = maxNodes;
        this.nodeMap = new Map([[this.root.seq, this.root]]);
    }

    recordEdit(
        summary: { inserted: number; deleted: number } | null,
        changeSet?: unknown,
        inverseChangeSet?: unknown,
    ): UndoNode {
        const parent = this.current;
        const node: UndoNode = {
            seq: this.seqCounter++,
            timestamp: Date.now(),
            parent,
            children: [],
            altNext: null,
            altPrev: null,
            saved: false,
            changeSummary: summary
                ? { inserted: summary.inserted, deleted: summary.deleted }
                : null,
            changeSet: changeSet ?? null,
            inverseChangeSet: inverseChangeSet ?? null,
        };

        if (parent.children.length > 0) {
            const oldFirst = parent.children[0];
            if (!oldFirst) {
                parent.children.push(node);
            } else {
                node.altNext = oldFirst;
                oldFirst.altPrev = node;
                parent.children.unshift(node);
            }
        } else {
            parent.children.push(node);
        }

        this.current = node;
        this.head = node;
        this.nodeMap.set(node.seq, node);
        this.nodeCount += 1;

        if (this.nodeCount > this.maxNodes) {
            this.prune();
        }

        return node;
    }

    serialize(): SerializedUndoTree {
        const nodes: SerializedUndoNode[] = [];
        for (const node of this.nodeMap.values()) {
            const sNode: SerializedUndoNode = {
                seq: node.seq,
                timestamp: node.timestamp,
                parentSeq: node.parent?.seq ?? null,
                saved: node.saved,
                changeSummary: node.changeSummary,
            };
            if (hasToJSON(node.changeSet)) {
                sNode.changeSetJson = node.changeSet.toJSON();
            }
            if (hasToJSON(node.inverseChangeSet)) {
                sNode.inverseChangeSetJson = node.inverseChangeSet.toJSON();
            }
            nodes.push(sNode);
        }
        return {
            nodes,
            currentSeq: this.current.seq,
            headSeq: this.head.seq,
            seqCounter: this.seqCounter,
        };
    }

    static deserialize(data: SerializedUndoTree, maxNodes: number): UndoTree {
        const tree = new UndoTree(maxNodes);
        tree.nodeMap.clear();
        tree.nodeCount = 0;

        const sorted = [...data.nodes].sort((a, b) => a.seq - b.seq);

        for (const sNode of sorted) {
            const node: UndoNode = {
                seq: sNode.seq,
                timestamp: sNode.timestamp,
                parent: null,
                children: [],
                altNext: null,
                altPrev: null,
                saved: sNode.saved,
                changeSummary: sNode.changeSummary,
                changeSet: null,
                inverseChangeSet: null,
                changeSetJson: sNode.changeSetJson ?? undefined,
                inverseChangeSetJson: sNode.inverseChangeSetJson ?? undefined,
            };
            tree.nodeMap.set(node.seq, node);
            tree.nodeCount++;
        }

        for (const sNode of sorted) {
            const node = tree.nodeMap.get(sNode.seq)!;
            if (sNode.parentSeq !== null) {
                const parent = tree.nodeMap.get(sNode.parentSeq);
                if (parent) {
                    node.parent = parent;
                    parent.children.push(node);
                }
            }
        }

        for (const node of tree.nodeMap.values()) {
            if (node.children.length > 1) {
                node.children.sort((a, b) => b.seq - a.seq);
                for (let i = 0; i < node.children.length - 1; i++) {
                    node.children[i]!.altNext = node.children[i + 1]!;
                    node.children[i + 1]!.altPrev = node.children[i]!;
                }
            }
        }

        tree.root = tree.nodeMap.get(0) ?? tree.root;
        tree.current = tree.nodeMap.get(data.currentSeq) ?? tree.root;
        tree.head = tree.nodeMap.get(data.headSeq) ?? tree.root;
        tree.seqCounter = data.seqCounter;

        return tree;
    }

    undo(): UndoNode | null {
        if (!this.current.parent) return null;
        this.current = this.current.parent;
        return this.current;
    }

    redo(): UndoNode | null {
        const next = this.current.children[0];
        if (!next) return null;
        this.current = next;
        return this.current;
    }

    isNavigating(): boolean {
        return this.navigating;
    }

    setNavigating(value: boolean): void {
        this.navigating = value;
    }

    markSaved(): void {
        this.current.saved = true;
    }

    navigateOlder(): UndoNode | null {
        const currentSeq = this.current.seq;
        let candidate: UndoNode | null = null;
        for (const node of this.nodeMap.values()) {
            if (node.seq >= currentSeq) continue;
            if (!candidate || node.seq > candidate.seq) {
                candidate = node;
            }
        }
        if (!candidate) return null;
        this.current = candidate;
        return candidate;
    }

    navigateNewer(): UndoNode | null {
        const currentSeq = this.current.seq;
        let candidate: UndoNode | null = null;
        for (const node of this.nodeMap.values()) {
            if (node.seq <= currentSeq) continue;
            if (!candidate || node.seq < candidate.seq) {
                candidate = node;
            }
        }
        if (!candidate) return null;
        this.current = candidate;
        return candidate;
    }

    navigateToSeq(targetSeq: number): UndoNode | null {
        const node = this.nodeMap.get(targetSeq);
        if (!node) return null;
        this.current = node;
        return node;
    }

    computePath(
        fromSeq: number,
        toSeq: number,
    ): {
        up: UndoNode[];
        down: UndoNode[];
    } | null {
        const fromNode = this.nodeMap.get(fromSeq);
        const toNode = this.nodeMap.get(toSeq);
        if (!fromNode || !toNode) return null;

        const fromAncestors = new Set<UndoNode>();
        let cursor: UndoNode | null = fromNode;
        while (cursor) {
            fromAncestors.add(cursor);
            cursor = cursor.parent;
        }

        let lca: UndoNode | null = null;
        cursor = toNode;
        while (cursor) {
            if (fromAncestors.has(cursor)) {
                lca = cursor;
                break;
            }
            cursor = cursor.parent;
        }

        if (!lca) return null;

        const up: UndoNode[] = [];
        cursor = fromNode;
        while (cursor && cursor !== lca) {
            up.push(cursor);
            cursor = cursor.parent;
        }

        const down: UndoNode[] = [];
        cursor = toNode;
        while (cursor && cursor !== lca) {
            down.push(cursor);
            cursor = cursor.parent;
        }
        down.reverse();

        return { up, down };
    }

    findByTime(targetTimestamp: number): UndoNode | null {
        let candidate: UndoNode | null = null;
        for (const node of this.nodeMap.values()) {
            if (node.timestamp > targetTimestamp) continue;
            if (
                !candidate ||
                node.timestamp > candidate.timestamp ||
                (node.timestamp === candidate.timestamp &&
                    node.seq > candidate.seq)
            ) {
                candidate = node;
            }
        }
        if (!candidate) return null;
        this.current = candidate;
        return candidate;
    }

    findByCount(count: number, direction: 'older' | 'newer'): UndoNode | null {
        if (count <= 0) return this.current;
        const nodes = this.getAllNodesSorted();
        const index = nodes.findIndex((node) => node.seq === this.current.seq);
        if (index === -1) return null;

        const targetIndex =
            direction === 'older' ? index - count : index + count;
        if (targetIndex < 0 || targetIndex >= nodes.length) return null;

        const target = nodes[targetIndex];
        if (!target) return null;
        this.current = target;
        return target;
    }

    findBySaveCount(
        count: number,
        direction: 'older' | 'newer',
    ): UndoNode | null {
        const nodes = this.getAllNodesSorted();
        const currentIdx = nodes.findIndex((n) => n.seq === this.current.seq);
        if (currentIdx === -1) return null;

        let found = 0;
        if (direction === 'older') {
            for (let i = currentIdx - 1; i >= 0; i--) {
                if (nodes[i]?.saved) {
                    found++;
                    if (found === count) {
                        this.current = nodes[i]!;
                        return nodes[i]!;
                    }
                }
            }
        } else {
            for (let i = currentIdx + 1; i < nodes.length; i++) {
                if (nodes[i]?.saved) {
                    found++;
                    if (found === count) {
                        this.current = nodes[i]!;
                        return nodes[i]!;
                    }
                }
            }
        }
        return null;
    }

    toNeovimDict(): {
        seq_last: number;
        seq_cur: number;
        time_cur: number;
        save_last: number;
        save_cur: number;
        synced: number;
        entries: NeovimUndoEntry[];
    } {
        const { saveNumbers, saveLast } = this.computeSaveNumbers();
        const curHead = this.getBranchHead(this.current);
        const entries = this.buildEntriesFromNode(
            this.root.children[0] ?? null,
            saveNumbers,
            curHead,
        );

        return {
            seq_last: this.head.seq,
            seq_cur: this.current.seq,
            time_cur: Math.floor(this.current.timestamp / 1000),
            save_last: saveLast,
            save_cur: saveNumbers.get(this.current) ?? 0,
            synced: this.current.saved ? 1 : 0,
            entries,
        };
    }

    prune(): void {
        if (this.nodeCount <= this.maxNodes) return;

        const protectedNodes = this.collectProtectedNodes();
        while (this.nodeCount > this.maxNodes) {
            const candidate = this.findOldestLeafCandidate(protectedNodes);
            if (!candidate) return;
            this.removeNode(candidate);
        }
    }

    getCurrentSeq(): number {
        return this.current.seq;
    }

    getNodeCount(): number {
        return this.nodeCount;
    }

    getNode(seq: number): UndoNode | undefined {
        return this.nodeMap.get(seq);
    }

    getRoot(): UndoNode {
        return this.root;
    }

    getCurrent(): UndoNode {
        return this.current;
    }

    getHead(): UndoNode {
        return this.head;
    }

    getAllNodes(): UndoNode[] {
        return this.getAllNodesSorted();
    }

    getUnresolvedChangeSets(): Array<{
        node: UndoNode;
        changeSetJson: unknown;
        inverseChangeSetJson: unknown;
    }> {
        const result: Array<{
            node: UndoNode;
            changeSetJson: unknown;
            inverseChangeSetJson: unknown;
        }> = [];
        for (const node of this.nodeMap.values()) {
            if (
                node.changeSetJson !== undefined ||
                node.inverseChangeSetJson !== undefined
            ) {
                result.push({
                    node,
                    changeSetJson: node.changeSetJson,
                    inverseChangeSetJson: node.inverseChangeSetJson,
                });
            }
        }
        return result;
    }

    resolveChangeSets(resolver: (json: unknown) => unknown): void {
        for (const node of this.nodeMap.values()) {
            if (node.changeSetJson !== undefined && !node.changeSet) {
                try {
                    node.changeSet = resolver(node.changeSetJson);
                    delete node.changeSetJson;
                } catch {
                    /* invalid JSON — skip */
                }
            }
            if (
                node.inverseChangeSetJson !== undefined &&
                !node.inverseChangeSet
            ) {
                try {
                    node.inverseChangeSet = resolver(node.inverseChangeSetJson);
                    delete node.inverseChangeSetJson;
                } catch {
                    /* invalid JSON — skip */
                }
            }
        }
    }

    private getAllNodesSorted(): UndoNode[] {
        return [...this.nodeMap.values()].sort((a, b) => a.seq - b.seq);
    }

    private getBranchHead(node: UndoNode): UndoNode {
        let cursor = node;
        while (cursor.children.length > 0) {
            const next = cursor.children[0];
            if (!next) break;
            cursor = next;
        }
        return cursor;
    }

    private buildEntriesFromNode(
        start: UndoNode | null,
        saveNumbers: Map<UndoNode, number>,
        curHead: UndoNode,
    ): NeovimUndoEntry[] {
        const entries: NeovimUndoEntry[] = [];
        let node = start;
        while (node) {
            entries.push(this.buildEntry(node, saveNumbers, curHead));
            node = node.children[0] ?? null;
        }
        return entries;
    }

    private buildEntry(
        node: UndoNode,
        saveNumbers: Map<UndoNode, number>,
        curHead: UndoNode,
    ): NeovimUndoEntry {
        const entry: NeovimUndoEntry = {
            seq: node.seq,
            time: Math.floor(node.timestamp / 1000),
        };

        if (node === this.head) {
            entry.newhead = 1;
        }

        if (node === curHead) {
            entry.curhead = 1;
        }

        const saveNumber = saveNumbers.get(node);
        if (saveNumber) {
            entry.save = saveNumber;
        }

        if (node.altNext) {
            entry.alt = this.buildEntriesFromNode(
                node.altNext,
                saveNumbers,
                curHead,
            );
        }

        return entry;
    }

    private computeSaveNumbers(): {
        saveNumbers: Map<UndoNode, number>;
        saveLast: number;
    } {
        const saveNumbers = new Map<UndoNode, number>();
        let saveIndex = 0;
        for (const node of this.getAllNodesSorted()) {
            if (!node.saved) continue;
            saveIndex += 1;
            saveNumbers.set(node, saveIndex);
        }
        return { saveNumbers, saveLast: saveIndex };
    }

    private collectProtectedNodes(): Set<UndoNode> {
        const protectedNodes = new Set<UndoNode>();
        let cursor: UndoNode | null = this.head;
        while (cursor) {
            protectedNodes.add(cursor);
            cursor = cursor.parent;
        }

        cursor = this.current;
        while (cursor) {
            protectedNodes.add(cursor);
            cursor = cursor.parent;
        }

        return protectedNodes;
    }

    private findOldestLeafCandidate(
        protectedNodes: Set<UndoNode>,
    ): UndoNode | null {
        let candidate: UndoNode | null = null;
        for (const node of this.nodeMap.values()) {
            if (node === this.root) continue;
            if (protectedNodes.has(node)) continue;
            if (node.children.length > 0) continue;
            if (!candidate || node.seq < candidate.seq) {
                candidate = node;
            }
        }
        return candidate;
    }

    private removeNode(node: UndoNode): void {
        const parent = node.parent;
        if (parent) {
            const index = parent.children.indexOf(node);
            if (index >= 0) {
                parent.children.splice(index, 1);
            }

            if (node.altPrev) {
                node.altPrev.altNext = node.altNext;
            }
            if (node.altNext) {
                node.altNext.altPrev = node.altPrev;
            }
        }

        node.altPrev = null;
        node.altNext = null;
        node.parent = null;
        this.nodeMap.delete(node.seq);
        this.nodeCount -= 1;
    }
}

export function createOlderUndoCommand(undoTree: UndoTree): UndoTreeCommandFn {
    return () => undoTree.navigateOlder();
}

export function createNewerUndoCommand(undoTree: UndoTree): UndoTreeCommandFn {
    return () => undoTree.navigateNewer();
}
