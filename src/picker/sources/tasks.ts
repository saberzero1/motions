import { App, MarkdownView } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import { openInSplit } from './split-open';
import { navigateWithJump } from '../../workspace/navigate';

interface TaskLike {
    description: string;
    path: string;
    lineNumber: number;
    isDone: boolean;
    status: { symbol: string; type: string };
    priority: string;
    dueDate: { format?: (fmt: string) => string } | null;
    tags: string[];
}

interface TasksPluginLike {
    getTasks(): TaskLike[];
    getState(): string;
}

function getTasksPlugin(app: App): TasksPluginLike | undefined {
    const plugin = (app as unknown as Record<string, unknown>).plugins as
        | { plugins: Record<string, unknown> }
        | undefined;
    const tasks = plugin?.plugins?.['obsidian-tasks-plugin'] as
        | TasksPluginLike
        | undefined;
    if (tasks && typeof tasks.getTasks === 'function') {
        return tasks;
    }
    return undefined;
}

export function isTasksAvailable(app: App): boolean {
    return getTasksPlugin(app) !== undefined;
}

const STATUS_ORDER: Record<string, number> = {
    IN_PROGRESS: 0,
    TODO: 1,
    ON_HOLD: 2,
};

function formatDue(task: TaskLike): string {
    if (!task.dueDate) return '';
    try {
        return task.dueDate.format?.('YYYY-MM-DD') ?? '';
    } catch {
        return '';
    }
}

function statusGroup(type: string): string {
    switch (type) {
        case 'IN_PROGRESS':
            return 'In progress';
        case 'TODO':
            return 'To do';
        case 'ON_HOLD':
            return 'On hold';
        default:
            return type;
    }
}

export function createTasksSource(): PickerSource {
    let cachedItems: PickerItem[] | null = null;
    let eventRef: { unload?: () => void } | null = null;

    return {
        name: 'tasks',
        placeholder: 'Search tasks…',
        displayName: 'Tasks',
        icon: 'check-square',
        description: 'Navigate to incomplete tasks',
        priority: 21,

        items(app: App): PickerItem[] {
            if (cachedItems) return cachedItems;

            const plugin = getTasksPlugin(app);
            if (!plugin) return [];

            if (plugin.getState() !== 'Warm') return [];

            const allTasks = plugin.getTasks();
            const incomplete = allTasks.filter((t) => !t.isDone);

            incomplete.sort((a, b) => {
                const sa = STATUS_ORDER[a.status.type] ?? 99;
                const sb = STATUS_ORDER[b.status.type] ?? 99;
                if (sa !== sb) return sa - sb;
                const da = formatDue(a);
                const db = formatDue(b);
                if (da && db) return da.localeCompare(db);
                if (da) return -1;
                if (db) return 1;
                return a.description.localeCompare(b.description);
            });

            cachedItems = incomplete.map((task) => {
                const due = formatDue(task);
                const parts: string[] = [task.path];
                if (due) parts.push(`due: ${due}`);
                if (task.priority && task.priority !== '3') {
                    parts.push(`P${task.priority}`);
                }

                return {
                    id: `${task.path}:${task.lineNumber}`,
                    label: `[${task.status.symbol}] ${task.description}`,
                    description: parts.join('  ·  '),
                    filterValue: `${task.description} ${task.path} ${task.tags.join(' ')}`,
                    data: { path: task.path, line: task.lineNumber },
                    group: statusGroup(task.status.type),
                };
            });

            if (!eventRef) {
                try {
                    const ref = (
                        app.workspace as unknown as {
                            on(event: string, cb: () => void): unknown;
                        }
                    ).on('obsidian-tasks-plugin:cache-update', () => {
                        cachedItems = null;
                    });
                    eventRef = ref as { unload?: () => void };
                } catch {
                    /* noop */
                }
            }

            return cachedItems;
        },

        onSelect(item, app) {
            const data = item.data as { path: string; line: number };
            void navigateWithJump(app, data.path, '', {
                line: data.line,
                ch: 0,
            });
        },

        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string; line: number };
            openInSplit(app, data.path, direction);
            window.setTimeout(() => {
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    view.editor.setCursor(data.line, 0);
                    view.editor.focus();
                }
            }, 100);
        },

        async preview(item, app) {
            const data = item.data as { path: string; line: number };
            return readLinesAroundPosition(app, data.path, data.line);
        },
    };
}
