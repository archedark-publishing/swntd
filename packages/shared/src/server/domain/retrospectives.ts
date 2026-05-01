export const retrospectiveRoundKinds = [
  "commitment_review",
  "task_lookback",
  "notes",
  "commitment_capture"
] as const;

export type RetrospectiveRoundKind = (typeof retrospectiveRoundKinds)[number];

export const retrospectiveNoteEntryPhases = [
  "commitment_period",
  "retrospective",
  "both"
] as const;

export type RetrospectiveNoteEntryPhase =
  (typeof retrospectiveNoteEntryPhases)[number];

export const retrospectiveNoteWriteEntryPhases = [
  "commitment_period",
  "retrospective"
] as const;

export type RetrospectiveNoteWriteEntryPhase =
  (typeof retrospectiveNoteWriteEntryPhases)[number];

export const retrospectiveNoteVisibilityStates = [
  "shared",
  "private_until_round",
  "private",
  "revealed"
] as const;

export type RetrospectiveNoteVisibilityState =
  (typeof retrospectiveNoteVisibilityStates)[number];

export const retrospectiveStatuses = [
  "draft",
  "active",
  "finalized"
] as const;

export type RetrospectiveStatus = (typeof retrospectiveStatuses)[number];

export const commitmentPeriodStatuses = [
  "active",
  "closed",
  "reviewed"
] as const;

export type CommitmentPeriodStatus = (typeof commitmentPeriodStatuses)[number];

export const commitmentTrackingKinds = [
  "binary",
  "count_per_period",
  "checklist",
  "freeform"
] as const;

export type CommitmentTrackingKind = (typeof commitmentTrackingKinds)[number];

export const commitmentTrackingIntervals = [
  "none",
  "daily",
  "weekly",
  "monthly"
] as const;

export type CommitmentTrackingInterval =
  (typeof commitmentTrackingIntervals)[number];

export const commitmentStatuses = [
  "active",
  "reviewed",
  "archived"
] as const;

export type CommitmentStatus = (typeof commitmentStatuses)[number];

export const commitmentReviewRatings = [
  "met",
  "mostly_met",
  "partly_met",
  "missed",
  "skipped"
] as const;

export type CommitmentReviewRating = (typeof commitmentReviewRatings)[number];

export const retrospectiveCadences = [
  "weekly",
  "monthly",
  "quarterly",
  "custom"
] as const;

export type RetrospectiveCadence = (typeof retrospectiveCadences)[number];

export const finalizedRetrospectiveEditPolicies = [
  "locked",
  "editable"
] as const;

export type FinalizedRetrospectiveEditPolicy =
  (typeof finalizedRetrospectiveEditPolicies)[number];

export function canNoteEntryPhaseAcceptWrite(args: {
  configuredEntryPhase: RetrospectiveNoteEntryPhase;
  writeEntryPhase: RetrospectiveNoteWriteEntryPhase;
}) {
  return (
    args.configuredEntryPhase === "both" ||
    args.configuredEntryPhase === args.writeEntryPhase
  );
}

export function shouldRevealNotesOnRoundEntry(args: {
  kind: RetrospectiveRoundKind;
  visibilityState: RetrospectiveNoteVisibilityState | null;
}) {
  return args.kind === "notes" && args.visibilityState === "private_until_round";
}
