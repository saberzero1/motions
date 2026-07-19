import { describe, expect, it, beforeEach } from 'vitest';

import { UndoTree } from '../../src/vim/undo-tree';
import type { SerializedUndoTree } from '../../src/vim/undo-tree';

describe('UndoTree', () => {
    let tree: UndoTree;

    beforeEach(() => {
        tree = new UndoTree();
    });

    describe('recordEdit', () => {
        it('records an edit with incrementing seq numbers', () => {
            const first = tree.recordEdit({ inserted: 2, deleted: 0 });
            const second = tree.recordEdit({ inserted: 0, deleted: 1 });
            expect(first.seq).toBe(1);
            expect(second.seq).toBe(2);
        });

        it('stores change summary (inserted/deleted counts)', () => {
            const node = tree.recordEdit({ inserted: 5, deleted: 3 });
            expect(node.changeSummary).toEqual({ inserted: 5, deleted: 3 });
        });

        it('creates branch on undo + new edit', () => {
            // seq 0 (root) -> seq 1 -> seq 2
            tree.recordEdit({ inserted: 5, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 3, deleted: 0 }); // seq 2

            tree.undo(); // back to seq 1
            expect(tree.getCurrentSeq()).toBe(1);

            tree.recordEdit({ inserted: 7, deleted: 0 }); // seq 3, creates branch
            expect(tree.getCurrentSeq()).toBe(3);
            expect(tree.getNodeCount()).toBe(4); // root + 3 edits

            // Node 1 should have 2 children: seq 3 (first/new) and seq 2 (alt)
            const node1 = tree.getNode(1)!;
            expect(node1.children).toHaveLength(2);
            expect(node1.children[0]!.seq).toBe(3); // new branch is first
            expect(node1.children[1]!.seq).toBe(2); // old branch is second

            // altNext/altPrev linking
            expect(node1.children[0]!.altNext).toBe(node1.children[1]);
            expect(node1.children[1]!.altPrev).toBe(node1.children[0]);
        });

        it('new branch becomes first child and links old branch via altNext', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3

            const node1 = tree.getNode(1)!;
            expect(node1.children.map((child) => child.seq)).toEqual([3, 2]);
            expect(node1.children[0]!.altNext).toBe(node1.children[1]);
            expect(node1.children[1]!.altPrev).toBe(node1.children[0]);
        });

        it('links multiple branches at the same fork via altNext chain', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            tree.undo();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 4

            const node1 = tree.getNode(1)!;
            expect(node1.children.map((child) => child.seq)).toEqual([4, 3, 2]);
            expect(node1.children[0]!.altNext).toBe(node1.children[1]);
            expect(node1.children[1]!.altNext).toBe(node1.children[2]);
            expect(node1.children[1]!.altPrev).toBe(node1.children[0]);
            expect(node1.children[2]!.altPrev).toBe(node1.children[1]);
        });
    });

    describe('undo/redo', () => {
        it('undo() moves current to parent', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });
            const node = tree.undo();
            expect(node?.seq).toBe(1);
            expect(tree.getCurrentSeq()).toBe(1);
        });

        it('undo() returns null at root', () => {
            expect(tree.undo()).toBeNull();
        });

        it('redo() moves current to first child', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.undo();
            const node = tree.redo();
            expect(node?.seq).toBe(2);
            expect(tree.getCurrentSeq()).toBe(2);
        });

        it('redo() returns null when no children', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            expect(tree.redo()).toBeNull();
        });

        it('undo then redo returns to same node', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.undo();
            tree.redo();
            expect(tree.getCurrentSeq()).toBe(2);
        });
    });

    describe('navigateOlder/navigateNewer', () => {
        it('navigateOlder() finds highest seq less than current across branches', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3

            const older = tree.navigateOlder();
            expect(older?.seq).toBe(2);
            expect(tree.getCurrentSeq()).toBe(2);
        });

        it('navigateNewer() finds lowest seq greater than current across branches', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            tree.navigateToSeq(1);

            const newer = tree.navigateNewer();
            expect(newer?.seq).toBe(2);
            expect(tree.getCurrentSeq()).toBe(2);
        });

        it('navigateOlder() returns null at root (seq 0)', () => {
            expect(tree.navigateOlder()).toBeNull();
            expect(tree.getCurrentSeq()).toBe(0);
        });

        it('navigateNewer() returns null at head', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            expect(tree.navigateNewer()).toBeNull();
        });

        it('g- navigates chronologically across branches', () => {
            tree.recordEdit({ inserted: 5, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 3, deleted: 0 }); // seq 2
            tree.undo(); // back to seq 1
            tree.recordEdit({ inserted: 7, deleted: 0 }); // seq 3

            // Current is seq 3. Chronologically previous is seq 2 (on other branch).
            const older = tree.navigateOlder();
            expect(older).not.toBeNull();
            expect(older!.seq).toBe(2);
        });
    });

    describe('navigateToSeq', () => {
        it('navigates to existing seq', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            const node = tree.navigateToSeq(1);
            expect(node?.seq).toBe(1);
            expect(tree.getCurrentSeq()).toBe(1);
        });

        it('returns null for nonexistent seq', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            const node = tree.navigateToSeq(999);
            expect(node).toBeNull();
            expect(tree.getCurrentSeq()).toBe(1);
        });

        it('updates current correctly', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.navigateToSeq(1);
            expect(tree.getCurrentSeq()).toBe(1);
        });
    });

    describe('findByTime', () => {
        it('finds node closest to but not after target timestamp', () => {
            const root = tree.getRoot();
            root.timestamp = 1000;
            const node1 = tree.recordEdit({ inserted: 1, deleted: 0 });
            const node2 = tree.recordEdit({ inserted: 1, deleted: 0 });
            const node3 = tree.recordEdit({ inserted: 1, deleted: 0 });
            node1.timestamp = 2000;
            node2.timestamp = 3000;
            node3.timestamp = 4000;

            const found = tree.findByTime(3500);
            expect(found?.seq).toBe(2);
            expect(tree.getCurrentSeq()).toBe(2);
        });

        it('returns null if no node at or before target', () => {
            const root = tree.getRoot();
            root.timestamp = 5000;
            const node1 = tree.recordEdit({ inserted: 1, deleted: 0 });
            node1.timestamp = 6000;

            const found = tree.findByTime(4000);
            expect(found).toBeNull();
        });

        it('handles ties by preferring higher seq', () => {
            const root = tree.getRoot();
            root.timestamp = 1000;
            const node1 = tree.recordEdit({ inserted: 1, deleted: 0 });
            const node2 = tree.recordEdit({ inserted: 1, deleted: 0 });
            node1.timestamp = 8000;
            node2.timestamp = 8000;

            const found = tree.findByTime(8000);
            expect(found?.seq).toBe(2);
        });
    });

    describe('findByCount', () => {
        it('moves N steps older chronologically', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            const found = tree.findByCount(2, 'older');
            expect(found?.seq).toBe(1);
            expect(tree.getCurrentSeq()).toBe(1);
        });

        it('moves N steps newer chronologically', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            tree.navigateToSeq(1);
            const found = tree.findByCount(2, 'newer');
            expect(found?.seq).toBe(3);
            expect(tree.getCurrentSeq()).toBe(3);
        });

        it('returns null if count exceeds available nodes', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            const found = tree.findByCount(5, 'older');
            expect(found).toBeNull();
        });

        it('returns current for count 0', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            const found = tree.findByCount(0, 'older');
            expect(found?.seq).toBe(1);
        });
    });

    describe('toNeovimDict', () => {
        it('returns correct seq/time metadata and entry structure', () => {
            const root = tree.getRoot();
            root.timestamp = 1000;
            const node1 = tree.recordEdit({ inserted: 1, deleted: 0 });
            const node2 = tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.undo();
            const node3 = tree.recordEdit({ inserted: 1, deleted: 0 });

            node1.timestamp = 2000;
            node2.timestamp = 3000;
            node3.timestamp = 4000;

            tree.undo(); // current seq 1
            tree.markSaved(); // save seq 1
            tree.navigateToSeq(3);
            tree.markSaved(); // save seq 3
            tree.navigateToSeq(1);

            const dict = tree.toNeovimDict();

            expect(dict.seq_last).toBe(3);
            expect(dict.seq_cur).toBe(1);
            expect(dict.time_cur).toBe(2);
            expect(dict.save_last).toBe(2);
            expect(dict.save_cur).toBe(1);
            expect(dict.synced).toBe(1);

            expect(dict.entries.map((entry) => entry.seq)).toEqual([1, 3]);
            expect(dict.entries[0]?.time).toBe(2);
            expect(dict.entries[1]?.time).toBe(4);

            const headEntry = dict.entries[1]!;
            expect(headEntry.newhead).toBe(1);
            expect(headEntry.curhead).toBe(1);
            expect(headEntry.alt?.[0]?.seq).toBe(2);

            expect(dict.entries[0]?.save).toBe(1);
            expect(dict.entries[1]?.save).toBe(2);
        });
    });

    describe('prune', () => {
        it('prunes oldest leaf nodes when exceeding maxNodes', () => {
            const limited = new UndoTree(3);
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            limited.undo();
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 3, triggers prune

            expect(limited.getNode(2)).toBeUndefined();
            expect(limited.getNodeCount()).toBe(3);
        });

        it('never prunes root', () => {
            const limited = new UndoTree(3);
            limited.recordEdit({ inserted: 1, deleted: 0 });
            limited.recordEdit({ inserted: 1, deleted: 0 });
            limited.undo();
            limited.recordEdit({ inserted: 1, deleted: 0 });
            expect(limited.getNode(0)).toBeDefined();
        });

        it('never prunes current node or path to current', () => {
            const limited = new UndoTree(3);
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            limited.undo();
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 3

            const current = limited.getCurrent();
            expect(current.seq).toBe(3);
            expect(limited.getNode(1)).toBeDefined();
            expect(limited.getRoot()).toBeDefined();
        });

        it('never prunes head or path to head', () => {
            const limited = new UndoTree(4);
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            limited.undo();
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 4 triggers prune

            const head = limited.getHead();
            expect(head.seq).toBe(4);
            expect(limited.getNode(1)).toBeDefined();
            expect(limited.getNode(2)).toBeDefined();
        });

        it('keeps nodeCount at or below maxNodes after prune', () => {
            const limited = new UndoTree(3);
            limited.recordEdit({ inserted: 1, deleted: 0 });
            limited.recordEdit({ inserted: 1, deleted: 0 });
            limited.undo();
            limited.recordEdit({ inserted: 1, deleted: 0 });
            expect(limited.getNodeCount()).toBeLessThanOrEqual(3);
        });
    });

    describe('markSaved', () => {
        it('marks current node as saved', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.markSaved();
            const dict = tree.toNeovimDict();
            expect(dict.save_last).toBe(1);
            expect(dict.save_cur).toBe(1);
            expect(dict.synced).toBe(1);
            expect(dict.entries[0]?.save).toBe(1);
        });

        it('save state is reflected in toNeovimDict()', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo();
            tree.markSaved(); // seq 1 saved

            const dict = tree.toNeovimDict();
            expect(dict.entries[0]?.save).toBe(1);
            expect(dict.save_cur).toBe(1);
            expect(dict.synced).toBe(1);
        });
    });

    describe('serialize/deserialize', () => {
        it('round-trip empty tree (root only)', () => {
            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            expect(restored.getNodeCount()).toBe(1);
            expect(restored.getCurrentSeq()).toBe(0);
            expect(restored.getHead().seq).toBe(0);
        });

        it('round-trip linear tree (5 edits, no branches)', () => {
            for (let i = 0; i < 5; i++) {
                tree.recordEdit({ inserted: i + 1, deleted: 0 });
            }
            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            expect(restored.getNodeCount()).toBe(6); // root + 5
            expect(restored.getCurrentSeq()).toBe(5);
            expect(restored.getHead().seq).toBe(5);
            // Verify chain
            for (let i = 1; i <= 5; i++) {
                expect(restored.getNode(i)).toBeDefined();
                expect(restored.getNode(i)!.parent?.seq).toBe(i - 1);
            }
        });

        it('round-trip branched tree preserves children order and altNext/altPrev', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 2, deleted: 0 }); // seq 2
            tree.undo(); // back to 1
            tree.recordEdit({ inserted: 3, deleted: 0 }); // seq 3, branch

            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            expect(restored.getNodeCount()).toBe(4);

            const node1 = restored.getNode(1)!;
            expect(node1.children).toHaveLength(2);
            // children sorted desc by seq: [3, 2]
            expect(node1.children[0]!.seq).toBe(3);
            expect(node1.children[1]!.seq).toBe(2);
            // altNext/altPrev
            expect(node1.children[0]!.altNext).toBe(node1.children[1]);
            expect(node1.children[1]!.altPrev).toBe(node1.children[0]);
        });

        it('round-trip preserves saved flags', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.markSaved();
            tree.recordEdit({ inserted: 2, deleted: 0 });

            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            expect(restored.getNode(1)!.saved).toBe(true);
            expect(restored.getNode(2)!.saved).toBe(false);
        });

        it('round-trip preserves change summaries', () => {
            tree.recordEdit({ inserted: 10, deleted: 3 });
            tree.recordEdit(null);

            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            expect(restored.getNode(1)!.changeSummary).toEqual({
                inserted: 10,
                deleted: 3,
            });
            expect(restored.getNode(2)!.changeSummary).toBeNull();
        });

        it('round-trip preserves current and head pointers', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo(); // current = 1, head = 2

            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            expect(restored.getCurrentSeq()).toBe(1);
            expect(restored.getHead().seq).toBe(2);
        });

        it('round-trip produces identical toNeovimDict output', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 2, deleted: 0 });
            tree.undo();
            tree.recordEdit({ inserted: 3, deleted: 0 });
            tree.markSaved();

            const dictBefore = tree.toNeovimDict();
            const serialized = tree.serialize();
            const restored = UndoTree.deserialize(serialized, 1000);
            const dictAfter = restored.toNeovimDict();

            expect(dictAfter.seq_last).toBe(dictBefore.seq_last);
            expect(dictAfter.seq_cur).toBe(dictBefore.seq_cur);
            expect(dictAfter.save_last).toBe(dictBefore.save_last);
            expect(dictAfter.save_cur).toBe(dictBefore.save_cur);
            expect(dictAfter.synced).toBe(dictBefore.synced);
            expect(dictAfter.entries.length).toBe(dictBefore.entries.length);
        });

        it('deserialize with orphan parentSeq handles gracefully', () => {
            // Simulate corrupted data: a node references a non-existent parent
            const data: SerializedUndoTree = {
                nodes: [
                    {
                        seq: 0,
                        timestamp: 1000,
                        parentSeq: null,
                        saved: false,
                        changeSummary: null,
                    },
                    {
                        seq: 1,
                        timestamp: 2000,
                        parentSeq: 0,
                        saved: false,
                        changeSummary: { inserted: 1, deleted: 0 },
                    },
                    {
                        seq: 2,
                        timestamp: 3000,
                        parentSeq: 999,
                        saved: false,
                        changeSummary: { inserted: 1, deleted: 0 },
                    }, // orphan
                ],
                currentSeq: 1,
                headSeq: 1,
                seqCounter: 3,
            };
            const restored = UndoTree.deserialize(data, 1000);
            expect(restored.getNodeCount()).toBe(3);
            expect(restored.getNode(2)!.parent).toBeNull(); // orphan has no parent
        });
    });

    describe('findBySaveCount', () => {
        it('finds Nth saved node going older', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.markSaved();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            tree.markSaved();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 4

            // Current is seq 4, find 1st save going older → seq 3
            const found = tree.findBySaveCount(1, 'older');
            expect(found?.seq).toBe(3);
        });

        it('finds Nth saved node going newer', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.markSaved();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.markSaved();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3

            tree.navigateToSeq(0); // go to root
            // Find 2nd save going newer → seq 2
            const found = tree.findBySaveCount(2, 'newer');
            expect(found?.seq).toBe(2);
        });

        it('returns null when fewer than N saves exist (older)', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.markSaved();
            tree.recordEdit({ inserted: 1, deleted: 0 });

            const found = tree.findBySaveCount(2, 'older');
            expect(found).toBeNull();
        });

        it('returns null when fewer than N saves exist (newer)', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.navigateToSeq(0);

            const found = tree.findBySaveCount(1, 'newer');
            expect(found).toBeNull();
        });

        it('returns null when no saves exist', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });

            const found = tree.findBySaveCount(1, 'older');
            expect(found).toBeNull();
        });

        it('count=1 finds immediately adjacent save point', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.markSaved();
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3

            const found = tree.findBySaveCount(1, 'older');
            expect(found?.seq).toBe(2);
            expect(tree.getCurrentSeq()).toBe(2);
        });
    });

    describe('toNeovimDict — additional', () => {
        it('empty tree (root only)', () => {
            const dict = tree.toNeovimDict();
            expect(dict.seq_last).toBe(0);
            expect(dict.seq_cur).toBe(0);
            expect(dict.entries).toEqual([]);
        });

        it('linear tree has no alt arrays', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });

            const dict = tree.toNeovimDict();
            expect(dict.entries).toHaveLength(3);
            for (const entry of dict.entries) {
                expect(entry.alt).toBeUndefined();
            }
        });

        it('tree with no saves has save_last=0, save_cur=0', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            tree.recordEdit({ inserted: 1, deleted: 0 });

            const dict = tree.toNeovimDict();
            expect(dict.save_last).toBe(0);
            expect(dict.save_cur).toBe(0);
        });

        it('timestamps are in seconds not milliseconds', () => {
            const node = tree.recordEdit({ inserted: 1, deleted: 0 });
            node.timestamp = 1700000000000; // ms

            const dict = tree.toNeovimDict();
            expect(dict.entries[0]!.time).toBe(1700000000); // seconds
        });
    });

    describe('recordEdit — edge cases', () => {
        it('recordEdit(null) stores null changeSummary', () => {
            const node = tree.recordEdit(null);
            expect(node.changeSummary).toBeNull();
        });

        it('multiple rapid edits maintain correct seq ordering', () => {
            const nodes = [];
            for (let i = 0; i < 10; i++) {
                nodes.push(tree.recordEdit({ inserted: 1, deleted: 0 }));
            }
            for (let i = 0; i < nodes.length; i++) {
                expect(nodes[i]!.seq).toBe(i + 1);
            }
        });

        it('branches at different depths', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            tree.undo();
            tree.undo(); // back to seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 4, branch at depth 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 5
            tree.undo(); // back to seq 4
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 6, branch at depth 2

            expect(tree.getNodeCount()).toBe(7);
            const node1 = tree.getNode(1)!;
            expect(node1.children).toHaveLength(2); // branch at depth 1
            const node4 = tree.getNode(4)!;
            expect(node4.children).toHaveLength(2); // branch at depth 2
        });
    });

    describe('prune — edge cases', () => {
        it('prune is no-op when all leaves are protected', () => {
            // Tree: root → 1 → 2 (head and current)
            // maxNodes=2 but both paths are protected
            const limited = new UndoTree(2);
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            // nodeCount=3, maxNodes=2, but seq 1 is on path to head AND current
            // so nothing can be pruned
            expect(limited.getNodeCount()).toBe(3); // can't go below
        });

        it('pruned nodes are absent from getNode and getAllNodes', () => {
            const limited = new UndoTree(3);
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            limited.undo();
            limited.recordEdit({ inserted: 1, deleted: 0 }); // seq 3, prunes seq 2

            expect(limited.getNode(2)).toBeUndefined();
            const allSeqs = limited.getAllNodes().map((n) => n.seq);
            expect(allSeqs).not.toContain(2);
        });
    });

    describe('computePath', () => {
        it('returns up/down segments for same-branch navigation', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3

            const path = tree.computePath(3, 1);
            expect(path).not.toBeNull();
            expect(path!.up.map((n) => n.seq)).toEqual([3, 2]);
            expect(path!.down).toEqual([]);
        });

        it('returns correct path for cross-branch navigation', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.undo(); // back to 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3 (branch)

            const path = tree.computePath(2, 3);
            expect(path).not.toBeNull();
            expect(path!.up.map((n) => n.seq)).toEqual([2]);
            expect(path!.down.map((n) => n.seq)).toEqual([3]);
        });

        it('returns empty up/down when from equals to', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            const path = tree.computePath(1, 1);
            expect(path).not.toBeNull();
            expect(path!.up).toEqual([]);
            expect(path!.down).toEqual([]);
        });

        it('returns null for nonexistent seq', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 });
            expect(tree.computePath(1, 999)).toBeNull();
            expect(tree.computePath(999, 1)).toBeNull();
        });

        it('handles path from root to leaf', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2

            const path = tree.computePath(0, 2);
            expect(path).not.toBeNull();
            expect(path!.up).toEqual([]);
            expect(path!.down.map((n) => n.seq)).toEqual([1, 2]);
        });

        it('handles deep cross-branch path', () => {
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 2
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 3
            tree.undo();
            tree.undo(); // back to 1
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 4
            tree.recordEdit({ inserted: 1, deleted: 0 }); // seq 5

            const path = tree.computePath(3, 5);
            expect(path).not.toBeNull();
            expect(path!.up.map((n) => n.seq)).toEqual([3, 2]);
            expect(path!.down.map((n) => n.seq)).toEqual([4, 5]);
        });
    });

    describe('navigating flag', () => {
        it('isNavigating defaults to false', () => {
            expect(tree.isNavigating()).toBe(false);
        });

        it('setNavigating changes the flag', () => {
            tree.setNavigating(true);
            expect(tree.isNavigating()).toBe(true);
            tree.setNavigating(false);
            expect(tree.isNavigating()).toBe(false);
        });
    });

    describe('recordEdit with ChangeSets', () => {
        it('stores changeSet and inverseChangeSet', () => {
            const mockChangeSet = { mock: 'forward' };
            const mockInverse = { mock: 'inverse' };
            const node = tree.recordEdit(
                { inserted: 1, deleted: 0 },
                mockChangeSet,
                mockInverse,
            );
            expect(node.changeSet).toBe(mockChangeSet);
            expect(node.inverseChangeSet).toBe(mockInverse);
        });

        it('defaults ChangeSets to null when not provided', () => {
            const node = tree.recordEdit({ inserted: 1, deleted: 0 });
            expect(node.changeSet).toBeNull();
            expect(node.inverseChangeSet).toBeNull();
        });
    });
});
