export type DueState = "none" | "normal" | "near" | "past";

type DueStatusInput = {
  archivedAt?: string | null;
  dueOn: string | null;
  dueTime?: string | null;
};

export function getTaskDueState(
  task: DueStatusInput,
  nearDueThresholdDays: number,
  now = new Date()
): DueState {
  if (task.archivedAt || !task.dueOn) {
    return "none";
  }

  const dueAt = dueTimeToDate(task.dueOn, task.dueTime ?? null);

  if (!dueAt) {
    return "none";
  }

  const deltaMs = dueAt.getTime() - now.getTime();

  if (deltaMs < 0) {
    return "past";
  }

  if (deltaMs <= nearDueThresholdDays * 24 * 60 * 60 * 1000) {
    return "near";
  }

  return "normal";
}

function dueTimeToDate(dueOn: string, dueTime: string | null) {
  const dueAt = dueTime
    ? new Date(`${dueOn}T${dueTime}:00`)
    : new Date(`${dueOn}T23:59:59.999`);

  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
}
