import { describe, expect, it } from "vitest";
import { createTaskFixture } from "./fixtures";
import {
  canAssignTasks,
  canAttachExternalLink,
  canCreateTask,
  canDownloadAttachment,
  canManageSettings,
  canReadTask,
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
    expect(canUploadBinaryAttachment(adminActor)).toBe(true);
    expect(canReadTask(adminActor, task)).toBe(true);
    expect(canAttachExternalLink(adminActor, task)).toBe(true);
    expect(canTransitionTask(adminActor, task)).toBe(true);
    expect(canDownloadAttachment(adminActor, task)).toBe(true);
  });

  it("limits service actors to eligible assigned tasks", () => {
    const eligibleTask = createTaskFixture({
      assigneeUserId: "service-1",
      aiAssistanceEnabled: true
    });
    const ineligibleTask = createTaskFixture({
      assigneeUserId: "service-1",
      aiAssistanceEnabled: false
    });

    expect(canCreateTask(serviceActor)).toBe(false);
    expect(canAssignTasks(serviceActor)).toBe(false);
    expect(canManageSettings(serviceActor)).toBe(false);
    expect(canUploadBinaryAttachment(serviceActor)).toBe(false);
    expect(canReadTask(serviceActor, eligibleTask)).toBe(true);
    expect(canAttachExternalLink(serviceActor, eligibleTask)).toBe(true);
    expect(canTransitionTask(serviceActor, eligibleTask)).toBe(true);
    expect(canDownloadAttachment(serviceActor, eligibleTask)).toBe(true);
    expect(canTransitionTask(serviceActor, ineligibleTask)).toBe(false);
  });
});
