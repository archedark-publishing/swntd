import type {
  Commitment,
  RetrospectiveNote,
  Task
} from "../db/schema";
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

type RetrospectiveNoteAccessRecord = Pick<
  RetrospectiveNote,
  "authorUserId" | "householdId" | "visibilityState"
>;

type CommitmentAccessRecord = Pick<Commitment, "assigneeUserId" | "householdId">;

export function isAdminActor(actor: AuthenticatedActor) {
  return actor.role === "admin";
}

export function isServiceActor(actor: AuthenticatedActor) {
  return actor.role === "service";
}

export function canManageSettings(actor: AuthenticatedActor) {
  return isAdminActor(actor);
}

export function canReadTask(actor: AuthenticatedActor, task: TaskAccessRecord) {
  if (isAdminActor(actor)) {
    return true;
  }

  return canServiceActorMutateTask({
    actorId: actor.id,
    task
  });
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
  return canReadTask(actor, task);
}

export function canTransitionTask(
  actor: AuthenticatedActor,
  task: TaskAccessRecord
) {
  return canReadTask(actor, task);
}

export function canDownloadAttachment(
  actor: AuthenticatedActor,
  task: TaskAccessRecord
) {
  return canReadTask(actor, task);
}

export function canManageRetrospectives(actor: AuthenticatedActor) {
  return isAdminActor(actor);
}

export function canRevealRetrospectiveNotes(actor: AuthenticatedActor) {
  return canManageRetrospectives(actor);
}

export function canReadRetrospectiveNote(
  actor: AuthenticatedActor,
  note: RetrospectiveNoteAccessRecord
) {
  if (!isAdminActor(actor) || note.householdId !== actor.householdId) {
    return false;
  }

  if (note.visibilityState === "shared" || note.visibilityState === "revealed") {
    return true;
  }

  return note.authorUserId === actor.id;
}

export function canMutateRetrospectiveNote(
  actor: AuthenticatedActor,
  note: RetrospectiveNoteAccessRecord
) {
  if (!isAdminActor(actor) || note.householdId !== actor.householdId) {
    return false;
  }

  if (note.visibilityState === "shared" || note.visibilityState === "revealed") {
    return true;
  }

  return note.authorUserId === actor.id;
}

export function canReadCommitment(
  actor: AuthenticatedActor,
  commitment: CommitmentAccessRecord
) {
  return isAdminActor(actor) && commitment.householdId === actor.householdId;
}

export function canMutateCommitment(
  actor: AuthenticatedActor,
  commitment: CommitmentAccessRecord
) {
  return canReadCommitment(actor, commitment) && commitment.assigneeUserId === actor.id;
}
