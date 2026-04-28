import { describe, expect, it } from "vitest";
import { createTaskFixture } from "./fixtures";
import {
  canAssignTasks,
  canAttachExternalLink,
  canCreateTask,
  canDownloadAttachment,
  canManageSettings,
  canManageRetrospectives,
  canMutateCommitment,
  canMutateRetrospectiveNote,
  canReadTask,
  canReadCommitment,
  canReadRetrospectiveNote,
  canRevealRetrospectiveNotes,
  canTransitionTask,
  canUploadBinaryAttachment,
  type AuthenticatedActor
} from "./authorization";

const adminActor: AuthenticatedActor = {
  id: "admin-1",
  householdId: "default-household",
  role: "admin",
  email: "admin@example.com",
  displayName: "Admin",
  serviceKind: null,
  authStrategy: "local_dev"
};

const serviceActor: AuthenticatedActor = {
  id: "service-1",
  householdId: "default-household",
  role: "service",
  email: null,
  displayName: "Household Assistant",
  serviceKind: "assistant",
  authStrategy: "service_token"
};

describe("authorization policies", () => {
  it("allows admins to manage all expected v1 actions", () => {
    const task = createTaskFixture();

    expect(canManageSettings(adminActor)).toBe(true);
    expect(canCreateTask(adminActor)).toBe(true);
    expect(canAssignTasks(adminActor)).toBe(true);
    expect(canManageRetrospectives(adminActor)).toBe(true);
    expect(canRevealRetrospectiveNotes(adminActor)).toBe(true);
    expect(canUploadBinaryAttachment(adminActor)).toBe(true);
    expect(canReadTask(adminActor, task)).toBe(true);
    expect(canAttachExternalLink(adminActor, task)).toBe(true);
    expect(canTransitionTask(adminActor, task)).toBe(true);
    expect(canDownloadAttachment(adminActor, task)).toBe(true);
  });

  it("limits service actors to eligible AI-enabled tasks or work assigned to them", () => {
    const eligibleTask = createTaskFixture({
      assigneeUserId: null,
      aiAssistanceEnabled: true
    });
    const assignedTask = createTaskFixture({
      assigneeUserId: "service-1",
      aiAssistanceEnabled: false
    });
    const ineligibleTask = createTaskFixture({
      assigneeUserId: "service-2",
      aiAssistanceEnabled: false
    });

    expect(canCreateTask(serviceActor)).toBe(false);
    expect(canAssignTasks(serviceActor)).toBe(false);
    expect(canManageSettings(serviceActor)).toBe(false);
    expect(canManageRetrospectives(serviceActor)).toBe(false);
    expect(canRevealRetrospectiveNotes(serviceActor)).toBe(false);
    expect(canUploadBinaryAttachment(serviceActor)).toBe(false);
    expect(canReadTask(serviceActor, eligibleTask)).toBe(true);
    expect(canReadTask(serviceActor, assignedTask)).toBe(true);
    expect(canAttachExternalLink(serviceActor, eligibleTask)).toBe(true);
    expect(canTransitionTask(serviceActor, assignedTask)).toBe(true);
    expect(canTransitionTask(serviceActor, eligibleTask)).toBe(true);
    expect(canDownloadAttachment(serviceActor, eligibleTask)).toBe(true);
    expect(canTransitionTask(serviceActor, ineligibleTask)).toBe(false);
  });

  it("keeps retrospective private notes author-only until reveal", () => {
    const otherAdminActor: AuthenticatedActor = {
      ...adminActor,
      id: "admin-2",
      email: "other@example.com"
    };
    const privateNote = {
      authorUserId: "admin-1",
      householdId: "default-household",
      visibilityState: "private_until_round" as const
    };
    const revealedNote = {
      ...privateNote,
      visibilityState: "revealed" as const
    };
    const privateForeverNote = {
      ...privateNote,
      visibilityState: "private" as const
    };

    expect(canReadRetrospectiveNote(adminActor, privateNote)).toBe(true);
    expect(canMutateRetrospectiveNote(adminActor, privateNote)).toBe(true);
    expect(canReadRetrospectiveNote(otherAdminActor, privateNote)).toBe(false);
    expect(canMutateRetrospectiveNote(otherAdminActor, privateForeverNote)).toBe(false);
    expect(canReadRetrospectiveNote(otherAdminActor, revealedNote)).toBe(true);
    expect(canMutateRetrospectiveNote(otherAdminActor, revealedNote)).toBe(true);
    expect(canReadRetrospectiveNote(serviceActor, revealedNote)).toBe(false);
  });

  it("limits commitments to admins in the same household", () => {
    const commitment = {
      householdId: "default-household"
    };
    const otherHouseholdAdmin = {
      ...adminActor,
      householdId: "other-household"
    };

    expect(canReadCommitment(adminActor, commitment)).toBe(true);
    expect(canMutateCommitment(adminActor, commitment)).toBe(true);
    expect(canReadCommitment(otherHouseholdAdmin, commitment)).toBe(false);
    expect(canMutateCommitment(serviceActor, commitment)).toBe(false);
  });
});
