import type { Task } from "../db/schema";
import { canServiceActorMutateTask } from "./tasks";

export type AuthenticatedActor = {
  id: string;
  householdId: string;
  role: "admin" | "service";
  email: string | null;
  displayName: string;
  serviceKind: string | null;
  authStrategy: "local_dev" | "trusted_header" | "service_token";
};

type TaskAccessRecord = Pick<
  Task,
  "assigneeUserId" | "aiAssistanceEnabled" | "archivedAt"
>;

export function isAdminActor(actor: AuthenticatedActor) {
  return actor.role === "admin";
}

export function isServiceActor(actor: AuthenticatedActor) {
  return actor.role === "service";
}

export function canManageSettings(actor: AuthenticatedActor) {
  return isAdminActor(actor);
}

export function canCreateTask(actor: AuthenticatedActor) {
  return isAdminActor(actor);
}

export function canAssignTasks(actor: AuthenticatedActor) {
  return isAdminActor(actor);
}

export function canUploadBinaryAttachment(actor: AuthenticatedActor) {
  return isAdminActor(actor);
}

export function canAttachExternalLink(
  actor: AuthenticatedActor,
  task: TaskAccessRecord
) {
  if (isAdminActor(actor)) {
    return true;
  }

  return canServiceActorMutateTask({
    actorId: actor.id,
    task
  });
}

export function canTransitionTask(
  actor: AuthenticatedActor,
  task: TaskAccessRecord
) {
  if (isAdminActor(actor)) {
    return true;
  }

  return canServiceActorMutateTask({
    actorId: actor.id,
    task
  });
}

export function canDownloadAttachment(
  actor: AuthenticatedActor,
  task: TaskAccessRecord
) {
  if (isAdminActor(actor)) {
    return true;
  }

  return canServiceActorMutateTask({
    actorId: actor.id,
    task
  });
}
