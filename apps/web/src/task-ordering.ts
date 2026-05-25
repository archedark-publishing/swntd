import { arrayMove } from "@dnd-kit/sortable";
import { taskStatuses, type TaskListItem, type TaskStatus } from "./api";

type TaskPlacement = {
  tasks: TaskListItem[];
  updatedTask: TaskListItem;
};

export function applyOptimisticTaskPlacement(args: {
  targetIndex: number;
  targetStatus: TaskStatus;
  taskId: string;
  tasks: TaskListItem[];
}): TaskPlacement | null {
  const task = args.tasks.find((entry) => entry.id === args.taskId);

  if (!task) {
    return null;
  }

  const tasksByStatus = new Map<TaskStatus, TaskListItem[]>(
    taskStatuses.map((status) => [status, getTaskColumnOrder(args.tasks, status)])
  );

  if (task.status === args.targetStatus) {
    const columnTasks = tasksByStatus.get(task.status) ?? [];
    const currentIndex = columnTasks.findIndex((entry) => entry.id === task.id);

    if (currentIndex < 0) {
      return null;
    }

    const safeTargetIndex = Math.max(0, Math.min(args.targetIndex, columnTasks.length - 1));

    if (safeTargetIndex === currentIndex) {
      return null;
    }

    const reorderedColumn = arrayMove(columnTasks, currentIndex, safeTargetIndex).map((entry) =>
      entry.id === task.id ? { ...entry, revision: entry.revision + 1 } : entry
    );
    tasksByStatus.set(task.status, resequenceColumn(reorderedColumn, task.status));
  } else {
    const sourceColumn = (tasksByStatus.get(task.status) ?? []).filter(
      (entry) => entry.id !== task.id
    );
    const destinationColumn = [...(tasksByStatus.get(args.targetStatus) ?? [])];
    const safeTargetIndex = Math.max(0, Math.min(args.targetIndex, destinationColumn.length));
    const revisionDelta = safeTargetIndex === 0 ? 1 : 2;

    destinationColumn.splice(safeTargetIndex, 0, {
      ...task,
      revision: task.revision + revisionDelta,
      status: args.targetStatus
    });

    tasksByStatus.set(task.status, resequenceColumn(sourceColumn, task.status));
    tasksByStatus.set(
      args.targetStatus,
      resequenceColumn(destinationColumn, args.targetStatus)
    );
  }

  const nextTasks = taskStatuses.flatMap((status) => tasksByStatus.get(status) ?? []);
  const updatedTask = nextTasks.find((entry) => entry.id === task.id);

  if (!updatedTask) {
    return null;
  }

  return {
    tasks: nextTasks,
    updatedTask
  };
}

function getTaskColumnOrder(tasks: TaskListItem[], status: TaskStatus) {
  return tasks
    .filter((task) => task.status === status)
    .sort((left, right) => right.sortKey - left.sortKey);
}

function resequenceColumn(tasks: TaskListItem[], status: TaskStatus) {
  const highest = tasks.length * 1024;

  return tasks.map((task, index) => ({
    ...task,
    sortKey: highest - index * 1024,
    status
  }));
}
