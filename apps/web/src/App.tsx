import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type CSSProperties,
  type ComponentType,
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Check,
  CalendarDays,
  CalendarPlus2,
  Download,
  ExternalLink,
  FileImage,
  Heart,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  SendHorizontal,
  Tag,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import {
  AppNavigation,
  EmptyStateCard,
  InfoRow,
  SectionHeading,
  SurfaceCard,
  SearchField,
  SelectionListButton,
  StatusMessageCard,
} from "@/components/app-chrome";
import {
  ChoiceChip,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  ToggleField
} from "@/components/app-forms";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  api,
  type BootstrapContext,
  downloadAttachment,
  isConflictError,
  loadAttachmentObjectUrl,
  taskStatuses,
  type Actor,
  type Attachment,
  type Label,
  type Commitment,
  type CommitmentPeriod,
  type CommitmentTrackingKind,
  type RetrospectiveDetail,
  type RetrospectiveEntryPhase,
  type RetrospectiveHome,
  type RetrospectiveNote,
  type RetrospectiveNoteWritePhase,
  type RetrospectivePrivacy,
  type Retrospective,
  type RetrospectiveRound,
  type RetrospectiveRoundKind,
  type RetrospectiveTemplate,
  type RetrospectiveTemplateRound,
  type RetrospectiveTemplateInput,
  type RecurringTemplate,
  type ServiceToken,
  type Settings,
  type SwntdApiError,
  type TaskDetail,
  type TaskListItem,
  type TaskStatus,
  type UserRef
} from "./api";
import {
  buildGoogleCalendarUrl,
  downloadIcsFile
} from "./calendar";
import { getTaskDueState } from "./due-status";
import { applyOptimisticTaskPlacement } from "./task-ordering";
import { toast } from "sonner";
import "./styles.css";

type ViewName = "archive" | "board" | "recurring" | "retrospective" | "settings";
type SettingsPage = "general" | "household" | "labels" | "retrospective";
type ArchiveMode = "issues" | "retrospectives";
type TaskDetailControlId = "assignee" | "due" | "labels" | "status";
const maxLabelNameLength = 16;
const dragMouseDistancePx = 8;
const dragTouchHoldDelayMs = 220;
const dragTouchHoldTolerancePx = 10;

const urlPattern = /https?:\/\/[^\s]+/gi;
const labelPalette = [
  "#4bce97",
  "#1f845a",
  "#f5cd47",
  "#e2b203",
  "#faa53d",
  "#f87168",
  "#c9372c",
  "#9f8fef",
  "#6e5dc6",
  "#579dff",
  "#1d7afc",
  "#6cc3e0",
  "#2898bd",
  "#94c748",
  "#5b7f24",
  "#ca74cf",
  "#ae4787",
  "#8590a2",
  "#626f86"
] as const;

type ChecklistDraftItem = {
  body: string;
  clientId: string;
  isCompleted: boolean;
};

type TaskDraft = {
  aiAssistanceEnabled: boolean;
  assigneeUserId: string;
  checklistItems: ChecklistDraftItem[];
  description: string;
  dueOn: string;
  dueTime: string;
  labelIds: string[];
  title: string;
};

type TemplateDraft = {
  aiAssistanceEnabledDefault: boolean;
  checklistItems: Array<{
    body: string;
    clientId: string;
  }>;
  defaultAssigneeUserId: string;
  defaultDueTime: string;
  description: string;
  isActive: boolean;
  labelIds: string[];
  nextOccurrenceOn: string;
  recurrenceCadence: "daily" | "weekly" | "monthly";
  recurrenceInterval: number;
  title: string;
};

type RetrospectiveTemplateRoundDraft = {
  clientId: string;
  configJson: string;
  entryPhase: RetrospectiveEntryPhase;
  kind: RetrospectiveRoundKind;
  privacy: RetrospectivePrivacy;
  prompt: string;
  title: string;
};

type RetrospectiveTemplateDraft = {
  description: string;
  name: string;
  rounds: RetrospectiveTemplateRoundDraft[];
};

type HouseholdUserDraft = {
  displayName: string;
  email: string;
  mode: "admin" | "service";
  serviceKind: string;
};

type LabelDraft = {
  color: string;
  name: string;
};

type RetrospectiveState = {
  detail: RetrospectiveDetail | null;
  finalizedRetrospectives: Retrospective[];
  home: RetrospectiveHome | null;
  isLoading: boolean;
  templates: RetrospectiveTemplate[];
};

type CommitmentDraft = {
  targetCount: string;
  title: string;
  trackingInterval: "none" | "daily" | "weekly" | "monthly";
  trackingKind: CommitmentTrackingKind;
};

type AppSnapshot = {
  activeTasks: TaskListItem[];
  actor: Actor | null;
  archivedTasks: TaskListItem[];
  labels: Label[];
  recurringTemplates: RecurringTemplate[];
  settings: Settings | null;
  serviceTokensByUserId: Record<string, ServiceToken[]>;
  users: UserRef[];
};

type AccessState = {
  context: BootstrapContext | null;
  kind: "claim" | "forbidden" | "unauthenticated";
};

const emptySnapshot: AppSnapshot = {
  activeTasks: [],
  actor: null,
  archivedTasks: [],
  labels: [],
  recurringTemplates: [],
  settings: null,
  serviceTokensByUserId: {},
  users: []
};

const navItems: Array<{ id: ViewName; label: string }> = [
  { id: "board", label: "Board" },
  { id: "recurring", label: "Recurring" },
  { id: "retrospective", label: "Retrospective" },
  { id: "archive", label: "Archive" }
];
const settingsNavItems: Array<{ id: SettingsPage; label: string }> = [
  { id: "general", label: "General" },
  { id: "retrospective", label: "Retrospective" },
  { id: "household", label: "Household" },
  { id: "labels", label: "Labels" }
];

function isSettingsPage(value: string | undefined): value is SettingsPage {
  return (
    value === "general" ||
    value === "household" ||
    value === "labels" ||
    value === "retrospective"
  );
}

function readRouteFromHash(): {
  archiveMode: ArchiveMode;
  onlyMyTasks: boolean;
  settingsPage: SettingsPage;
  view: ViewName;
} {
  const hash = window.location.hash.replace(/^#/, "");
  const [viewPart, subpagePart] = hash.split("/");

  if (viewPart === "my-tasks") {
    return {
      archiveMode: "issues",
      onlyMyTasks: true,
      settingsPage: "general",
      view: "board"
    };
  }

  if (viewPart === "archive") {
    return {
      archiveMode: subpagePart === "retrospectives" ? "retrospectives" : "issues",
      onlyMyTasks: false,
      settingsPage: "general",
      view: "archive"
    };
  }

  if (viewPart === "recurring") {
    return {
      archiveMode: "issues",
      onlyMyTasks: false,
      settingsPage: "general",
      view: "recurring"
    };
  }

  if (viewPart === "retrospective") {
    return {
      archiveMode: "issues",
      onlyMyTasks: false,
      settingsPage: "general",
      view: "retrospective"
    };
  }

  if (viewPart === "settings") {
    if (subpagePart === "recurring") {
      return {
        archiveMode: "issues",
        onlyMyTasks: false,
        settingsPage: "general",
        view: "recurring"
      };
    }

    return {
      archiveMode: "issues",
      onlyMyTasks: false,
      settingsPage: isSettingsPage(subpagePart) ? subpagePart : "general",
      view: "settings"
    };
  }

  return {
    archiveMode: "issues",
    onlyMyTasks: false,
    settingsPage: "general",
    view: "board"
  };
}

function buildHashForRoute(
  view: ViewName,
  settingsPage: SettingsPage,
  archiveMode: ArchiveMode = "issues"
) {
  if (view === "settings") {
    return `settings/${settingsPage}`;
  }

  if (view === "archive" && archiveMode === "retrospectives") {
    return "archive/retrospectives";
  }

  return view;
}

function createChecklistDraft(items: Array<{ body: string; isCompleted: boolean }>) {
  return items.map((item) => ({
    body: item.body,
    clientId: crypto.randomUUID(),
    isCompleted: item.isCompleted
  }));
}

function createTaskDraft(task?: TaskDetail | null): TaskDraft {
  if (!task) {
    return {
      aiAssistanceEnabled: false,
      assigneeUserId: "",
      checklistItems: [],
      description: "",
      dueOn: "",
      dueTime: "",
      labelIds: [],
      title: ""
    };
  }

  return {
    aiAssistanceEnabled: task.aiAssistanceEnabled,
    assigneeUserId: task.assignee?.id ?? "",
    checklistItems: createChecklistDraft(task.checklistItems),
    description: task.description,
    dueOn: task.dueOn ?? "",
    dueTime: task.dueTime ?? "",
    labelIds: task.labels.map((label) => label.id),
    title: task.title
  };
}

function cleanDetectedUrl(rawUrl: string) {
  return rawUrl.replace(/[),.;!?]+$/g, "");
}

function extractUrls(value: string) {
  const matches = value.match(urlPattern) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const match of matches) {
    const cleaned = cleanDetectedUrl(match);

    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    urls.push(cleaned);
  }

  return urls;
}

function hasMeaningfulCommentText(value: string) {
  return value.replace(urlPattern, " ").replace(/\s+/g, " ").trim().length > 0;
}

function buildTaskSavePayload(draft: TaskDraft) {
  return {
    aiAssistanceEnabled: draft.aiAssistanceEnabled,
    assigneeUserId: draft.assigneeUserId || null,
    checklistItems: draft.checklistItems
      .filter((item) => item.body.trim())
      .map((item) => ({
        body: item.body.trim(),
        isCompleted: item.isCompleted
      })),
    description: draft.description.trim(),
    dueOn: draft.dueOn || null,
    dueTime: draft.dueTime || null,
    labelIds: [...draft.labelIds].sort(),
    title: draft.title.trim()
  };
}

function serializeTaskDraft(draft: TaskDraft) {
  return JSON.stringify(buildTaskSavePayload(draft));
}

function serializeTaskDraftForAutosave(draft: TaskDraft) {
  return JSON.stringify({
    ...buildTaskSavePayload(draft),
    checklistItems: []
  });
}

function createTemplateDraft(template?: RecurringTemplate | null): TemplateDraft {
  if (!template) {
    return {
      aiAssistanceEnabledDefault: false,
      checklistItems: [],
      defaultAssigneeUserId: "",
      defaultDueTime: "",
      description: "",
      isActive: true,
      labelIds: [],
      nextOccurrenceOn: "",
      recurrenceCadence: "weekly",
      recurrenceInterval: 1,
      title: ""
    };
  }

  return {
    aiAssistanceEnabledDefault: template.aiAssistanceEnabledDefault,
    checklistItems: template.checklistItems.map((item) => ({
      body: item.body,
      clientId: crypto.randomUUID()
    })),
    defaultAssigneeUserId: template.defaultAssignee?.id ?? "",
    defaultDueTime: template.defaultDueTime ?? "",
    description: template.description,
    isActive: template.isActive,
    labelIds: template.labels.map((label) => label.id),
    nextOccurrenceOn: template.nextOccurrenceOn,
    recurrenceCadence: template.recurrenceCadence,
    recurrenceInterval: template.recurrenceInterval,
    title: template.title
  };
}

function createRetrospectiveTemplateDraft(
  template?: RetrospectiveTemplate | null
): RetrospectiveTemplateDraft {
  if (!template) {
    return {
      description: "",
      name: "",
      rounds: [
        createRetrospectiveTemplateRoundDraft("commitment_review", "Commitments"),
        createRetrospectiveTemplateRoundDraft("task_lookback", "Lookback"),
        createRetrospectiveTemplateRoundDraft("notes", "Topics", {
          entryPhase: "both",
          privacy: "shared"
        }),
        createRetrospectiveTemplateRoundDraft(
          "commitment_capture",
          "Next commitments"
        )
      ]
    };
  }

  return {
    description: template.description,
    name: template.name,
    rounds: template.rounds.map((round) =>
      createRetrospectiveTemplateRoundDraft(round.kind, round.title, {
        configJson: round.configJson,
        entryPhase: round.entryPhase ?? "retrospective",
        privacy: round.privacy ?? "shared",
        prompt: round.prompt
      })
    )
  };
}

function createRetrospectiveTemplateRoundDraft(
  kind: RetrospectiveRoundKind = "notes",
  title = "",
  overrides: Partial<Omit<RetrospectiveTemplateRoundDraft, "clientId" | "kind" | "title">> = {}
): RetrospectiveTemplateRoundDraft {
  return {
    clientId: crypto.randomUUID(),
    configJson: overrides.configJson ?? "{}",
    entryPhase: overrides.entryPhase ?? "retrospective",
    kind,
    privacy: overrides.privacy ?? "shared",
    prompt: overrides.prompt ?? "",
    title
  };
}

function toRetrospectiveTemplateInput(
  draft: RetrospectiveTemplateDraft
): RetrospectiveTemplateInput {
  return {
    description: draft.description.trim(),
    name: draft.name.trim(),
    rounds: draft.rounds
      .filter((round) => round.title.trim())
      .map((round) => ({
        configJson: round.configJson.trim() || "{}",
        entryPhase: round.kind === "notes" ? round.entryPhase : null,
        kind: round.kind,
        privacy: round.kind === "notes" ? round.privacy : null,
        prompt: round.prompt.trim(),
        title: round.title.trim()
      }))
  };
}

function createHouseholdUserDraft(
  user?: UserRef | null,
  mode: "admin" | "service" = "admin"
): HouseholdUserDraft {
  if (!user) {
    return {
      displayName: "",
      email: "",
      mode,
      serviceKind: mode === "service" ? "assistant" : ""
    };
  }

  return {
    displayName: user.displayName,
    email: user.email ?? "",
    mode: user.role,
    serviceKind: user.serviceKind ?? "assistant"
  };
}

function createLabelDraft(label?: Label | null): LabelDraft {
  if (!label) {
    return {
      color: "",
      name: ""
    };
  }

  return {
    color: label.color ?? "",
    name: label.name
  };
}

function normalizeLabelDraft(draft: LabelDraft) {
  return {
    color: draft.color.trim() || "",
    name: draft.name.trim().slice(0, maxLabelNameLength)
  };
}

function serializeLabelDraft(draft: LabelDraft) {
  return JSON.stringify(normalizeLabelDraft(draft));
}

function normalizeSettingsDraft(settings: Settings) {
  return {
    defaultCalendarExportKind: settings.defaultCalendarExportKind,
    defaultRetrospectiveTemplateId: settings.defaultRetrospectiveTemplateId,
    defaultTimezone: settings.defaultTimezone.trim(),
    doneArchiveAfterDays: settings.doneArchiveAfterDays,
    finalizedRetrospectiveEditPolicy: settings.finalizedRetrospectiveEditPolicy,
    nearDueThresholdDays: settings.nearDueThresholdDays,
    retrospectiveCadence: settings.retrospectiveCadence,
    retrospectiveCadenceInterval: settings.retrospectiveCadenceInterval
  };
}

function serializeSettingsDraft(settings: Settings) {
  return JSON.stringify(normalizeSettingsDraft(settings));
}

function getTaskColumnOrder(tasks: TaskListItem[], status: TaskStatus) {
  return tasks
    .filter((task) => task.status === status)
    .sort((left, right) => right.sortKey - left.sortKey);
}

function formatDate(dateValue: string | null, timeValue?: string | null) {
  if (!dateValue) {
    return "No due date";
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (!timeValue) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      weekday: "short"
    }).format(date);
  }

  const [hour, minute] = timeValue.split(":");
  date.setHours(Number(hour), Number(minute), 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    weekday: "short"
  }).format(date);
}

function formatDueControlValue(dateValue: string | null, timeValue?: string | null) {
  if (!dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (!timeValue) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short"
    }).format(date);
  }

  const [hour, minute] = timeValue.split(":");
  date.setHours(Number(hour), Number(minute), 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(date);
}

function formatRecurringScheduleMeta(template: Pick<
  RecurringTemplate,
  "nextOccurrenceOn" | "recurrenceCadence" | "recurrenceInterval"
>) {
  const unit =
    template.recurrenceCadence === "daily"
      ? template.recurrenceInterval === 1
        ? "day"
        : "days"
      : template.recurrenceCadence === "weekly"
        ? template.recurrenceInterval === 1
          ? "week"
          : "weeks"
        : template.recurrenceInterval === 1
          ? "month"
          : "months";

  const cadenceLabel =
    template.recurrenceInterval === 1
      ? `Every ${unit}`
      : `Every ${template.recurrenceInterval} ${unit}`;

  return `${cadenceLabel} · Next ${formatDueControlValue(template.nextOccurrenceOn)}`;
}

function getContrastingTextColor(color: string) {
  const normalized = color.replace("#", "");

  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return "rgb(47 33 22 / 0.88)";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.62 ? "rgb(47 33 22 / 0.88)" : "rgb(255 250 241 / 0.98)";
}

function getLabelBadgeStyle(color: string | null): CSSProperties | undefined {
  if (!color) {
    return undefined;
  }

  return {
    backgroundColor: color,
    borderColor: color,
    color: getContrastingTextColor(color)
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function isImageAttachment(attachment: Attachment) {
  return attachment.storageKind === "upload" && attachment.mimeType?.startsWith("image/");
}

function getFaviconUrl(externalUrl: string | null) {
  if (!externalUrl) {
    return null;
  }

  try {
    return new URL("/favicon.ico", externalUrl).toString();
  } catch {
    return null;
  }
}

function getStatusStep(status: TaskStatus, direction: -1 | 1) {
  const index = taskStatuses.indexOf(status);
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= taskStatuses.length) {
    return null;
  }

  return taskStatuses[nextIndex];
}

function isTaskStatus(value: string): value is TaskStatus {
  return taskStatuses.includes(value as TaskStatus);
}

function formatRoleLabel(user: Pick<UserRef, "role" | "serviceKind">) {
  if (user.role === "admin") {
    return "Admin";
  }

  if (user.serviceKind === "assistant") {
    return "Household Assistant";
  }

  if (!user.serviceKind) {
    return "Service Actor";
  }

  return user.serviceKind
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getPrimaryServiceActorName(users: UserRef[]) {
  return (
    users.find((user) => user.role === "service" && !user.deactivatedAt)?.displayName ??
    null
  );
}

function getAiAssistanceLabel(users: UserRef[]) {
  const serviceActorName = getPrimaryServiceActorName(users);

  return serviceActorName ? `${serviceActorName} can help` : "AI help enabled";
}

function getAiAssistanceToggleLabel(users: UserRef[]) {
  const serviceActorName = getPrimaryServiceActorName(users);

  return serviceActorName
    ? `Let ${serviceActorName} help`
    : "Let the household assistant help";
}

function buildFlashMessage(error: unknown) {
  if (isConflictError(error)) {
    return "This task changed somewhere else. The board has been refreshed so you can try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function normalizeApiError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return error as SwntdApiError;
  }

  return null;
}

function showErrorToast(message: string, toastId?: string) {
  toast.error(message, { id: toastId ?? `error:${message}` });
}

function formatIsoDate(value: string | null | undefined) {
  if (!value) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function getCommitmentProgressLabel(commitment: Commitment) {
  if (commitment.trackingKind === "count_per_period") {
    const total = commitment.checkins.reduce((sum, checkin) => sum + checkin.amount, 0);

    return `${total}${commitment.targetCount ? ` / ${commitment.targetCount}` : ""} this ${commitment.trackingInterval}`;
  }

  if (commitment.trackingKind === "checklist") {
    const completed = commitment.checklistItems.filter((item) => item.isCompleted).length;

    return `${completed} / ${commitment.checklistItems.length} done`;
  }

  return commitment.status;
}

function getInclusiveDayCount(startOn: string, endOn: string) {
  const start = new Date(`${startOn}T00:00:00.000Z`).getTime();
  const end = new Date(`${endOn}T00:00:00.000Z`).getTime();

  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function getDayDistance(startOn: string, endOn: string) {
  const start = new Date(`${startOn}T00:00:00.000Z`).getTime();
  const end = new Date(`${endOn}T00:00:00.000Z`).getTime();

  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function minIsoDate(left: string, right: string) {
  return left < right ? left : right;
}

function getCommitmentGridRows(
  commitment: Commitment,
  period: CommitmentPeriod | null
) {
  if (!period || commitment.trackingKind !== "count_per_period") {
    return 1;
  }

  const dayCount = getInclusiveDayCount(period.periodStartOn, period.closureOn);

  if (commitment.trackingInterval === "daily") {
    return dayCount;
  }

  if (commitment.trackingInterval === "monthly") {
    return Math.max(1, Math.ceil(dayCount / 30));
  }

  if (commitment.trackingInterval === "weekly") {
    return Math.max(1, Math.ceil(dayCount / 7));
  }

  return 1;
}

function buildExeDevLoginUrl() {
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const url = new URL("/__exe.dev/login", window.location.origin);

  url.searchParams.set("redirect", redirect || "/");

  return `${url.pathname}${url.search}`;
}

function createAccessState(
  error: SwntdApiError,
  context: BootstrapContext | null
): AccessState | null {
  if (error.status === 401) {
    return {
      context,
      kind: "unauthenticated"
    };
  }

  if (error.status !== 403) {
    return null;
  }

  return {
    context,
    kind: context?.canClaimOwnership ? "claim" : "forbidden"
  };
}

export function App() {
  const initialRoute = readRouteFromHash();
  const [view, setView] = useState<ViewName>(initialRoute.view);
  const [onlyMyTasks, setOnlyMyTasks] = useState(initialRoute.onlyMyTasks);
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>(
    initialRoute.archiveMode
  );
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(initialRoute.settingsPage);
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [isBooting, setIsBooting] = useState(true);
  const [isClaimingOwnership, setIsClaimingOwnership] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [archiveRetrospectiveDetail, setArchiveRetrospectiveDetail] =
    useState<RetrospectiveDetail | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | "new" | null>(null);
  const [editingRetrospectiveTemplateKey, setEditingRetrospectiveTemplateKey] =
    useState<string | "new" | null>(null);
  const [editingLabelKey, setEditingLabelKey] = useState<string | "new" | null>(null);
  const [editingUserKey, setEditingUserKey] = useState<string | "new-admin" | "new-service" | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [retrospectiveState, setRetrospectiveState] = useState<RetrospectiveState>({
    detail: null,
    finalizedRetrospectives: [],
    home: null,
    isLoading: false,
    templates: []
  });
  const deferredArchiveSearch = useDeferredValue(archiveSearch);
  const hasLoadedRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = readRouteFromHash();

      setView(nextRoute.view);
      setOnlyMyTasks(nextRoute.onlyMyTasks);
      setArchiveMode(nextRoute.archiveMode);
      setSettingsPage(nextRoute.settingsPage);
    };

    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    if (
      !isNavOpen &&
      !isTaskSheetOpen &&
      !archiveRetrospectiveDetail &&
      editingTemplateKey === null
    ) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [archiveRetrospectiveDetail, editingTemplateKey, isNavOpen, isTaskSheetOpen]);

  const loadTaskDetail = useEffectEvent(async (taskId: string | null) => {
    if (!taskId) {
      setSelectedTask(null);
      return;
    }

    try {
      const detail = await api.getTask(taskId);

      setSelectedTask(detail.item);
    } catch (error) {
      if (normalizeApiError(error)?.status === 404) {
        setSelectedTask(null);
        setSelectedTaskId(null);
        return;
      }

      showErrorToast(buildFlashMessage(error), "task-detail-error");
    }
  });

  const refreshApp = useEffectEvent(
    async (options?: { background?: boolean }) => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

      if (!options?.background && !hasLoadedRef.current) {
        setIsBooting(true);
      }

      const refreshPromise = (async () => {
        try {
          const me = await api.getMe();
          const [activeTasks, archivedTasks] = await Promise.all([
            api.listTasks({ archived: "exclude" }),
            api.listTasks({ archived: "only" })
          ]);

          setAccessState(null);

          if (me.actor.role === "admin") {
            const [users, labels, settings, recurringTemplates, retrospectiveTemplates] = await Promise.all([
              api.listUsers(),
              api.listLabels(),
              api.getSettings(),
              api.listRecurringTemplates(),
              api.listRetrospectiveTemplates()
            ]);
            const serviceTokensEntries = await Promise.all(
              users.items
                .filter((user) => user.role === "service")
                .map(async (user) => [
                  user.id,
                  (await api.listServiceTokens(user.id)).items
                ] as const)
            );

            setSnapshot({
              activeTasks: activeTasks.items,
              actor: me.actor,
              archivedTasks: archivedTasks.items,
              labels: labels.items,
              recurringTemplates: recurringTemplates.items,
              settings: settings.settings,
              serviceTokensByUserId: Object.fromEntries(serviceTokensEntries),
              users: users.items
            });
            setRetrospectiveState((current) => ({
              ...current,
              templates: retrospectiveTemplates.items
            }));
          } else {
            setSnapshot({
              activeTasks: activeTasks.items,
              actor: me.actor,
              archivedTasks: archivedTasks.items,
              labels: [],
              recurringTemplates: [],
              settings: null,
              serviceTokensByUserId: {},
              users: []
            });
          }

          if (selectedTaskId) {
            await loadTaskDetail(selectedTaskId);
          }

          hasLoadedRef.current = true;
        } catch (error) {
          const apiError = normalizeApiError(error);

          if (apiError?.status === 401 || apiError?.status === 403) {
            const context = await api.getBootstrapContext().catch(() => null);

            setAccessState(createAccessState(apiError, context));
            setSnapshot(emptySnapshot);
            setSelectedTask(null);
            setSelectedTaskId(null);
          } else if (!options?.background) {
            showErrorToast(buildFlashMessage(error), "refresh-error");
          }
        } finally {
          setIsBooting(false);
          refreshInFlightRef.current = null;
        }
      })();

      refreshInFlightRef.current = refreshPromise;

      return refreshPromise;
    }
  );

  const refreshRetrospective = useEffectEvent(async () => {
    if (!snapshot.actor || snapshot.actor.role !== "admin") {
      return;
    }

    setRetrospectiveState((current) => ({ ...current, isLoading: true }));

    try {
      const [home, templates, finalizedRetrospectives] = await Promise.all([
        api.getRetrospectiveHome(),
        api.listRetrospectiveTemplates(),
        api.listRetrospectives({ limit: 100, status: "finalized" })
      ]);
      const openRetrospectiveId = home.openRetrospective?.id ?? null;
      const detail = openRetrospectiveId
        ? (await api.getRetrospective(openRetrospectiveId)).item
        : null;

      setRetrospectiveState({
        detail,
        finalizedRetrospectives: finalizedRetrospectives.items,
        home,
        isLoading: false,
        templates: templates.items
      });
    } catch (error) {
      setRetrospectiveState((current) => ({ ...current, isLoading: false }));
      showErrorToast(buildFlashMessage(error), "retrospective-refresh-error");
    }
  });

  useEffect(() => {
    startTransition(() => {
      void refreshApp();
    });
  }, []);

  useEffect(() => {
    const onFocus = () => {
      startTransition(() => {
        void refreshApp({ background: true });
      });
    };
    const intervalId = window.setInterval(() => {
      startTransition(() => {
        void refreshApp({ background: true });
      });
    }, 60_000);

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    void loadTaskDetail(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (
      !snapshot.actor ||
      (view !== "retrospective" &&
        !(view === "archive" && archiveMode === "retrospectives"))
    ) {
      return;
    }

    void refreshRetrospective();
  }, [archiveMode, snapshot.actor, view]);

  useEffect(() => {
    if (view !== "settings" || settingsPage !== "retrospective" || !snapshot.actor) {
      return;
    }

    void refreshRetrospective();
  }, [settingsPage, snapshot.actor, view]);

  const activeTasks = snapshot.activeTasks.slice().sort((left, right) => {
    if (left.status !== right.status) {
      return taskStatuses.indexOf(left.status) - taskStatuses.indexOf(right.status);
    }

    return right.sortKey - left.sortKey;
  });
  const myTasks = activeTasks.filter(
    (task) => task.assignee?.id === snapshot.actor?.id
  );
  const archivedTasks = snapshot.archivedTasks.filter((task) => {
    const query = deferredArchiveSearch.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      task.title.toLowerCase().includes(query) ||
      task.description.toLowerCase().includes(query)
    );
  });

  async function runMutation<T>(
    action: () => Promise<T>,
    successMessage: string,
    options?: { closeTaskSheet?: boolean; silentSuccess?: boolean; skipRefresh?: boolean }
  ) {
    try {
      const result = await action();
      if (!options?.silentSuccess) {
        toast.success(successMessage);
      }

      if (options?.closeTaskSheet) {
        setIsTaskSheetOpen(false);
        setIsCreatingTask(false);
      }

      if (!options?.skipRefresh) {
        await refreshApp({ background: true });
      }
      return result;
    } catch (error) {
      showErrorToast(
        buildFlashMessage(error),
        isConflictError(error) ? "mutation-conflict" : undefined
      );

      if (isConflictError(error)) {
        await refreshApp({ background: true });
      }

      return null;
    }
  }

  async function runRetrospectiveMutation<T>(
    action: () => Promise<T>,
    successMessage: string
  ) {
    const result = await runMutation(action, successMessage, {
      skipRefresh: true
    });

    await refreshRetrospective();

    return result;
  }

  async function openArchivedRetrospectiveDetail(retrospectiveId: string) {
    try {
      const detail = await api.getRetrospective(retrospectiveId);

      setArchiveRetrospectiveDetail(detail.item);
    } catch (error) {
      showErrorToast(buildFlashMessage(error), "retrospective-artifact-error");
    }
  }

  function handleViewChange(nextView: ViewName) {
    setView(nextView);
    setOnlyMyTasks(false);

    if (nextView === "recurring") {
      setEditingTemplateKey(null);
    }

    if (nextView !== "settings") {
      setEditingRetrospectiveTemplateKey(null);
    }

    const nextHash = buildHashForRoute(nextView, settingsPage, archiveMode);

    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }

    setIsNavOpen(false);
  }

  function handleArchiveModeChange(nextMode: ArchiveMode) {
    setArchiveMode(nextMode);
    const nextHash = buildHashForRoute("archive", settingsPage, nextMode);

    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }
  }

  function handleSettingsPageChange(nextPage: SettingsPage) {
    setView("settings");
    setSettingsPage(nextPage);
    setEditingRetrospectiveTemplateKey(null);
    const nextHash = buildHashForRoute("settings", nextPage, archiveMode);

    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }
    setIsNavOpen(false);
  }

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setIsCreatingTask(false);
    setIsTaskSheetOpen(true);
  }

  async function createTaskFromBoardTitle(title: string) {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return false;
    }

    const created = await runMutation(
      () =>
        api.createTask({
          aiAssistanceEnabled: false,
          assigneeUserId: null,
          checklistItems: [],
          description: "",
          dueOn: null,
          dueTime: null,
          labelIds: [],
          title: trimmedTitle
        }),
      "Task added to the ledger."
    );

    return Boolean(created);
  }

  async function handleTaskSubmit(
    draft: TaskDraft,
    options?: { silentSuccess?: boolean }
  ) {
    const payload = buildTaskSavePayload(draft);

    if (isCreatingTask) {
      return runMutation(async () => {
        const created = await api.createTask(payload);

        setSelectedTaskId(created.item.id);
        return created.item;
      }, "Task added to the ledger.", { closeTaskSheet: true });
    }

    if (!selectedTask) {
      return null;
    }

    return runMutation(
      async () => {
        const updated = await api.updateTask(selectedTask.id, {
          ...payload,
          expectedRevision: selectedTask.revision
        });

        setSelectedTask(updated.item);
        setSnapshot((current) => ({
          ...current,
          activeTasks: current.activeTasks.map((task) =>
            task.id === updated.item.id ? updated.item : task
          ),
          archivedTasks: current.archivedTasks.map((task) =>
            task.id === updated.item.id ? updated.item : task
          )
        }));

        return updated.item;
      },
      "Task details updated.",
      {
        ...(options?.silentSuccess ? { silentSuccess: true } : {}),
        skipRefresh: true
      }
    );
  }

  async function handleQuickMove(task: TaskListItem, direction: -1 | 1) {
    const nextStatus = getStatusStep(task.status, direction);

    if (!nextStatus) {
      return;
    }

    await runMutation(
      () =>
        api.transitionTask(task.id, {
          expectedRevision: task.revision,
          status: nextStatus
        }),
      `Moved "${task.title}" to ${nextStatus}.`
    );
  }

  async function handleReorder(task: TaskListItem, direction: -1 | 1) {
    const columnTasks = getTaskColumnOrder(activeTasks, task.status);
    const currentIndex = columnTasks.findIndex((entry) => entry.id === task.id);
    const targetIndex = currentIndex + direction;

    if (targetIndex < 0 || targetIndex >= columnTasks.length) {
      return;
    }

    await runOptimisticTaskPlacement({
      action: () =>
        api.reorderTask(task.id, {
          expectedRevision: task.revision,
          targetIndex
        }),
      successMessage: "Task order updated.",
      targetIndex,
      targetStatus: task.status,
      taskId: task.id
    });
  }

  async function handleTaskDrop(input: {
    targetStatus: TaskStatus;
    targetIndex: number;
    taskId: string;
  }) {
    const task = activeTasks.find((entry) => entry.id === input.taskId);

    if (!task) {
      return;
    }

    const destinationTasks = getTaskColumnOrder(activeTasks, input.targetStatus);
    const safeTargetIndex = Math.max(
      0,
      Math.min(input.targetIndex, destinationTasks.length)
    );

    if (task.status === input.targetStatus) {
      const currentIndex = destinationTasks.findIndex((entry) => entry.id === task.id);

      if (currentIndex < 0) {
        return;
      }

      if (safeTargetIndex === currentIndex) {
        return;
      }

      await runOptimisticTaskPlacement({
        action: () =>
          api.reorderTask(task.id, {
            expectedRevision: task.revision,
            targetIndex: safeTargetIndex
          }),
        successMessage: "Task order updated.",
        targetIndex: safeTargetIndex,
        targetStatus: input.targetStatus,
        taskId: task.id
      });

      return;
    }

    await runOptimisticTaskPlacement({
      action: async () => {
        const transitioned = await api.transitionTask(task.id, {
          expectedRevision: task.revision,
          status: input.targetStatus
        });

        if (safeTargetIndex === 0) {
          return transitioned;
        }

        return api.reorderTask(task.id, {
          expectedRevision: transitioned.item.revision,
          targetIndex: safeTargetIndex
        });
      },
      successMessage: `Moved "${task.title}" to ${input.targetStatus}.`,
      targetIndex: safeTargetIndex,
      targetStatus: input.targetStatus,
      taskId: task.id
    });
  }

  async function runOptimisticTaskPlacement<T>(args: {
    action: () => Promise<T>;
    successMessage: string;
    targetIndex: number;
    targetStatus: TaskStatus;
    taskId: string;
  }) {
    let previousSnapshot: AppSnapshot | null = null;
    const previousSelectedTask = selectedTask;
    let didApply = false;
    let nextRevision: number | null = null;
    let nextStatus: TaskStatus | null = null;

    setSnapshot((current) => {
      const nextPlacement = applyOptimisticTaskPlacement({
        targetIndex: args.targetIndex,
        targetStatus: args.targetStatus,
        taskId: args.taskId,
        tasks: current.activeTasks
      });

      if (!nextPlacement) {
        return current;
      }

      previousSnapshot = current;
      didApply = true;
      nextRevision = nextPlacement.updatedTask.revision;
      nextStatus = nextPlacement.updatedTask.status;

      return {
        ...current,
        activeTasks: nextPlacement.tasks
      };
    });

    if (!didApply) {
      return null;
    }

    if (selectedTask?.id === args.taskId && nextRevision !== null && nextStatus !== null) {
      setSelectedTask({
        ...selectedTask,
        revision: nextRevision,
        status: nextStatus
      });
    }

    try {
      const result = await args.action();
      toast.success(args.successMessage);
      startTransition(() => {
        void refreshApp({ background: true });
      });
      return result;
    } catch (error) {
      if (previousSnapshot) {
        setSnapshot(previousSnapshot);
      }

      setSelectedTask(previousSelectedTask);
      showErrorToast(
        buildFlashMessage(error),
        isConflictError(error) ? "mutation-conflict" : undefined
      );

      if (isConflictError(error)) {
        await refreshApp({ background: true });
      }

      return null;
    }
  }

  async function handleStatusChange(task: TaskDetail, status: TaskStatus) {
    await runMutation(
      () =>
        api.transitionTask(task.id, {
          expectedRevision: task.revision,
          status
        }),
      `Task moved to ${status}.`
    );
  }

  async function handleArchive(task: TaskDetail) {
    await runMutation(
      () => api.archiveTask(task.id, task.revision),
      "Task sent to the archive.",
      { closeTaskSheet: true }
    );
  }

  async function handleUnarchive(task: TaskDetail) {
    await runMutation(
      () => api.unarchiveTask(task.id, task.revision),
      "Task restored from the archive."
    );
  }

  async function handleDeleteArchivedTask(task: TaskDetail) {
    await runMutation(
      () => api.deleteTask(task.id, task.revision),
      "Task deleted permanently.",
      { closeTaskSheet: true }
    );
  }

  async function handleActivitySubmit(
    task: TaskDetail,
    input: { body: string; files: File[]; links: string[] }
  ) {
    const trimmedBody = input.body.trim();
    const links = Array.from(
      new Set(input.links.map((link) => cleanDetectedUrl(link)).filter(Boolean))
    );
    const shouldCreateComment = hasMeaningfulCommentText(trimmedBody);

    if (!shouldCreateComment && input.files.length === 0 && links.length === 0) {
      return false;
    }

    const result = await runMutation(async () => {
      if (shouldCreateComment) {
        await api.addComment(task.id, { body: trimmedBody });
      }

      for (const file of input.files) {
        await api.uploadAttachment(task.id, file);
      }

      for (const link of links) {
        await api.addAttachmentLink(task.id, {
          name: new URL(link).hostname.replace(/^www\./, ""),
          url: link
        });
      }
    }, shouldCreateComment ? "Activity added." : "Attachments added.");

    return result !== null;
  }

  async function handleSettingsSave(nextSettings: Settings) {
    const saved = await runMutation(
      () =>
        api.updateSettings({
          defaultCalendarExportKind: nextSettings.defaultCalendarExportKind,
          defaultRetrospectiveTemplateId: nextSettings.defaultRetrospectiveTemplateId,
          defaultTimezone: nextSettings.defaultTimezone,
          doneArchiveAfterDays: nextSettings.doneArchiveAfterDays,
          finalizedRetrospectiveEditPolicy:
            nextSettings.finalizedRetrospectiveEditPolicy,
          nearDueThresholdDays: nextSettings.nearDueThresholdDays,
          retrospectiveCadence: nextSettings.retrospectiveCadence,
          retrospectiveCadenceInterval: nextSettings.retrospectiveCadenceInterval
        }),
      "Household settings saved.",
      { silentSuccess: true }
    );

    return saved !== null;
  }

  async function handleLabelSave(labelId: string | null, draft: LabelDraft) {
    const payload = {
      color: draft.color.trim() || null,
      name: draft.name.trim().slice(0, maxLabelNameLength)
    };

    if (!payload.name) {
      return null;
    }

    if (labelId) {
      const updated = await runMutation(
        () => api.updateLabel(labelId, payload),
        "Label updated.",
        { silentSuccess: true }
      );

      return updated?.item ?? null;
    }

    const created = await runMutation(() => api.createLabel(payload), "Label added.", {
      silentSuccess: true
    });

    if (created?.item) {
      setEditingLabelKey(created.item.id);
    }

    return created?.item ?? null;
  }

  async function handleLabelDelete(labelId: string) {
    const removed = await runMutation(
      () => api.deleteLabel(labelId),
      "Label removed."
    );

    return removed !== null;
  }

  async function handleTemplateSave(draft: TemplateDraft) {
    const payload = {
      aiAssistanceEnabledDefault: draft.aiAssistanceEnabledDefault,
      checklistItems: draft.checklistItems
        .filter((item) => item.body.trim())
        .map((item) => ({ body: item.body.trim() })),
      defaultAssigneeUserId: draft.defaultAssigneeUserId || null,
      defaultDueTime: draft.defaultDueTime || null,
      description: draft.description.trim(),
      isActive: draft.isActive,
      labelIds: draft.labelIds,
      nextOccurrenceOn: draft.nextOccurrenceOn,
      recurrenceCadence: draft.recurrenceCadence,
      recurrenceInterval: draft.recurrenceInterval,
      title: draft.title.trim()
    };

    if (editingTemplateKey && editingTemplateKey !== "new") {
      await runMutation(
        () => api.updateRecurringTemplate(editingTemplateKey, payload),
        "Recurring template updated."
      );
    } else {
      const created = await runMutation(
        () => api.createRecurringTemplate(payload),
        "Recurring template added."
      );

      if (created) {
        setEditingTemplateKey(created.item.id);
      }
    }
  }

  async function handleRetrospectiveTemplateSave(draft: RetrospectiveTemplateDraft) {
    const payload = toRetrospectiveTemplateInput(draft);

    if (!payload.name || payload.rounds.length === 0) {
      return;
    }

    if (editingRetrospectiveTemplateKey && editingRetrospectiveTemplateKey !== "new") {
      const updated = await runMutation(
        () =>
          api.updateRetrospectiveTemplate(
            editingRetrospectiveTemplateKey,
            payload
          ),
        "Retrospective template updated.",
        { skipRefresh: true }
      );

      if (updated) {
        await refreshRetrospective();
      }
    } else {
      const created = await runMutation(
        () => api.createRetrospectiveTemplate(payload),
        "Retrospective template added.",
        { skipRefresh: true }
      );

      if (created) {
        setEditingRetrospectiveTemplateKey(created.item.id);
        await refreshRetrospective();
      }
    }
  }

  async function handleHouseholdUserSave(
    userId: string | null,
    draft: HouseholdUserDraft
  ) {
    if (userId) {
      const updateInput =
        draft.mode === "admin"
          ? {
              displayName: draft.displayName.trim(),
              email: draft.email.trim()
            }
          : {
              displayName: draft.displayName.trim(),
              serviceKind: draft.serviceKind.trim()
            };

      const updated = await runMutation(
        () => api.updateUser(userId, updateInput),
        "Household actor updated."
      );

      if (updated) {
        setEditingUserKey(updated.item.id);
      }

      return Boolean(updated);
    }

    const created =
      draft.mode === "admin"
        ? await runMutation(
            () =>
              api.createUser({
                displayName: draft.displayName.trim(),
                email: draft.email.trim(),
                role: "admin"
              }),
            "Household person added."
          )
        : await runMutation(
            () =>
              api.createUser({
                displayName: draft.displayName.trim(),
                role: "service",
                serviceKind: draft.serviceKind.trim()
              }),
            "Assistant added."
          );

    if (created) {
      setEditingUserKey(created.item.id);
    }

    return Boolean(created);
  }

  async function handleHouseholdUserRemove(userId: string) {
    const removed = await runMutation(
      () => api.removeUser(userId),
      "Household actor removed from the cast."
    );

    if (removed) {
      setEditingUserKey(null);
    }

    return Boolean(removed);
  }

  async function handleServiceTokenIssue(userId: string, name: string) {
    return runMutation(
      () => api.issueServiceToken(userId, { name: name.trim() }),
      "Service token issued."
    );
  }

  async function handleServiceTokenRevoke(tokenId: string) {
    await runMutation(
      () => api.revokeServiceToken(tokenId),
      "Service token revoked."
    );
  }

  function handleSignIn() {
    window.location.assign(buildExeDevLoginUrl());
  }

  async function handleSwitchAccount() {
    setIsSwitchingAccount(true);

    try {
      await fetch("/__exe.dev/logout", {
        credentials: "same-origin",
        method: "POST"
      });
      window.location.assign(buildExeDevLoginUrl());
    } catch (error) {
      showErrorToast(buildFlashMessage(error), "switch-account-error");
      setIsSwitchingAccount(false);
    }
  }

  async function handleClaimOwnership() {
    setIsClaimingOwnership(true);

    try {
      await api.claimBootstrapOwnership();
      toast.success("Ownership claimed. Opening your household.");
      await refreshApp();
    } catch (error) {
      const apiError = normalizeApiError(error);

      if (apiError?.status === 401 || apiError?.status === 403 || apiError?.status === 409) {
        const context = await api.getBootstrapContext().catch(() => null);

        setAccessState(createAccessState(apiError, context));
      }

      showErrorToast(buildFlashMessage(error), "claim-ownership-error");
    } finally {
      setIsClaimingOwnership(false);
    }
  }

  const canAdmin = snapshot.actor?.role === "admin";
  const selectedHouseholdUser =
    editingUserKey && editingUserKey !== "new-admin" && editingUserKey !== "new-service"
      ? snapshot.users.find((user) => user.id === editingUserKey) ?? null
      : null;
  const householdUserEditorMode =
    editingUserKey === "new-service"
      ? "service"
      : editingUserKey === "new-admin"
        ? "admin"
        : selectedHouseholdUser?.role ?? "admin";
  const selectedLabel =
    editingLabelKey && editingLabelKey !== "new"
      ? snapshot.labels.find((label) => label.id === editingLabelKey) ?? null
      : null;
  const selectedRetrospectiveTemplate =
    editingRetrospectiveTemplateKey && editingRetrospectiveTemplateKey !== "new"
      ? retrospectiveState.templates.find(
          (template) => template.id === editingRetrospectiveTemplateKey
        ) ?? null
      : null;

  return (
    <main className="app-shell">
      <div className="grain" />
      {accessState ? (
        <AuthGate
          accessState={accessState}
          isClaimingOwnership={isClaimingOwnership}
          isSwitchingAccount={isSwitchingAccount}
          onClaimOwnership={handleClaimOwnership}
          onSignIn={handleSignIn}
          onSwitchAccount={handleSwitchAccount}
        />
      ) : (
        <>
          <div className="app-frame">
            <AppNavigation
              actorDisplayName={snapshot.actor?.displayName ?? "Loading..."}
              actorRoleLabel={snapshot.actor ? formatRoleLabel(snapshot.actor) : "guest"}
              isOpen={isNavOpen}
              mainItems={navItems.map((item) => ({ id: item.id, label: item.label }))}
              onClose={() => setIsNavOpen(false)}
              onSelectMain={(itemId) => handleViewChange(itemId as ViewName)}
              selectedMain={view}
            />

            <div className="app-content">
              <div className="mobile-nav-row">
                <Button
                  className="nav-drawer-trigger rounded-full bg-white/70 shadow-sm hover:bg-white"
                  onClick={() => setIsNavOpen(true)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Menu className="size-4" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </div>

              {isBooting ? (
                <StatusMessageCard
                  description="Fetching the latest board state, settings, and household cast."
                  title="Opening the ledger..."
                />
              ) : null}

              {!isBooting && view === "board" ? (
                <BoardView
                  aiAssistanceLabel={getAiAssistanceLabel(snapshot.users)}
                  allTasks={activeTasks}
                  canAdmin={canAdmin}
                  isFilteredToActor={onlyMyTasks}
                  onCreateTask={createTaskFromBoardTitle}
                  onDropTask={handleTaskDrop}
                  onOpenTask={openTask}
                  onQuickMove={handleQuickMove}
                  onReorder={handleReorder}
                  onToggleActorFilter={() => setOnlyMyTasks((current) => !current)}
                  settings={snapshot.settings}
                  visibleTasks={onlyMyTasks ? myTasks : activeTasks}
                />
              ) : null}

              {!isBooting && view === "archive" ? (
                <ArchiveView
                  actor={snapshot.actor}
                  aiAssistanceLabel={getAiAssistanceLabel(snapshot.users)}
                  archiveMode={archiveMode}
                  archiveSearch={archiveSearch}
                  isRetrospectiveLoading={retrospectiveState.isLoading}
                  onArchiveModeChange={handleArchiveModeChange}
                  onArchiveSearchChange={setArchiveSearch}
                  onOpenRetrospective={openArchivedRetrospectiveDetail}
                  onOpenTask={openTask}
                  retrospectives={retrospectiveState.finalizedRetrospectives}
                  settings={snapshot.settings}
                  tasks={archivedTasks}
                />
              ) : null}

              {!isBooting && view === "recurring" ? (
                <RecurringView
                  canAdmin={canAdmin}
                  isTemplateEditorOpen={editingTemplateKey !== null}
                  labels={snapshot.labels}
                  onSaveTemplate={handleTemplateSave}
                  onSelectTemplate={(templateKey) => {
                    setEditingTemplateKey(templateKey);
                    setIsNavOpen(false);
                  }}
                  recurringTemplates={snapshot.recurringTemplates}
                  selectedTemplate={
                    editingTemplateKey && editingTemplateKey !== "new"
                      ? snapshot.recurringTemplates.find(
                          (template) => template.id === editingTemplateKey
                        ) ?? null
                      : null
                  }
                  users={snapshot.users}
                />
              ) : null}

              {!isBooting && view === "retrospective" ? (
                <RetrospectiveView
                  actor={snapshot.actor}
                  state={retrospectiveState}
                  onAddCheckin={(commitmentId) =>
                    runRetrospectiveMutation(
                      () =>
                        api.createCommitmentCheckin(commitmentId, {
                          checkinOn: new Date().toISOString().slice(0, 10)
                        }),
                      "Progress marked."
                    )
                  }
                  onDeleteCheckin={(checkinId) =>
                    runRetrospectiveMutation(
                      () => api.deleteCommitmentCheckin(checkinId),
                      "Progress removed."
                    )
                  }
                  onCreateCommitment={(retrospectiveId, draft) =>
                    runRetrospectiveMutation(
                      () =>
                        api.createCommitment({
                          createdInRetrospectiveId: retrospectiveId,
                          targetCount: draft.targetCount
                            ? Number(draft.targetCount)
                            : null,
                          title: draft.title,
                          trackingInterval: draft.trackingInterval,
                          trackingKind: draft.trackingKind
                        }),
                      "Commitment added."
                    )
                  }
                  onCreateNote={(input) =>
                    runRetrospectiveMutation(
                      () => api.createRetrospectiveNote(input),
                      "Note added."
                    )
                  }
                  onDeleteNote={(noteId) =>
                    runRetrospectiveMutation(
                      () => api.deleteRetrospectiveNote(noteId),
                      "Note deleted."
                    )
                  }
                  onCreateRetrospective={(input) =>
                    runRetrospectiveMutation(
                      () => api.createRetrospective(input),
                      "Retrospective created."
                    )
                  }
                  onEnterRound={(retrospectiveId, roundId) =>
                    runRetrospectiveMutation(
                      () => api.enterRetrospectiveRound(retrospectiveId, roundId),
                      "Round opened."
                    )
                  }
                  onFinalize={(retrospectiveId) =>
                    runRetrospectiveMutation(
                      () => api.finalizeRetrospective(retrospectiveId),
                      "Retrospective finalized."
                    )
                  }
                  onRefresh={refreshRetrospective}
                  onReviewCommitment={(commitmentId, retrospectiveId, roundId, rating) =>
                    runRetrospectiveMutation(
                      () =>
                        api.createCommitmentReview(commitmentId, {
                          rating,
                          retrospectiveId,
                          roundId
                        }),
                      "Commitment reviewed."
                    )
                  }
                />
              ) : null}

              {!isBooting && view === "settings" ? (
                <SettingsView
                  activePage={settingsPage}
                  canAdmin={canAdmin}
                  isLabelEditorOpen={editingLabelKey !== null}
                  labels={snapshot.labels}
                  onDeleteLabel={handleLabelDelete}
                  onIssueServiceToken={handleServiceTokenIssue}
                  onRemoveUser={handleHouseholdUserRemove}
                  onRevokeServiceToken={handleServiceTokenRevoke}
                  onSaveLabel={handleLabelSave}
                  onSaveRetrospectiveTemplate={handleRetrospectiveTemplateSave}
                  onSaveSettings={handleSettingsSave}
                  onSaveUser={handleHouseholdUserSave}
                  onSelectLabel={setEditingLabelKey}
                  onSelectPage={handleSettingsPageChange}
                  onSelectRetrospectiveTemplate={setEditingRetrospectiveTemplateKey}
                  onSelectUser={(userKey) => {
                    setEditingUserKey(userKey);
                    setSettingsPage("household");
                  }}
                  selectedLabel={selectedLabel}
                  selectedLabelKey={editingLabelKey}
                  isUserEditorOpen={editingUserKey !== null}
                  selectedUser={selectedHouseholdUser}
                  selectedRetrospectiveTemplate={selectedRetrospectiveTemplate}
                  selectedRetrospectiveTemplateKey={editingRetrospectiveTemplateKey}
                  retrospectiveTemplates={retrospectiveState.templates}
                  serviceTokensByUserId={snapshot.serviceTokensByUserId}
                  settings={snapshot.settings}
                  userEditorMode={householdUserEditorMode}
                  users={snapshot.users}
                />
              ) : null}
            </div>
          </div>

          <TaskSheet
            aiAssistanceToggleLabel={getAiAssistanceToggleLabel(snapshot.users)}
            actor={snapshot.actor}
            isOpen={isTaskSheetOpen}
            isSavingDisabled={!canAdmin}
            labels={snapshot.labels}
            onSubmitActivity={handleActivitySubmit}
            onArchive={handleArchive}
            onCalendarAction={(task, calendarKind) => {
              if (!snapshot.settings) {
                return;
              }

              if (calendarKind === "google") {
                const googleUrl = buildGoogleCalendarUrl(task, snapshot.settings.defaultTimezone);

                if (googleUrl) {
                  window.open(googleUrl, "_blank", "noopener,noreferrer");
                }

                return;
              }

              downloadIcsFile(task, snapshot.settings.defaultTimezone);
            }}
            onClose={() => {
              setIsTaskSheetOpen(false);
              setIsCreatingTask(false);
            }}
            onDeleteArchivedTask={handleDeleteArchivedTask}
            onDownloadAttachment={async (attachment) => {
              if (!attachment.downloadUrl) {
                return;
              }

              try {
                await downloadAttachment(attachment.downloadUrl, attachment.originalName);
              } catch (error) {
                showErrorToast(buildFlashMessage(error), "attachment-download-error");
              }
            }}
            onSave={handleTaskSubmit}
            onStatusChange={handleStatusChange}
            onUnarchive={handleUnarchive}
            settings={snapshot.settings}
            task={selectedTask}
            users={snapshot.users}
            variant={isCreatingTask ? "create" : "detail"}
          />

          <RetrospectiveArtifactSheet
            detail={archiveRetrospectiveDetail}
            onClose={() => setArchiveRetrospectiveDetail(null)}
          />
        </>
      )}
      <Toaster />
    </main>
  );
}

function AuthGate(props: {
  accessState: AccessState;
  isClaimingOwnership: boolean;
  isSwitchingAccount: boolean;
  onClaimOwnership: () => Promise<void>;
  onSignIn: () => void;
  onSwitchAccount: () => Promise<void>;
}) {
  const authenticatedEmail = props.accessState.context?.authenticatedEmail;
  const householdName = props.accessState.context?.householdName ?? "your household";

  return (
    <div className="auth-shell">
      <SurfaceCard className="auth-card">
        <div className="auth-card-copy">
          <p className="eyebrow">SWNTD Access</p>
          <h1>Sign in to open the household ledger.</h1>
        </div>

        <Separator className="auth-separator" />

        {props.accessState.kind === "unauthenticated" ? (
          <div className="auth-form">
            <Button
              className="w-full sm:w-auto"
              onClick={props.onSignIn}
              type="button"
            >
              Continue to exe.dev
            </Button>
          </div>
        ) : null}

        {props.accessState.kind !== "unauthenticated" ? (
          <div className="auth-status-block">
            <div className="auth-email-pill">
              <UserRound className="size-4" />
              <span>{authenticatedEmail ?? "No authenticated email"}</span>
            </div>
          </div>
        ) : null}

        {props.accessState.kind === "claim" ? (
          <div className="auth-action-stack">
            <div className="auth-highlight">
              <Check className="size-4" />
              <p>
                <strong>{authenticatedEmail}</strong> is approved to claim <strong>{householdName}</strong>.
                This creates your first real admin account and leaves the placeholder bootstrap
                admin in place until you remove it from Settings.
              </p>
            </div>
            <div className="auth-actions">
              <Button
                disabled={props.isClaimingOwnership}
                onClick={() => {
                  void props.onClaimOwnership();
                }}
                type="button"
              >
                {props.isClaimingOwnership ? "Claiming..." : "Claim Household"}
              </Button>
              <Button
                disabled={props.isSwitchingAccount}
                onClick={() => {
                  void props.onSwitchAccount();
                }}
                type="button"
                variant="outline"
              >
                Switch Account
              </Button>
            </div>
          </div>
        ) : null}

        {props.accessState.kind === "forbidden" ? (
          <div className="auth-action-stack">
            <p className="auth-note">
              <strong>{authenticatedEmail}</strong> is not currently a member of this household.
              Sign in with an approved bootstrap owner email, or ask an existing admin to add this
              address in Settings.
            </p>
            <div className="auth-actions">
              <Button
                disabled={props.isSwitchingAccount}
                onClick={() => {
                  void props.onSwitchAccount();
                }}
                type="button"
              >
                {props.isSwitchingAccount ? "Switching..." : "Switch Account"}
              </Button>
              <Button
                asChild
                variant="outline"
              >
                <a href={buildExeDevLoginUrl()}>
                  Open exe.dev Login
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </SurfaceCard>
    </div>
  );
}

function BoardView(props: {
  aiAssistanceLabel: string;
  allTasks: TaskListItem[];
  canAdmin: boolean;
  isFilteredToActor: boolean;
  onCreateTask: (title: string) => Promise<boolean>;
  onDropTask: (input: {
    targetIndex: number;
    targetStatus: TaskStatus;
    taskId: string;
  }) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onToggleActorFilter: () => void;
  settings: Settings | null;
  visibleTasks: TaskListItem[];
}) {
  const [activeTaskId, setActiveTaskId] = useState<UniqueIdentifier | null>(null);
  const [dragProjection, setDragProjection] = useState<{
    targetIndex: number;
    targetStatus: TaskStatus;
  } | null>(null);
  const [inlineTaskTitle, setInlineTaskTitle] = useState("");
  const [isInlineTaskOpen, setIsInlineTaskOpen] = useState(false);
  const [isInlineTaskPending, setIsInlineTaskPending] = useState(false);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const edgeScrollLockRef = useRef<"left" | "right" | null>(null);
  const taskNodeMapRef = useRef(new Map<string, HTMLDivElement>());
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: dragMouseDistancePx
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: dragTouchHoldDelayMs,
        tolerance: dragTouchHoldTolerancePx
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const activeTask =
    activeTaskId === null
      ? null
      : props.allTasks.find((task) => task.id === activeTaskId) ?? null;

  async function commitInlineTask() {
    if (isInlineTaskPending) {
      return;
    }

    const title = inlineTaskTitle.trim();

    if (!title) {
      setInlineTaskTitle("");
      setIsInlineTaskOpen(false);
      return;
    }

    setIsInlineTaskPending(true);

    const created = await props.onCreateTask(title);

    setIsInlineTaskPending(false);

    if (created) {
      setInlineTaskTitle("");
      setIsInlineTaskOpen(false);
    }
  }

  function setTaskNode(taskId: string, node: HTMLDivElement | null) {
    if (!node) {
      taskNodeMapRef.current.delete(taskId);
      return;
    }

    taskNodeMapRef.current.set(taskId, node);
  }

  function handleBoardEdgeScroll(event: DragMoveEvent | DragOverEvent | DragEndEvent) {
    const boardScrollNode = boardScrollRef.current;

    if (!boardScrollNode || boardScrollNode.scrollWidth <= boardScrollNode.clientWidth + 4) {
      edgeScrollLockRef.current = null;
      return;
    }

    const translated = event.active.rect.current.translated;

    if (!translated) {
      edgeScrollLockRef.current = null;
      return;
    }

    const pointerX = translated.left + translated.width / 2;
    const rect = boardScrollNode.getBoundingClientRect();
    const edgeThreshold = Math.min(72, rect.width * 0.18);
    let direction: "left" | "right" | null = null;

    if (pointerX <= rect.left + edgeThreshold) {
      direction = "left";
    } else if (pointerX >= rect.right - edgeThreshold) {
      direction = "right";
    }

    if (!direction) {
      edgeScrollLockRef.current = null;
      return;
    }

    if (edgeScrollLockRef.current === direction) {
      return;
    }

    const boardGridNode = boardScrollNode.querySelector<HTMLElement>(".board-grid");
    const firstColumn = boardScrollNode.querySelector<HTMLElement>(".board-column");
    const gap = boardGridNode
      ? Number.parseFloat(getComputedStyle(boardGridNode).columnGap || "0")
      : 0;
    const step = firstColumn
      ? firstColumn.getBoundingClientRect().width + gap
      : boardScrollNode.clientWidth * 0.82;

    boardScrollNode.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -step : step
    });
    edgeScrollLockRef.current = direction;
  }

  function getProjectedIndex(taskId: string, status: TaskStatus, activeMidpoint: number | null) {
    const tasks = getTaskColumnOrder(
      props.visibleTasks.filter((entry) => entry.id !== taskId),
      status
    );

    if (tasks.length === 0) {
      return 0;
    }

    if (activeMidpoint === null) {
      return tasks.length;
    }

    for (const [index, task] of tasks.entries()) {
      const node = taskNodeMapRef.current.get(task.id);

      if (!node) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (activeMidpoint < midpoint) {
        return index;
      }
    }

    return tasks.length;
  }

  function resolveDragProjection(event: DragMoveEvent | DragOverEvent | DragEndEvent) {
    const taskId = String(event.active.id);
    const task = props.allTasks.find((entry) => entry.id === taskId);

    if (!task || !event.over) {
      return null;
    }

    const overId = String(event.over.id);
    const activeMidpoint = event.active.rect.current.translated
      ? event.active.rect.current.translated.top +
        event.active.rect.current.translated.height / 2
      : null;

    if (overId.startsWith("column:")) {
      const status = overId.replace("column:", "");

      if (!isTaskStatus(status)) {
        return null;
      }

      return {
        targetIndex: getProjectedIndex(taskId, status, activeMidpoint),
        targetStatus: status
      };
    }

    const overTask = props.visibleTasks.find((entry) => entry.id === overId);

    if (!overTask) {
      return null;
    }

    return {
      targetIndex: getProjectedIndex(taskId, overTask.status, activeMidpoint),
      targetStatus: overTask.status
    };
  }

  return (
    <section className="panel-stack">
      <SectionHeading
        actions={
          <button
            aria-checked={props.isFilteredToActor}
            className={cn(
              "board-filter-toggle",
              props.isFilteredToActor && "board-filter-toggle-active"
            )}
            onClick={props.onToggleActorFilter}
            role="switch"
            type="button"
          >
            <span className="board-filter-toggle-track" aria-hidden="true">
              <span className="board-filter-toggle-thumb" />
            </span>
            <span className="board-filter-toggle-label">Only My Tasks</span>
          </button>
        }
        eyebrow="Chore Board"
        title="The S#!% List"
      />
      <DndContext
        autoScroll={false}
        collisionDetection={closestCorners}
        onDragCancel={() => {
          setActiveTaskId(null);
          setDragProjection(null);
          edgeScrollLockRef.current = null;
        }}
        onDragMove={(event: DragMoveEvent) => {
          handleBoardEdgeScroll(event);
          setDragProjection(resolveDragProjection(event));
        }}
        onDragOver={(event: DragOverEvent) => {
          handleBoardEdgeScroll(event);
          setDragProjection(resolveDragProjection(event));
        }}
        onDragEnd={(event: DragEndEvent) => {
          const nextProjection = resolveDragProjection(event) ?? dragProjection;

          setActiveTaskId(null);
          setDragProjection(null);
          edgeScrollLockRef.current = null;

          if (!props.canAdmin || !nextProjection) {
            return;
          }

          const taskId = String(event.active.id);

          void props.onDropTask({
            targetIndex: nextProjection.targetIndex,
            targetStatus: nextProjection.targetStatus,
            taskId
          });
        }}
        onDragStart={(event) => {
          const nextActiveId = event.active.id;
          const task = props.visibleTasks.find((entry) => entry.id === nextActiveId);

          setActiveTaskId(nextActiveId);

          if (!task) {
            setDragProjection(null);
            return;
          }

          const sourceTasks = getTaskColumnOrder(props.visibleTasks, task.status);
          const sourceIndex = sourceTasks.findIndex((entry) => entry.id === task.id);

          setDragProjection(
            sourceIndex < 0
              ? null
              : {
                  targetIndex: sourceIndex,
                  targetStatus: task.status
                }
          );
        }}
        sensors={sensors}
      >
        <div className="board-scroll" ref={boardScrollRef}>
          <div className="board-grid">
            {taskStatuses.map((status) => {
              const tasks = getTaskColumnOrder(
                props.visibleTasks.filter((task) => task.id !== activeTaskId),
                status
              );
              const renderItems: Array<
                | { kind: "placeholder"; task: TaskListItem }
                | { kind: "task"; task: TaskListItem }
              > = tasks.map((task) => ({
                kind: "task" as const,
                task
              }));

              if (activeTask && dragProjection?.targetStatus === status) {
                renderItems.splice(
                  Math.max(0, Math.min(dragProjection.targetIndex, renderItems.length)),
                  0,
                  {
                    kind: "placeholder",
                    task: activeTask
                  }
                );
              }

              return (
              <BoardColumn
                aiAssistanceLabel={props.aiAssistanceLabel}
                canAdmin={props.canAdmin}
                inlineTaskTitle={inlineTaskTitle}
                isInlineTaskOpen={isInlineTaskOpen}
                isInlineTaskPending={isInlineTaskPending}
                items={renderItems}
                key={status}
                onChangeInlineTaskTitle={setInlineTaskTitle}
                onCommitInlineTask={() => {
                  void commitInlineTask();
                }}
                onCreateTask={() => {
                  setInlineTaskTitle("");
                  setIsInlineTaskOpen(true);
                }}
                onDismissInlineTask={() => {
                  if (isInlineTaskPending) {
                    return;
                  }

                  setInlineTaskTitle("");
                  setIsInlineTaskOpen(false);
                }}
                onOpenTask={props.onOpenTask}
                onQuickMove={props.onQuickMove}
                onReorder={props.onReorder}
                onRegisterTaskNode={setTaskNode}
                settings={props.settings}
                status={status}
                taskCount={getTaskColumnOrder(props.visibleTasks, status).length}
              />
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="task-drag-overlay">
              <TaskCard
                aiAssistanceLabel={props.aiAssistanceLabel}
                allowManualReorder={false}
                hideActions
                index={0}
                isDragging
                onOpen={() => undefined}
                onQuickMove={() => Promise.resolve()}
                onReorder={() => Promise.resolve()}
                settings={props.settings}
                task={activeTask}
                total={1}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function BoardColumn(props: {
  aiAssistanceLabel: string;
  canAdmin: boolean;
  inlineTaskTitle: string;
  isInlineTaskOpen: boolean;
  isInlineTaskPending: boolean;
  items: Array<
    | { kind: "placeholder"; task: TaskListItem }
    | { kind: "task"; task: TaskListItem }
  >;
  onChangeInlineTaskTitle: (value: string) => void;
  onCommitInlineTask: () => void;
  onCreateTask: () => void;
  onDismissInlineTask: () => void;
  onOpenTask: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onRegisterTaskNode: (taskId: string, node: HTMLDivElement | null) => void;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  settings: Settings | null;
  status: TaskStatus;
  taskCount: number;
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${props.status}`
  });

  return (
    <SurfaceCard className="board-column gap-0 py-0" key={props.status}>
      <header className="column-header">
        <div className="column-header-main">
          <p className="column-label">{props.status}</p>
          <Badge className="count-pill" variant="secondary">
            {props.taskCount}
          </Badge>
        </div>
        {props.canAdmin && props.status === "To Do" ? (
          <Button
            className="column-add-button"
            onClick={props.onCreateTask}
            size="icon"
            type="button"
            variant="outline"
          >
            <Plus className="size-4" />
            <span className="sr-only">New Task</span>
          </Button>
        ) : null}
      </header>
      <SortableContext
        items={props.items
          .filter((item) => item.kind === "task")
          .map((item) => item.task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-stack" ref={setNodeRef}>
          {props.status === "To Do" && props.isInlineTaskOpen ? (
            <InlineTaskComposer
              isPending={props.isInlineTaskPending}
              onBlur={props.onCommitInlineTask}
              onCancel={props.onDismissInlineTask}
              onChange={props.onChangeInlineTaskTitle}
              title={props.inlineTaskTitle}
            />
          ) : null}
          {props.items.length === 0 && !(props.status === "To Do" && props.isInlineTaskOpen) ? (
            <EmptyStateCard message="Nothing resting here." />
          ) : null}
          {props.items.map((item, index) =>
            item.kind === "placeholder" ? (
              <TaskCard
                aiAssistanceLabel={props.aiAssistanceLabel}
                allowManualReorder={false}
                hideActions
                index={index}
                isPlaceholder
                key={`placeholder:${item.task.id}:${props.status}:${index}`}
                onOpen={() => undefined}
                onQuickMove={() => Promise.resolve()}
                onReorder={() => Promise.resolve()}
                settings={props.settings}
                task={item.task}
                total={props.items.length}
              />
            ) : (
              <SortableTaskCard
                aiAssistanceLabel={props.aiAssistanceLabel}
                canDrag={props.canAdmin}
                index={index}
                key={item.task.id}
                onOpen={props.onOpenTask}
                onQuickMove={props.onQuickMove}
                onRegisterNode={props.onRegisterTaskNode}
                onReorder={props.onReorder}
                settings={props.settings}
                task={item.task}
                total={props.items.length}
              />
            )
          )}
        </div>
      </SortableContext>
    </SurfaceCard>
  );
}

function InlineTaskComposer(props: {
  isPending: boolean;
  onBlur: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <SurfaceCard className="task-card task-card-composer gap-0 py-0">
      <div className="task-card-main task-card-main-composer">
        <input
          className="task-inline-input"
          disabled={props.isPending}
          onBlur={props.onBlur}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              inputRef.current?.blur();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              props.onCancel();
            }
          }}
          placeholder="What needs doing?"
          ref={inputRef}
          value={props.title}
        />
      </div>
    </SurfaceCard>
  );
}

function SortableTaskCard(
  props: {
    canDrag: boolean;
    onRegisterNode: (taskId: string, node: HTMLDivElement | null) => void;
  } & Omit<TaskCardProps, "allowManualReorder">
) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !props.canDrag,
    id: props.task.id
  });

  return (
    <div
      className={cn("task-sortable-shell", isDragging && "task-sortable-shell-dragging")}
      ref={(node) => {
        setNodeRef(node);
        props.onRegisterNode(props.task.id, node);
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard {...props} allowManualReorder={false} isDragging={isDragging} />
    </div>
  );
}

function TaskListView(props: {
  aiAssistanceLabel: string;
  description: string;
  emptyMessage: string;
  onOpenTask: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  settings: Settings | null;
  showHeader?: boolean;
  tasks: TaskListItem[];
  title: string;
}) {
  return (
    <section className="panel-stack">
      {props.showHeader === false ? null : (
        <SectionHeading
          description={props.description}
          eyebrow="Focused View"
          title={props.title}
        />
      )}
      <SurfaceCard className="list-surface gap-0 py-0">
        {props.tasks.length === 0 ? (
          <EmptyStateCard message={props.emptyMessage} />
        ) : null}
        {props.tasks.map((task, index) => (
          <TaskCard
            aiAssistanceLabel={props.aiAssistanceLabel}
            index={index}
            key={task.id}
            onOpen={props.onOpenTask}
            onQuickMove={props.onQuickMove}
            onReorder={props.onReorder}
            settings={props.settings}
            task={task}
            total={props.tasks.length}
          />
        ))}
      </SurfaceCard>
    </section>
  );
}

type TaskCardProps = {
  aiAssistanceLabel: string;
  allowManualReorder?: boolean;
  hideActions?: boolean;
  index: number;
  isDragging?: boolean;
  isPlaceholder?: boolean;
  onOpen: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  settings: Settings | null;
  task: TaskListItem;
  total: number;
};

function TaskCard(props: TaskCardProps) {
  const taskDescription = props.task.description.trim();
  const hasChecklist = props.task.checklistProgress.total > 0;
  const hasComments = props.task.commentCount > 0;
  const hasAttachments = props.task.attachmentCount > 0;
  const allowManualReorder = props.allowManualReorder ?? true;
  const hideActions = props.hideActions ?? false;
  const isPlaceholder = props.isPlaceholder ?? false;
  const dueState = getTaskDueState(props.task, props.settings?.nearDueThresholdDays ?? 3);

  return (
    <SurfaceCard
      className={cn(
        "task-card gap-0 py-0",
        props.isDragging && "task-card-dragging",
        isPlaceholder && "task-card-placeholder",
        dueState === "near" && "task-card-near-due",
        dueState === "past" && "task-card-past-due"
      )}
    >
      <button
        className={cn("task-card-main", isPlaceholder && "task-card-main-placeholder")}
        disabled={isPlaceholder}
        onClick={() => props.onOpen(props.task.id)}
        type="button"
      >
        <div className="task-card-header">
          <h3>{props.task.title}</h3>
          {props.task.aiAssistanceEnabled ? (
            <Badge className="assist-badge assist-on" variant="secondary">
              {props.aiAssistanceLabel}
            </Badge>
          ) : null}
        </div>
        {taskDescription ? <p>{taskDescription}</p> : null}
        <div className="task-meta">
          <Badge className="task-meta-pill" variant="outline">
            {props.task.assignee?.displayName ?? "Unassigned"}
          </Badge>
          {props.task.dueOn ? (
            <Badge
              className={cn(
                "task-meta-pill",
                dueState === "near" && "task-meta-pill-near-due",
                dueState === "past" && "task-meta-pill-past-due"
              )}
              variant="outline"
            >
              {formatDate(props.task.dueOn, props.task.dueTime)}
            </Badge>
          ) : null}
        </div>
        {hasChecklist || hasComments || hasAttachments ? (
          <div className="task-indicators">
            {hasChecklist ? (
              <Badge className="task-indicator-pill" variant="secondary">
                {props.task.checklistProgress.completed}/{props.task.checklistProgress.total} checklist
              </Badge>
            ) : null}
            {hasComments ? (
              <Badge className="task-indicator-pill" variant="secondary">
                {props.task.commentCount} comments
              </Badge>
            ) : null}
            {hasAttachments ? (
              <Badge className="task-indicator-pill" variant="secondary">
                {props.task.attachmentCount} attachments
              </Badge>
            ) : null}
          </div>
        ) : null}
        {props.task.labels.length > 0 ? (
          <div className="label-row">
            {props.task.labels.map((label) => (
              <Badge
                className="label-pill"
                key={label.id}
                style={getLabelBadgeStyle(label.color)}
                variant="outline"
              >
                {label.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </button>
      {!props.task.archivedAt && !hideActions && allowManualReorder ? (
        <div className="card-actions">
          <Button
            disabled={props.index === 0}
            onClick={() => {
              void props.onReorder(props.task, -1);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Move Up
          </Button>
          <Button
            disabled={props.index === props.total - 1}
            onClick={() => {
              void props.onReorder(props.task, 1);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Move Down
          </Button>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function TaskSheet(props: {
  aiAssistanceToggleLabel: string;
  actor: Actor | null;
  isOpen: boolean;
  isSavingDisabled: boolean;
  labels: Label[];
  onArchive: (task: TaskDetail) => Promise<void>;
  onCalendarAction: (task: TaskDetail, kind: "google" | "ics") => void;
  onClose: () => void;
  onDeleteArchivedTask: (task: TaskDetail) => Promise<void>;
  onDownloadAttachment: (attachment: Attachment) => Promise<void>;
  onSave: (
    draft: TaskDraft,
    options?: { silentSuccess?: boolean }
  ) => Promise<TaskDetail | null>;
  onStatusChange: (task: TaskDetail, status: TaskStatus) => Promise<void>;
  onSubmitActivity: (
    task: TaskDetail,
    input: { body: string; files: File[]; links: string[] }
  ) => Promise<boolean>;
  onUnarchive: (task: TaskDetail) => Promise<void>;
  settings: Settings | null;
  task: TaskDetail | null;
  users: UserRef[];
  variant: "create" | "detail";
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => createTaskDraft(null));
  const [activeControl, setActiveControl] = useState<TaskDetailControlId | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingActivityFiles, setPendingActivityFiles] = useState<File[]>([]);
  const [ignoredParsedLinks, setIgnoredParsedLinks] = useState<string[]>([]);
  const lastServerDraftKeyRef = useRef(serializeTaskDraft(createTaskDraft(null)));
  const currentTaskIdRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const activityFileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeTitleInput = useEffectEvent(() => {
    const node = titleInputRef.current;

    if (!node) {
      return;
    }

    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  });
  const submitAutosave = useEffectEvent(async (nextDraft: TaskDraft) => {
    const savedTask = await props.onSave(nextDraft, { silentSuccess: true });

    if (!savedTask) {
      return;
    }

    lastServerDraftKeyRef.current = serializeTaskDraft(createTaskDraft(savedTask));
  });

  const commitChecklistChange = useEffectEvent(async (update: (current: TaskDraft) => TaskDraft) => {
    const nextDraft = update(draftRef.current);
    setDraft(nextDraft);
    await submitAutosave(nextDraft);
  });

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const nextDraft = createTaskDraft(props.variant === "detail" ? props.task : null);
    const nextDraftKey = serializeTaskDraft(nextDraft);
    const isNewTask = currentTaskIdRef.current !== props.task?.id;

    if (props.variant === "detail") {
      setDraft((current) => {
        const currentDraftKey = serializeTaskDraft(current);

        if (isNewTask || currentDraftKey === lastServerDraftKeyRef.current) {
          return nextDraft;
        }

        return current;
      });

      currentTaskIdRef.current = props.task?.id ?? null;
      lastServerDraftKeyRef.current = nextDraftKey;

      if (isNewTask) {
        setActiveControl(null);
        setCommentBody("");
        setIsDeleteConfirmOpen(false);
        setPendingActivityFiles([]);
        setIgnoredParsedLinks([]);
      }
    } else {
      currentTaskIdRef.current = null;
      lastServerDraftKeyRef.current = nextDraftKey;
      setDraft(nextDraft);
      setActiveControl(null);
      setCommentBody("");
      setIsDeleteConfirmOpen(false);
      setPendingActivityFiles([]);
      setIgnoredParsedLinks([]);
    }
  }, [props.task, props.variant]);

  useEffect(() => {
    if (props.variant !== "detail") {
      return;
    }

    resizeTitleInput();
  }, [draft.title, props.variant, resizeTitleInput]);

  const detectedLinks = useMemo(() => extractUrls(commentBody), [commentBody]);
  const parsedLinks = useMemo(
    () => detectedLinks.filter((link) => !ignoredParsedLinks.includes(link)),
    [detectedLinks, ignoredParsedLinks]
  );

  useEffect(() => {
    setIgnoredParsedLinks((current) => {
      const next = current.filter((link) => detectedLinks.includes(link));

      if (next.length === current.length && next.every((link, index) => link === current[index])) {
        return current;
      }

      return next;
    });
  }, [detectedLinks]);

  useEffect(() => {
    if (props.variant !== "detail" || !props.task || props.isSavingDisabled) {
      return;
    }

    const serverDraftKey = serializeTaskDraftForAutosave(createTaskDraft(props.task));
    const currentDraftKey = serializeTaskDraftForAutosave(draft);

    if (currentDraftKey === serverDraftKey || !draft.title.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void submitAutosave(draft);
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draft, props.isSavingDisabled, props.task, props.variant, submitAutosave]);

  if (!props.isOpen) {
    return null;
  }

  const currentTask = props.variant === "detail" ? props.task : null;
  const selectedLabels = props.labels.filter((label) => draft.labelIds.includes(label.id));
  const hasUnsavedChanges =
    props.variant === "detail" &&
    !!currentTask &&
    draft.title.trim().length > 0 &&
    serializeTaskDraft(draft) !== serializeTaskDraft(createTaskDraft(currentTask));

  function handleClose() {
    if (hasUnsavedChanges) {
      void props.onSave(draft, { silentSuccess: true });
    }

    setIsDeleteConfirmOpen(false);
    props.onClose();
  }

  async function handleActivitySubmit() {
    if (!currentTask) {
      return;
    }

    const didSubmit = await props.onSubmitActivity(currentTask, {
      body: commentBody,
      files: pendingActivityFiles,
      links: parsedLinks
    });

    if (!didSubmit) {
      return;
    }

    setCommentBody("");
    setPendingActivityFiles([]);
    setIgnoredParsedLinks([]);

    if (activityFileInputRef.current) {
      activityFileInputRef.current.value = "";
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation">
      <aside aria-label="Task details" className="sheet-panel">
        <header className="sheet-header">
          <div className="sheet-header-copy">
            <p className="eyebrow">{props.variant === "create" ? "New Task" : "Task Detail"}</p>
            {props.variant === "create" ? (
              <h2>Add Something to the Board</h2>
            ) : (
              <textarea
                className="sheet-title-input"
                disabled={props.isSavingDisabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                onInput={() => resizeTitleInput()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                  }
                }}
                placeholder="What needs doing?"
                ref={titleInputRef}
                rows={1}
                value={draft.title}
              />
            )}
            {currentTask ? (
              <TaskDetailControlGrid
                activeControl={activeControl}
                canEdit={!props.isSavingDisabled}
                currentTask={currentTask}
                draft={draft}
                labels={props.labels}
                onCalendarAction={props.onCalendarAction}
                onChangeDraft={setDraft}
                onStatusChange={props.onStatusChange}
                onToggleControl={(control) =>
                  setActiveControl((current) => (current === control ? null : control))
                }
                settings={props.settings}
                users={props.users}
              />
            ) : (
              <p className="section-copy">
                Capture the errand, chore, or recurring ritual with enough context for anyone in the household to pick it up.
              </p>
            )}
          </div>
          <Button className="rounded-full" onClick={handleClose} size="icon" type="button" variant="outline">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        <div className="sheet-body">
          <TaskForm
            aiAssistanceToggleLabel={props.aiAssistanceToggleLabel}
            canEdit={!props.isSavingDisabled}
            draft={draft}
            onChange={setDraft}
            {...(props.variant === "detail"
              ? { onCommitChecklistChange: commitChecklistChange }
              : {})}
            onSubmit={() => {
              void props.onSave(draft);
            }}
            variant={props.variant}
            showSubmitButton={props.variant === "create"}
            showTitleField={props.variant === "create"}
            submitLabel="Create Task"
            users={props.users}
          />

          {currentTask ? <Separator className="bg-border/50" /> : null}

          {currentTask ? (
            <section className="sheet-section">
              {selectedLabels.length > 0 ? (
                <div className="detail-labels-wrap">
                  {selectedLabels.map((label) => (
                    <button
                      className="detail-label-chip"
                      key={label.id}
                      style={getLabelBadgeStyle(label.color)}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          labelIds: current.labelIds.filter((entry) => entry !== label.id)
                        }))
                      }
                      type="button"
                    >
                      <span>{label.name}</span>
                      <span aria-hidden="true">x</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {currentTask ? (
            <section className="sheet-section">
              <p className="eyebrow">Notes</p>
              <div className="activity-composer">
                <div className="activity-input-shell">
                  <FormTextarea
                    className="activity-textarea"
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Leave a note for the household."
                    rows={3}
                    value={commentBody}
                  />
                  <div className="activity-composer-actions">
                    <input
                      accept=".csv,.heic,.jpeg,.jpg,.json,.md,.pdf,.png,.txt,.webp"
                      className="sr-only"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);

                        if (files.length === 0) {
                          return;
                        }

                        setPendingActivityFiles((current) => [...current, ...files]);
                      }}
                      ref={activityFileInputRef}
                      type="file"
                    />
                    <Button
                      className="activity-icon-button"
                      onClick={() => activityFileInputRef.current?.click()}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Paperclip className="size-4" />
                      <span className="sr-only">Attach file</span>
                    </Button>
                    <Button
                      className="activity-icon-button"
                      disabled={
                        !commentBody.trim() &&
                        pendingActivityFiles.length === 0 &&
                        parsedLinks.length === 0
                      }
                      onClick={() => {
                        void handleActivitySubmit();
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <SendHorizontal className="size-4" />
                      <span className="sr-only">Post update</span>
                    </Button>
                  </div>
                </div>
                {pendingActivityFiles.length > 0 || parsedLinks.length > 0 ? (
                  <div className="activity-chip-row">
                    {pendingActivityFiles.map((file, index) => (
                      <button
                        className="detail-label-chip"
                        key={`${file.name}-${file.size}-${index}`}
                        onClick={() =>
                          setPendingActivityFiles((current) =>
                            current.filter((_, currentIndex) => currentIndex !== index)
                          )
                        }
                        type="button"
                      >
                        <span>{file.name}</span>
                        <span aria-hidden="true">x</span>
                      </button>
                    ))}
                    {parsedLinks.map((link) => (
                      <button
                        className="detail-label-chip"
                        key={link}
                        onClick={() =>
                          setIgnoredParsedLinks((current) => [...current, link])
                        }
                        type="button"
                      >
                        <span>{link}</span>
                        <span aria-hidden="true">x</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {currentTask.comments.length > 0 ? (
                <div className="timeline">
                  {currentTask.comments.map((comment) => (
                    <SurfaceCard className="timeline-entry gap-2 py-4" key={comment.id}>
                      <div className="timeline-meta">
                        <strong>{comment.author.displayName}</strong>
                        <span>{formatTimestamp(comment.createdAt)}</span>
                      </div>
                      <p>{comment.body}</p>
                    </SurfaceCard>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {currentTask && currentTask.attachments.length > 0 ? (
            <section className="sheet-section">
              <p className="eyebrow">Attachments</p>
              <div className="attachment-list">
                {currentTask.attachments.map((attachment) => (
                  <div className="attachment-row" key={attachment.id}>
                    <AttachmentPreview attachment={attachment} />
                    <div className="attachment-copy">
                      <strong>{attachment.originalName}</strong>
                      <p className="attachment-meta">
                        Added by {attachment.uploadedBy.displayName} on{" "}
                        {formatTimestamp(attachment.createdAt)}
                      </p>
                    </div>
                    {attachment.storageKind === "upload" ? (
                      <Button
                        className="attachment-action"
                        onClick={() => {
                          void props.onDownloadAttachment(attachment);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Download className="size-4" />
                        <span className="sr-only">Download attachment</span>
                      </Button>
                    ) : (
                      <Button asChild className="attachment-action" size="icon" variant="ghost">
                        <a
                          href={attachment.externalUrl ?? "#"}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink className="size-4" />
                          <span className="sr-only">Open attachment link</span>
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {currentTask ? (
            <section className="sheet-section">
              <div className="sheet-actions detail-actions">
                {currentTask.archivedAt ? (
                  <>
                    <Button
                      onClick={() => {
                        void props.onUnarchive(currentTask);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Restore from Archive
                    </Button>
                    <Button
                      onClick={() => {
                        setIsDeleteConfirmOpen(true);
                      }}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Delete Task
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      void props.onArchive(currentTask);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Archive Task
                  </Button>
                )}
              </div>
            </section>
          ) : null}
        </div>
        {currentTask && isDeleteConfirmOpen ? (
          <div
            aria-hidden={false}
            className="confirm-backdrop"
            onClick={() => setIsDeleteConfirmOpen(false)}
            role="presentation"
          >
            <SurfaceCard
              aria-labelledby="task-delete-title"
              aria-modal="true"
              className="confirm-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="label-delete-confirmation-copy">
                <strong id="task-delete-title">Delete {currentTask.title}?</strong>
                <p>
                  This archived task will be removed permanently, including its notes,
                  attachments, and checklist history.
                </p>
              </div>
              <div className="label-delete-confirmation-actions">
                <Button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setIsDeleteConfirmOpen(false);
                    void props.onDeleteArchivedTask(currentTask);
                  }}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  Delete Task
                </Button>
              </div>
            </SurfaceCard>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function TaskDetailControlGrid(props: {
  activeControl: TaskDetailControlId | null;
  canEdit: boolean;
  currentTask: TaskDetail;
  draft: TaskDraft;
  labels: Label[];
  onCalendarAction: (task: TaskDetail, kind: "google" | "ics") => void;
  onChangeDraft: (draft: TaskDraft | ((current: TaskDraft) => TaskDraft)) => void;
  onStatusChange: (task: TaskDetail, status: TaskStatus) => Promise<void>;
  onToggleControl: (control: TaskDetailControlId) => void;
  settings: Settings | null;
  users: UserRef[];
}) {
  const selectedLabels = props.labels.filter((label) =>
    props.draft.labelIds.includes(label.id)
  );
  const assigneeLabel =
    props.users.find((user) => user.id === props.draft.assigneeUserId)?.displayName ??
    null;
  const dueLabel = props.draft.dueOn
    ? formatDueControlValue(props.draft.dueOn, props.draft.dueTime || null)
    : null;
  const labelValue =
    selectedLabels.length === 0
      ? null
      : selectedLabels.length === 1
        ? selectedLabels[0]?.name ?? null
        : `${selectedLabels.length} labels`;

  return (
    <div className="detail-controls-shell">
      <div className="detail-controls-grid">
        <DetailControlButton
          active={props.activeControl === "status"}
          disabled={!props.canEdit}
          onClick={() => props.onToggleControl("status")}
          value={props.currentTask.status}
        />
        <DetailControlButton
          active={props.activeControl === "assignee"}
          disabled={!props.canEdit}
          emptyIcon={UserRound}
          onClick={() => props.onToggleControl("assignee")}
          value={assigneeLabel}
        />
        <DetailControlButton
          active={props.activeControl === "labels"}
          disabled={!props.canEdit}
          emptyIcon={Tag}
          onClick={() => props.onToggleControl("labels")}
          value={labelValue}
        />
        <DetailControlButton
          active={props.activeControl === "due"}
          disabled={!props.canEdit}
          emptyIcon={CalendarDays}
          onClick={() => props.onToggleControl("due")}
          value={dueLabel}
        />
        <DetailControlButton
          active={false}
          disabled={!props.currentTask.dueOn || !props.settings}
          emptyIcon={CalendarPlus2}
          onClick={() => {
            if (!props.settings || !props.currentTask.dueOn) {
              return;
            }

            props.onCalendarAction(
              props.currentTask,
              props.settings.defaultCalendarExportKind
            );
          }}
          value={null}
        />
      </div>

      {props.activeControl === "status" ? (
        <div className="detail-control-panel">
          <div className="detail-control-options">
            {taskStatuses.map((status) => (
              <Button
                className="rounded-full"
                disabled={!props.canEdit}
                key={status}
                onClick={() => {
                  void props.onStatusChange(props.currentTask, status);
                  props.onToggleControl("status");
                }}
                size="sm"
                type="button"
                variant={props.currentTask.status === status ? "default" : "outline"}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {props.activeControl === "assignee" ? (
        <div className="detail-control-panel">
          <div className="detail-control-options">
            <Button
              className="rounded-full"
              disabled={!props.canEdit}
              onClick={() => {
                props.onChangeDraft((current) => ({
                  ...current,
                  assigneeUserId: ""
                }));
                props.onToggleControl("assignee");
              }}
              size="sm"
              type="button"
              variant={!props.draft.assigneeUserId ? "default" : "outline"}
            >
              Unassigned
            </Button>
            {props.users
              .filter((user) => !user.deactivatedAt)
              .map((user) => (
                <Button
                  className="rounded-full"
                  disabled={!props.canEdit}
                  key={user.id}
                  onClick={() => {
                    props.onChangeDraft((current) => ({
                      ...current,
                      assigneeUserId: user.id
                    }));
                    props.onToggleControl("assignee");
                  }}
                  size="sm"
                  type="button"
                  variant={props.draft.assigneeUserId === user.id ? "default" : "outline"}
                >
                  {user.displayName}
                </Button>
              ))}
          </div>
        </div>
      ) : null}

      {props.activeControl === "due" ? (
        <div className="detail-control-panel detail-control-panel-grid">
          <FormField label="Due date">
            <FormInput
              disabled={!props.canEdit}
              onChange={(event) =>
                props.onChangeDraft((current) => ({
                  ...current,
                  dueOn: event.target.value
                }))
              }
              type="date"
              value={props.draft.dueOn}
            />
          </FormField>
          <FormField label="Due time">
            <FormInput
              disabled={!props.canEdit || !props.draft.dueOn}
              onChange={(event) =>
                props.onChangeDraft((current) => ({
                  ...current,
                  dueTime: event.target.value
                }))
              }
              type="time"
              value={props.draft.dueTime}
            />
          </FormField>
          <div className="detail-control-actions">
            <Button
              disabled={!props.canEdit || (!props.draft.dueOn && !props.draft.dueTime)}
              onClick={() =>
                props.onChangeDraft((current) => ({
                  ...current,
                  dueOn: "",
                  dueTime: ""
                }))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Clear Due
            </Button>
          </div>
        </div>
      ) : null}

      {props.activeControl === "labels" ? (
        <div className="detail-control-panel">
          <div className="checkbox-grid">
            {props.labels.map((label) => (
              <ChoiceChip
                checked={props.draft.labelIds.includes(label.id)}
                disabled={!props.canEdit}
                key={label.id}
                label={label.name}
                onCheckedChange={(checked) =>
                  props.onChangeDraft((current) => ({
                    ...current,
                    labelIds:
                      checked === true
                        ? [...current.labelIds, label.id]
                        : current.labelIds.filter((entry) => entry !== label.id)
                  }))
                }
              />
            ))}
            {props.labels.length === 0 ? (
              <EmptyStateCard message="Create labels in Settings to use them here." />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AttachmentPreview(props: {
  attachment: Attachment;
}) {
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const faviconUrl = getFaviconUrl(props.attachment.externalUrl);

  useEffect(() => {
    if (!isImageAttachment(props.attachment) || !props.attachment.downloadUrl) {
      setImageObjectUrl(null);
      setHasPreviewError(false);
      return;
    }

    let isActive = true;
    let objectUrlToRevoke: string | null = null;

    setHasPreviewError(false);

    void loadAttachmentObjectUrl(props.attachment.downloadUrl)
      .then((objectUrl) => {
        if (!isActive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        objectUrlToRevoke = objectUrl;
        setImageObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setImageObjectUrl(null);
        setHasPreviewError(true);
      });

    return () => {
      isActive = false;

      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [props.attachment]);

  if (imageObjectUrl && !hasPreviewError) {
    return (
      <span className="attachment-preview" aria-hidden="true">
        <img alt="" className="attachment-preview-image" src={imageObjectUrl} />
      </span>
    );
  }

  if (props.attachment.storageKind === "external_link" && faviconUrl && !hasPreviewError) {
    return (
      <span className="attachment-preview" aria-hidden="true">
        <img
          alt=""
          className="attachment-preview-favicon"
          onError={() => setHasPreviewError(true)}
          src={faviconUrl}
        />
      </span>
    );
  }

  return (
    <span className="attachment-preview attachment-preview-fallback" aria-hidden="true">
      {isImageAttachment(props.attachment) ? (
        <FileImage className="size-4" />
      ) : props.attachment.storageKind === "external_link" ? (
        <ExternalLink className="size-4" />
      ) : (
        <Paperclip className="size-4" />
      )}
    </span>
  );
}

function DetailControlButton(props: {
  active: boolean;
  disabled?: boolean;
  emptyIcon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  value: string | null;
}) {
  const EmptyIcon = props.emptyIcon;

  return (
    <button
      className={cn(
        "detail-control-button",
        props.active && "detail-control-button-active"
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.value ? (
        <span className="detail-control-value">{props.value}</span>
      ) : EmptyIcon ? (
        <span className="detail-control-icon-wrap">
          <EmptyIcon className="detail-control-icon" />
        </span>
      ) : null}
    </button>
  );
}

function TaskForm(props: {
  aiAssistanceToggleLabel: string;
  canEdit: boolean;
  draft: TaskDraft;
  onChange: (draft: TaskDraft | ((current: TaskDraft) => TaskDraft)) => void;
  onCommitChecklistChange?: (
    update: (current: TaskDraft) => TaskDraft
  ) => Promise<void>;
  onSubmit: () => void;
  showSubmitButton: boolean;
  showTitleField: boolean;
  submitLabel: string;
  users: UserRef[];
  variant: "create" | "detail";
}) {
  const checklistComposerInputRef = useRef<HTMLInputElement | null>(null);
  const checklistEditInputRef = useRef<HTMLInputElement | null>(null);
  const isChecklistComposerSubmittingRef = useRef(false);
  const suppressChecklistItemClickUntilRef = useRef(0);
  const [isChecklistComposerOpen, setIsChecklistComposerOpen] = useState(false);
  const [activeChecklistItemId, setActiveChecklistItemId] = useState<string | null>(null);
  const [checklistComposerValue, setChecklistComposerValue] = useState("");
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistValue, setEditingChecklistValue] = useState("");
  const checklistSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: dragMouseDistancePx
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: dragTouchHoldDelayMs,
        tolerance: dragTouchHoldTolerancePx
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    if (!editingChecklistItemId) {
      return;
    }

    const activeItem = props.draft.checklistItems.find(
      (item) => item.clientId === editingChecklistItemId
    );

    if (!activeItem) {
      setEditingChecklistItemId(null);
      setEditingChecklistValue("");
    }
  }, [editingChecklistItemId, props.draft.checklistItems]);

  useEffect(() => {
    if (!editingChecklistItemId || !checklistEditInputRef.current) {
      return;
    }

    checklistEditInputRef.current.focus();
    checklistEditInputRef.current.select();
  }, [editingChecklistItemId]);

  useEffect(() => {
    if (!isChecklistComposerOpen) {
      return;
    }

    focusChecklistComposer();
  }, [isChecklistComposerOpen]);

  function focusChecklistComposer() {
    window.requestAnimationFrame(() => {
      const input = checklistComposerInputRef.current;

      if (!input) {
        isChecklistComposerSubmittingRef.current = false;
        return;
      }

      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      isChecklistComposerSubmittingRef.current = false;
    });
  }

  function dismissChecklistComposer() {
    setChecklistComposerValue("");
    setIsChecklistComposerOpen(false);
    isChecklistComposerSubmittingRef.current = false;
  }

  async function reorderChecklistItems(activeId: string, overId: string) {
    await commitChecklistChange((current) => {
      const activeIndex = current.checklistItems.findIndex((item) => item.clientId === activeId);
      const overIndex = current.checklistItems.findIndex((item) => item.clientId === overId);

      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
        return current;
      }

      return {
        ...current,
        checklistItems: arrayMove(current.checklistItems, activeIndex, overIndex)
      };
    });
  }

  async function commitChecklistChange(update: (current: TaskDraft) => TaskDraft) {
    if (props.onCommitChecklistChange) {
      await props.onCommitChecklistChange(update);
      return;
    }

    props.onChange(update);
  }

  async function submitChecklistComposer() {
    const body = checklistComposerValue.trim();

    if (!body || !props.canEdit) {
      return;
    }

    isChecklistComposerSubmittingRef.current = true;
    setChecklistComposerValue("");
    await commitChecklistChange((current) => ({
      ...current,
      checklistItems: [
        ...current.checklistItems,
        {
          body,
          clientId: crypto.randomUUID(),
          isCompleted: false
        }
      ]
    }));
    setIsChecklistComposerOpen(true);
    focusChecklistComposer();
  }

  function startChecklistEdit(item: ChecklistDraftItem) {
    if (!props.canEdit) {
      return;
    }

    setEditingChecklistItemId(item.clientId);
    setEditingChecklistValue(item.body);
  }

  function cancelChecklistEdit() {
    setEditingChecklistItemId(null);
    setEditingChecklistValue("");
  }

  async function submitChecklistEdit(item: ChecklistDraftItem) {
    const body = editingChecklistValue.trim();

    if (!body || !props.canEdit) {
      return;
    }

    await commitChecklistChange((current) => ({
      ...current,
      checklistItems: current.checklistItems.map((entry) =>
        entry.clientId === item.clientId
          ? { ...entry, body }
          : entry
      )
    }));
    cancelChecklistEdit();
  }

  return (
    <section className="sheet-section">
      <div className="form-grid">
        {props.showTitleField ? (
          <FormField className="wide" label="Title">
            <FormInput
              disabled={!props.canEdit}
              onChange={(event) =>
                props.onChange({
                  ...props.draft,
                  title: event.target.value
                })
              }
              placeholder="What needs doing?"
              value={props.draft.title}
            />
          </FormField>
        ) : null}

        {props.variant === "detail" ? (
          <ToggleField
            checked={props.draft.aiAssistanceEnabled}
            disabled={!props.canEdit}
            label={props.aiAssistanceToggleLabel}
            onCheckedChange={(value) =>
              props.onChange({
                ...props.draft,
                aiAssistanceEnabled: value
              })
            }
          />
        ) : null}

        <FormField className="wide" label="Description">
          <FormTextarea
            disabled={!props.canEdit}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                description: event.target.value
              })
            }
            placeholder="Add notes, context, or little clues for the next person."
            rows={4}
            value={props.draft.description}
          />
        </FormField>

        {props.variant === "create" ? (
          <FormSelect
            allowEmptyOption
            className=""
            disabled={!props.canEdit}
            label="Assignee"
            onValueChange={(value) =>
              props.onChange({
                ...props.draft,
                assigneeUserId: value
              })
            }
            options={props.users
              .filter((user) => !user.deactivatedAt)
              .map((user) => ({
                label: user.displayName,
                value: user.id
              }))}
            placeholder="Unassigned"
            value={props.draft.assigneeUserId}
          />
        ) : null}
      </div>

      {props.variant === "detail" ? (
        <>
          <div className="checklist-stack wide">
            <div className="checklist-stack-header">
              <span className="checklist-stack-label">Checklist</span>
              <Button
                className="checklist-add-button"
                disabled={!props.canEdit}
                onClick={() => {
                  cancelChecklistEdit();
                  setIsChecklistComposerOpen(true);
                  focusChecklistComposer();
                }}
                size="icon"
                type="button"
                variant="outline"
              >
                <Plus className="size-4" />
                <span className="sr-only">Add checklist item</span>
              </Button>
            </div>
            <div className="checklist-editor">
              <DndContext
                collisionDetection={closestCorners}
                onDragCancel={() => {
                  setActiveChecklistItemId(null);
                  suppressChecklistItemClickUntilRef.current = Date.now() + 250;
                }}
                onDragEnd={(event) => {
                  const activeId = String(event.active.id);
                  const overId = event.over ? String(event.over.id) : null;

                  setActiveChecklistItemId(null);
                  suppressChecklistItemClickUntilRef.current = Date.now() + 250;

                  if (!overId || activeId === overId) {
                    return;
                  }

                  void reorderChecklistItems(activeId, overId);
                }}
                onDragStart={(event) => {
                  setActiveChecklistItemId(String(event.active.id));
                  cancelChecklistEdit();
                  dismissChecklistComposer();
                }}
                sensors={checklistSensors}
              >
                <SortableContext
                  items={props.draft.checklistItems.map((item) => item.clientId)}
                  strategy={verticalListSortingStrategy}
                >
                  {props.draft.checklistItems.map((item) => (
                    <SortableChecklistRow
                      disabled={!props.canEdit || editingChecklistItemId === item.clientId}
                      isDragging={activeChecklistItemId === item.clientId}
                      itemId={item.clientId}
                      key={item.clientId}
                    >
                      <div className="checklist-row">
                        <Checkbox
                          checked={item.isCompleted}
                          disabled={!props.canEdit}
                          onCheckedChange={(checked) => {
                            void commitChecklistChange((current) => ({
                              ...current,
                              checklistItems: current.checklistItems.map((entry) =>
                                entry.clientId === item.clientId
                                  ? { ...entry, isCompleted: checked === true }
                                  : entry
                              )
                            }));
                          }}
                        />
                        {editingChecklistItemId === item.clientId ? (
                          <div
                            className="checklist-edit-shell"
                            onBlur={(event) => {
                              const nextFocusTarget = event.relatedTarget;

                              if (
                                nextFocusTarget instanceof Node &&
                                event.currentTarget.contains(nextFocusTarget)
                              ) {
                                return;
                              }

                              cancelChecklistEdit();
                            }}
                          >
                            <FormInput
                              disabled={!props.canEdit}
                              onChange={(event) => setEditingChecklistValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void submitChecklistEdit(item);
                                  return;
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelChecklistEdit();
                                }
                              }}
                              placeholder="Subtask description"
                              ref={checklistEditInputRef}
                              value={editingChecklistValue}
                            />
                            <div className="checklist-edit-actions">
                              <Button
                                disabled={!props.canEdit || !editingChecklistValue.trim()}
                                onClick={() => {
                                  void submitChecklistEdit(item);
                                }}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <Check className="size-4" />
                                <span className="sr-only">Save checklist item</span>
                              </Button>
                              <Button
                                disabled={!props.canEdit}
                                onClick={cancelChecklistEdit}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <X className="size-4" />
                                <span className="sr-only">Cancel checklist edit</span>
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className={cn(
                              "checklist-item-button",
                              item.isCompleted && "checklist-item-button-complete"
                            )}
                            disabled={!props.canEdit}
                            onClick={() => {
                              if (Date.now() < suppressChecklistItemClickUntilRef.current) {
                                return;
                              }

                              startChecklistEdit(item);
                            }}
                            type="button"
                          >
                            <span className="checklist-item-body">{item.body}</span>
                          </button>
                        )}
                        {editingChecklistItemId === item.clientId ? null : (
                          <Button
                            className="checklist-remove-button"
                            disabled={!props.canEdit}
                            onClick={() => {
                              if (editingChecklistItemId === item.clientId) {
                                cancelChecklistEdit();
                              }

                              void commitChecklistChange((current) => ({
                                ...current,
                                checklistItems: current.checklistItems.filter(
                                  (entry) => entry.clientId !== item.clientId
                                )
                              }));
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Remove checklist item</span>
                          </Button>
                        )}
                      </div>
                    </SortableChecklistRow>
                  ))}
                </SortableContext>
              </DndContext>
              {isChecklistComposerOpen ? (
                <form
                  className="checklist-row checklist-row-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitChecklistComposer();
                  }}
                >
                  <span aria-hidden="true" className="checklist-row-spacer" />
                  <div className="checklist-edit-shell">
                    <FormInput
                      disabled={!props.canEdit}
                      enterKeyHint="done"
                      onBlur={() => {
                        if (isChecklistComposerSubmittingRef.current) {
                          return;
                        }

                        if (!checklistComposerValue.trim()) {
                          dismissChecklistComposer();
                        }
                      }}
                      onChange={(event) => setChecklistComposerValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          dismissChecklistComposer();
                        }
                      }}
                      placeholder="What needs doing?"
                      ref={checklistComposerInputRef}
                      value={checklistComposerValue}
                    />
                    <div className="checklist-edit-actions">
                      <Button
                        disabled={!props.canEdit || !checklistComposerValue.trim()}
                        onClick={() => {
                          void submitChecklistComposer();
                        }}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <Check className="size-4" />
                        <span className="sr-only">Save checklist item</span>
                      </Button>
                      <Button
                        disabled={!props.canEdit}
                        onClick={dismissChecklistComposer}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X className="size-4" />
                        <span className="sr-only">Cancel checklist item</span>
                      </Button>
                    </div>
                  </div>
                  <span aria-hidden="true" className="checklist-row-spacer" />
                </form>
              ) : null}
            </div>
          </div>

        </>
      ) : null}

      {props.showSubmitButton ? (
        <div className="sheet-actions">
          <Button
            disabled={!props.canEdit || !props.draft.title.trim()}
            onClick={props.onSubmit}
            type="button"
          >
            {props.submitLabel}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function SortableChecklistRow(props: {
  children: ReactNode;
  disabled: boolean;
  isDragging: boolean;
  itemId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: props.disabled,
    id: props.itemId
  });

  return (
    <div
      className={cn(
        "checklist-sortable-shell",
        !props.disabled && "checklist-sortable-shell-enabled",
        props.isDragging && "checklist-sortable-shell-dragging"
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      {...attributes}
      {...listeners}
    >
      {props.children}
    </div>
  );
}

function SettingsView(props: {
  activePage: SettingsPage;
  canAdmin: boolean;
  isLabelEditorOpen: boolean;
  isUserEditorOpen: boolean;
  labels: Label[];
  onDeleteLabel: (labelId: string) => Promise<boolean>;
  onIssueServiceToken: (
    userId: string,
    name: string
  ) => Promise<{ item: ServiceToken; plainTextToken: string } | null>;
  onRemoveUser: (userId: string) => Promise<boolean>;
  onRevokeServiceToken: (tokenId: string) => Promise<void>;
  onSaveLabel: (labelId: string | null, draft: LabelDraft) => Promise<Label | null>;
  onSaveRetrospectiveTemplate: (
    draft: RetrospectiveTemplateDraft
  ) => Promise<void>;
  onSaveSettings: (settings: Settings) => Promise<boolean>;
  onSaveUser: (userId: string | null, draft: HouseholdUserDraft) => Promise<boolean>;
  onSelectLabel: (labelId: string | "new" | null) => void;
  onSelectPage: (page: SettingsPage) => void;
  onSelectRetrospectiveTemplate: (templateId: string | "new" | null) => void;
  onSelectUser: (userKey: string | "new-admin" | "new-service" | null) => void;
  retrospectiveTemplates: RetrospectiveTemplate[];
  selectedLabel: Label | null;
  selectedLabelKey: string | "new" | null;
  selectedRetrospectiveTemplate: RetrospectiveTemplate | null;
  selectedRetrospectiveTemplateKey: string | "new" | null;
  selectedUser: UserRef | null;
  serviceTokensByUserId: Record<string, ServiceToken[]>;
  settings: Settings | null;
  userEditorMode: "admin" | "service";
  users: UserRef[];
}) {
  const [labelDraft, setLabelDraft] = useState<LabelDraft>(createLabelDraft(props.selectedLabel));
  const [retrospectiveTemplateDraft, setRetrospectiveTemplateDraft] =
    useState<RetrospectiveTemplateDraft>(
      createRetrospectiveTemplateDraft(props.selectedRetrospectiveTemplate)
    );
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(props.settings);
  const [userDraft, setUserDraft] = useState<HouseholdUserDraft>(
    createHouseholdUserDraft(props.selectedUser, props.userEditorMode)
  );
  const [serviceTokenName, setServiceTokenName] = useState("");
  const [issuedServiceToken, setIssuedServiceToken] = useState<string | null>(null);
  const [isLabelDeletePending, setIsLabelDeletePending] = useState(false);
  const [isLabelSavePending, setIsLabelSavePending] = useState(false);
  const [pendingLabelDelete, setPendingLabelDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [userActionMessage, setUserActionMessage] = useState<string | null>(null);
  const [isUserRemovePending, setIsUserRemovePending] = useState(false);
  const [isUserSavePending, setIsUserSavePending] = useState(false);
  const [isSettingsSavePending, setIsSettingsSavePending] = useState(false);
  const [isRetrospectiveTemplateSavePending, setIsRetrospectiveTemplateSavePending] =
    useState(false);
  const lastSavedLabelDraftRef = useRef(serializeLabelDraft(createLabelDraft(props.selectedLabel)));
  const lastSavedSettingsDraftRef = useRef(
    props.settings ? serializeSettingsDraft(props.settings) : null
  );
  const inlineLabelInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedLabelDraft = useMemo(() => serializeLabelDraft(labelDraft), [labelDraft]);
  const normalizedSettingsDraft = useMemo(
    () => (settingsDraft ? serializeSettingsDraft(settingsDraft) : null),
    [settingsDraft]
  );

  useEffect(() => {
    setSettingsDraft(props.settings);
    lastSavedSettingsDraftRef.current = props.settings
      ? serializeSettingsDraft(props.settings)
      : null;
    setIsSettingsSavePending(false);
  }, [props.settings]);

  useEffect(() => {
    if (props.selectedLabelKey && props.selectedLabelKey !== "new" && !props.selectedLabel) {
      return;
    }

    if (props.selectedLabelKey === "new") {
      setLabelDraft(createLabelDraft(null));
      lastSavedLabelDraftRef.current = serializeLabelDraft(createLabelDraft(null));
    } else {
      setLabelDraft(createLabelDraft(props.selectedLabel));
      lastSavedLabelDraftRef.current = serializeLabelDraft(createLabelDraft(props.selectedLabel));
    }

    setIsLabelDeletePending(false);
    setIsLabelSavePending(false);
    setPendingLabelDelete((current) =>
      current && current.id !== props.selectedLabel?.id ? null : current
    );
  }, [props.isLabelEditorOpen, props.selectedLabel, props.selectedLabelKey]);

  useEffect(() => {
    if (!props.isLabelEditorOpen) {
      return;
    }

    inlineLabelInputRef.current?.focus();
    inlineLabelInputRef.current?.select();
  }, [props.isLabelEditorOpen, props.selectedLabelKey]);

  useEffect(() => {
    setUserDraft(createHouseholdUserDraft(props.selectedUser, props.userEditorMode));
    setServiceTokenName("");
    setIssuedServiceToken(null);
    setUserActionMessage(null);
    setIsUserRemovePending(false);
    setIsUserSavePending(false);
  }, [props.selectedUser, props.userEditorMode]);

  useEffect(() => {
    if (
      props.selectedRetrospectiveTemplateKey &&
      props.selectedRetrospectiveTemplateKey !== "new" &&
      !props.selectedRetrospectiveTemplate
    ) {
      return;
    }

    setRetrospectiveTemplateDraft(
      createRetrospectiveTemplateDraft(props.selectedRetrospectiveTemplate)
    );
    setIsRetrospectiveTemplateSavePending(false);
  }, [props.selectedRetrospectiveTemplate, props.selectedRetrospectiveTemplateKey]);

  const submitSettingsAutosave = useEffectEvent(async (nextSettings: Settings) => {
    const normalized = normalizeSettingsDraft(nextSettings);

    if (
      !normalized.defaultTimezone ||
      !Number.isFinite(normalized.doneArchiveAfterDays) ||
      !Number.isFinite(normalized.nearDueThresholdDays) ||
      !Number.isFinite(normalized.retrospectiveCadenceInterval)
    ) {
      return;
    }

    if (
      normalized.doneArchiveAfterDays < 1 ||
      normalized.nearDueThresholdDays < 1 ||
      normalized.retrospectiveCadenceInterval < 1
    ) {
      return;
    }

    setIsSettingsSavePending(true);
    const saved = await props.onSaveSettings({
      ...nextSettings,
      defaultTimezone: normalized.defaultTimezone
    });
    setIsSettingsSavePending(false);

    if (saved) {
      lastSavedSettingsDraftRef.current = JSON.stringify(normalized);
    }
  });

  const submitLabelAutosave = useEffectEvent(async (nextDraft: LabelDraft) => {
    const normalized = normalizeLabelDraft(nextDraft);
    const labelId =
      props.selectedLabelKey && props.selectedLabelKey !== "new" ? props.selectedLabelKey : null;

    if (!normalized.name) {
      return;
    }

    setIsLabelSavePending(true);
    const saved = await props.onSaveLabel(labelId, nextDraft);
    setIsLabelSavePending(false);

    if (saved) {
      lastSavedLabelDraftRef.current = JSON.stringify({
        color: saved.color ?? "",
        name: saved.name
      });
    }
  });

  useEffect(() => {
    if (!settingsDraft || isSettingsSavePending) {
      return;
    }

    if (normalizedSettingsDraft === lastSavedSettingsDraftRef.current) {
      return;
    }

    const normalized = normalizeSettingsDraft(settingsDraft);

    if (
      !normalized.defaultTimezone ||
      !Number.isFinite(normalized.doneArchiveAfterDays) ||
      !Number.isFinite(normalized.nearDueThresholdDays) ||
      !Number.isFinite(normalized.retrospectiveCadenceInterval)
    ) {
      return;
    }

    if (
      normalized.doneArchiveAfterDays < 1 ||
      normalized.nearDueThresholdDays < 1 ||
      normalized.retrospectiveCadenceInterval < 1
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void submitSettingsAutosave(settingsDraft);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSettingsSavePending, normalizedSettingsDraft, settingsDraft, submitSettingsAutosave]);

  useEffect(() => {
    if (!props.isLabelEditorOpen || isLabelDeletePending || isLabelSavePending) {
      return;
    }

    if (normalizedLabelDraft === lastSavedLabelDraftRef.current) {
      return;
    }

    const normalized = normalizeLabelDraft(labelDraft);

    if (!normalized.name) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void submitLabelAutosave(labelDraft);
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isLabelDeletePending,
    isLabelSavePending,
    labelDraft,
    normalizedLabelDraft,
    props.isLabelEditorOpen,
    submitLabelAutosave
  ]);

  const handleLabelDeleteConfirm = useEffectEvent(async (labelId: string) => {
    setIsLabelDeletePending(true);
    const deleted = await props.onDeleteLabel(labelId);
    setIsLabelDeletePending(false);
    setPendingLabelDelete(null);

    if (deleted && props.selectedLabel?.id === labelId) {
      props.onSelectLabel(null);
    }
  });

  if (!props.canAdmin || !settingsDraft) {
    return (
      <StatusMessageCard
        description="The current browser session does not have admin access."
        title="Settings are reserved for household admins."
      />
    );
  }

  const selectedServiceTokens =
    props.selectedUser?.role === "service"
      ? props.serviceTokensByUserId[props.selectedUser.id] ?? []
      : [];

  return (
    <section className="settings-shell">
      <div className="settings-page-nav">
        {settingsNavItems.map((item) => (
          <Button
            className={cn(
              "settings-page-button rounded-full border border-border/50 bg-white/62 text-foreground shadow-sm backdrop-blur-sm",
              props.activePage === item.id && "bg-primary text-primary-foreground"
            )}
            key={item.id}
            onClick={() => props.onSelectPage(item.id)}
            size="sm"
            type="button"
            variant={props.activePage === item.id ? "default" : "ghost"}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="settings-page-stack">
        {props.activePage === "general" ? (
          <SurfaceCard className="settings-card gap-0 py-0">
            <SectionHeading
              description="Tune the default timezone, archive cadence, due-date warning threshold, and calendar preference."
              eyebrow="House Rules"
              title="General Settings"
            />
            <div className="form-grid">
              <FormField label="Timezone">
                <FormInput
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      defaultTimezone: event.target.value
                    })
                  }
                  value={settingsDraft.defaultTimezone}
                />
              </FormField>
              <FormField label="Done retention (days)">
                <FormInput
                  min={1}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      doneArchiveAfterDays: Number(event.target.value)
                    })
                  }
                  type="number"
                  value={settingsDraft.doneArchiveAfterDays}
                />
              </FormField>
              <FormField label="Near due threshold (days)">
                <FormInput
                  min={1}
                  onChange={(event) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      nearDueThresholdDays: Number(event.target.value)
                    })
                  }
                  type="number"
                  value={settingsDraft.nearDueThresholdDays}
                />
              </FormField>
              <FormSelect
                label="Default calendar export"
                onValueChange={(value) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    defaultCalendarExportKind: value as "google" | "ics"
                  })
                }
                options={[
                  { label: "Google Calendar", value: "google" },
                  { label: "ICS download", value: "ics" }
                ]}
                value={settingsDraft.defaultCalendarExportKind}
              />
            </div>
          </SurfaceCard>
        ) : null}

        {props.activePage === "retrospective" ? (
          <>
            <SurfaceCard className="settings-card gap-0 py-0">
              <SectionHeading
                description="Set the default rhythm and template for household retrospectives."
                eyebrow="Review Rhythm"
                title="Retrospective Settings"
              />
              <div className="form-grid">
                <FormSelect
                  label="Cadence"
                  onValueChange={(value) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      retrospectiveCadence: value as Settings["retrospectiveCadence"]
                    })
                  }
                  options={[
                    { label: "Weekly", value: "weekly" },
                    { label: "Monthly", value: "monthly" },
                    { label: "Quarterly", value: "quarterly" },
                    { label: "Custom", value: "custom" }
                  ]}
                  value={settingsDraft.retrospectiveCadence}
                />
                <FormField label="Cadence interval">
                  <FormInput
                    min={1}
                    onChange={(event) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        retrospectiveCadenceInterval: Number(event.target.value)
                      })
                    }
                    type="number"
                    value={settingsDraft.retrospectiveCadenceInterval}
                  />
                </FormField>
                <FormSelect
                  allowEmptyOption
                  label="Default template"
                  onValueChange={(value) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      defaultRetrospectiveTemplateId: value || null
                    })
                  }
                  options={props.retrospectiveTemplates.map((template) => ({
                    label: template.name,
                    value: template.id
                  }))}
                  placeholder="No template selected"
                  value={settingsDraft.defaultRetrospectiveTemplateId ?? ""}
                />
                <FormSelect
                  label="Finalized retros"
                  onValueChange={(value) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      finalizedRetrospectiveEditPolicy:
                        value as Settings["finalizedRetrospectiveEditPolicy"]
                    })
                  }
                  options={[
                    { label: "Locked", value: "locked" },
                    { label: "Editable", value: "editable" }
                  ]}
                  value={settingsDraft.finalizedRetrospectiveEditPolicy}
                />
              </div>
            </SurfaceCard>

            <SurfaceCard className="settings-card gap-0 py-0">
              <SectionHeading
                actions={
                  <Button
                    onClick={() => props.onSelectRetrospectiveTemplate("new")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="size-4" />
                    New Template
                  </Button>
                }
                description="Compose the rounds that make up a retro. Notes rounds can accept period notes, live retro notes, or both."
                eyebrow="Templates"
                title="Retrospective Templates"
              />
              <div className="template-grid">
                <div className="template-list">
                  {props.retrospectiveTemplates.length === 0 ? (
                    <EmptyStateCard message="No retrospective templates yet." />
                  ) : null}
                  {props.retrospectiveTemplates.map((template) => (
                    <SelectionListButton
                      active={props.selectedRetrospectiveTemplate?.id === template.id}
                      key={template.id}
                      label={template.name}
                      meta={`${template.rounds.length} rounds`}
                      onClick={() => props.onSelectRetrospectiveTemplate(template.id)}
                    />
                  ))}
                </div>
                <div className="template-editor">
                  {props.selectedRetrospectiveTemplateKey ? (
                    <RetrospectiveTemplateForm
                      draft={retrospectiveTemplateDraft}
                      isSaving={isRetrospectiveTemplateSavePending}
                      onChange={setRetrospectiveTemplateDraft}
                      onSubmit={async () => {
                        setIsRetrospectiveTemplateSavePending(true);
                        await props.onSaveRetrospectiveTemplate(
                          retrospectiveTemplateDraft
                        );
                        setIsRetrospectiveTemplateSavePending(false);
                      }}
                      selectedTemplate={props.selectedRetrospectiveTemplate}
                    />
                  ) : (
                    <EmptyStateCard message="Choose a template or create a new one." />
                  )}
                </div>
              </div>
            </SurfaceCard>
          </>
        ) : null}

        {props.activePage === "household" ? (
          <SurfaceCard className="settings-card gap-0 py-0">
            <SectionHeading
              actions={
                <div className="header-action-row">
                  <Button
                    onClick={() => props.onSelectUser("new-admin")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    New Person
                  </Button>
                  <Button
                    onClick={() => props.onSelectUser("new-service")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    New Assistant
                  </Button>
                </div>
              }
              eyebrow="Household Cast"
              title="People and Assistants"
            />
            <div className="template-grid">
              <div className="template-list">
                {props.users.length === 0 ? (
                  <EmptyStateCard message="No household actors yet." />
                ) : null}
                {props.users.map((user) => (
                  <SelectionListButton
                    active={props.selectedUser?.id === user.id}
                    key={user.id}
                    label={user.displayName}
                    meta={formatRoleLabel(user)}
                    onClick={() => props.onSelectUser(user.id)}
                  />
                ))}
              </div>
              <div className="template-editor">
                {props.isUserEditorOpen ? (
                  <>
                    <div className="form-grid">
                      <FormField label="Type">
                        <FormInput
                          disabled
                          value={userDraft.mode === "admin" ? "Person" : "Assistant"}
                        />
                      </FormField>
                      <FormField label="Display name">
                        <FormInput
                          onChange={(event) =>
                            setUserDraft({
                              ...userDraft,
                              displayName: event.target.value
                            })
                          }
                          value={userDraft.displayName}
                        />
                      </FormField>
                      {userDraft.mode === "admin" ? (
                        <FormField className="wide" label="Email">
                          <FormInput
                            onChange={(event) =>
                              setUserDraft({
                                ...userDraft,
                                email: event.target.value
                              })
                            }
                            placeholder="person@example.com"
                            type="email"
                            value={userDraft.email}
                          />
                        </FormField>
                      ) : (
                        <FormField className="wide" label="Service kind">
                          <FormInput
                            onChange={(event) =>
                              setUserDraft({
                                ...userDraft,
                                serviceKind: event.target.value
                              })
                            }
                            placeholder="assistant"
                            value={userDraft.serviceKind}
                          />
                        </FormField>
                      )}
                    </div>
                    <div className="sheet-actions">
                      <Button
                        disabled={
                          isUserRemovePending ||
                          isUserSavePending ||
                          !userDraft.displayName.trim() ||
                          (userDraft.mode === "admin"
                            ? !userDraft.email.trim()
                            : !userDraft.serviceKind.trim())
                        }
                        onClick={async () => {
                          setIsUserSavePending(true);
                          setUserActionMessage(null);
                          const saved = await props.onSaveUser(
                            props.selectedUser?.id ?? null,
                            userDraft
                          );

                          setIsUserSavePending(false);

                          if (saved) {
                            setUserActionMessage(
                              props.selectedUser ? "Actor saved." : "Actor created."
                            );
                          }
                        }}
                        type="button"
                      >
                        {isUserSavePending
                          ? props.selectedUser
                            ? "Saving..."
                            : "Creating..."
                          : props.selectedUser
                            ? "Save Actor"
                            : "Create Actor"}
                      </Button>
                      {props.selectedUser ? (
                        <Button
                          disabled={isUserRemovePending || isUserSavePending}
                          onClick={async () => {
                            const selectedUserId = props.selectedUser?.id;

                            if (!selectedUserId) {
                              return;
                            }

                            if (
                              !window.confirm(
                                "Remove this household actor permanently from the active cast? They will stay in task history, lose open assignments, and any assistant tokens will be revoked."
                              )
                            ) {
                              return;
                            }

                            setIsUserRemovePending(true);
                            setUserActionMessage(null);
                            await props.onRemoveUser(selectedUserId);
                            setIsUserRemovePending(false);
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {isUserRemovePending ? "Removing..." : "Remove Actor"}
                        </Button>
                      ) : null}
                    </div>
                    {userActionMessage ? <EmptyStateCard message={userActionMessage} /> : null}

                    {props.selectedUser?.role === "service" ? (
                      <section className="sheet-section">
                        <SectionHeading
                          compact
                          eyebrow="Assistant Access"
                          title="Service Tokens"
                          titleAs="h3"
                        />
                        <div className="sheet-actions">
                          <FormField className="compact-field" label="Token name">
                            <FormInput
                              onChange={(event) => setServiceTokenName(event.target.value)}
                              placeholder="Primary assistant"
                              value={serviceTokenName}
                            />
                          </FormField>
                          <Button
                            disabled={
                              !serviceTokenName.trim() || isUserRemovePending || isUserSavePending
                            }
                            onClick={async () => {
                              const issued = await props.onIssueServiceToken(
                                props.selectedUser!.id,
                                serviceTokenName
                              );

                              if (issued) {
                                setIssuedServiceToken(issued.plainTextToken);
                                setServiceTokenName("");
                              }
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Issue Token
                          </Button>
                        </div>
                        {issuedServiceToken ? (
                          <EmptyStateCard
                            message={issuedServiceToken}
                            title="Copy this token now:"
                          />
                        ) : null}
                        <div className="cast-list">
                          {selectedServiceTokens.length === 0 ? (
                            <EmptyStateCard message="No service tokens issued yet." />
                          ) : null}
                          {selectedServiceTokens.map((token) => (
                            <InfoRow
                              action={
                                <Button
                                  disabled={Boolean(token.revokedAt)}
                                  onClick={() => {
                                    void props.onRevokeServiceToken(token.id);
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  {token.revokedAt ? "Revoked" : "Revoke"}
                                </Button>
                              }
                              key={token.id}
                            >
                              <div>
                                <strong>{token.name}</strong>
                                <span>
                                  Created {formatTimestamp(token.createdAt)}
                                  {token.lastUsedAt
                                    ? ` · Last used ${formatTimestamp(token.lastUsedAt)}`
                                    : " · Never used"}
                                  {token.revokedAt
                                    ? ` · Revoked ${formatTimestamp(token.revokedAt)}`
                                    : ""}
                                </span>
                              </div>
                            </InfoRow>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <EmptyStateCard message="Choose someone or create a new person or assistant." />
                )}
              </div>
            </div>
          </SurfaceCard>
        ) : null}

        {props.activePage === "labels" ? (
          <>
            <SurfaceCard className="settings-card gap-0 py-0">
              <SectionHeading
                actions={
                  <div className="section-icon-actions">
                    <Button
                      className="rounded-full"
                      onClick={() => props.onSelectLabel("new")}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Plus className="size-4" />
                      <span className="sr-only">New label</span>
                    </Button>
                  </div>
                }
                description="Create short labels for things like errands, bills, cleaning, shopping, or anything else you want to scan quickly on the board."
                eyebrow="Labels"
                title="Tag Library"
              />
              <div className="template-grid">
                <div className="template-list">
                  {props.labels.length === 0 ? (
                    <EmptyStateCard message="No labels yet. Add a few tags to make the board easier to scan." />
                  ) : null}
                  <div className="label-library-list">
                    {props.selectedLabelKey === "new" ? (
                      <div className="label-library-item label-library-item-active">
                        <div className="label-library-item-input-wrap">
                          <input
                            aria-label="New label name"
                            className={cn(
                              "label-library-inline-input",
                              !labelDraft.color &&
                                !labelDraft.name.trim() &&
                                "label-library-inline-input-neutral"
                            )}
                            maxLength={maxLabelNameLength}
                            onChange={(event) =>
                              setLabelDraft((current) => ({
                                ...current,
                                name: event.target.value.slice(0, maxLabelNameLength)
                              }))
                            }
                            placeholder="New label"
                            ref={inlineLabelInputRef}
                            style={getLabelBadgeStyle(labelDraft.color || null)}
                            value={labelDraft.name}
                          />
                        </div>
                      </div>
                    ) : null}
                    {props.labels.map((label) => {
                      const isSelected = props.selectedLabelKey === label.id;

                      return (
                        <div
                          className={cn(
                            "label-library-item",
                            isSelected && "label-library-item-active"
                          )}
                          key={label.id}
                        >
                          {isSelected ? (
                            <div className="label-library-item-input-wrap">
                              <input
                                aria-label={`Edit label ${label.name}`}
                                className="label-library-inline-input"
                                maxLength={maxLabelNameLength}
                                onChange={(event) =>
                                  setLabelDraft((current) => ({
                                    ...current,
                                    name: event.target.value.slice(0, maxLabelNameLength)
                                  }))
                                }
                                ref={inlineLabelInputRef}
                                style={getLabelBadgeStyle(labelDraft.color || null)}
                                value={labelDraft.name}
                              />
                            </div>
                          ) : (
                            <button
                              aria-pressed={isSelected}
                              className="label-library-item-button"
                              onClick={() => props.onSelectLabel(label.id)}
                              type="button"
                            >
                              <Badge
                                className="label-pill label-library-item-pill"
                                style={getLabelBadgeStyle(label.color ?? null)}
                                variant="outline"
                              >
                                {label.name}
                              </Badge>
                            </button>
                          )}
                          <Button
                            className="label-library-delete-button rounded-full"
                            disabled={isLabelDeletePending || isLabelSavePending}
                            onClick={(event) => {
                              event.stopPropagation();
                              props.onSelectLabel(label.id);
                              setPendingLabelDelete({
                                id: label.id,
                                name: label.name
                              });
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete {label.name}</span>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="template-editor">
                  {props.isLabelEditorOpen ? (
                    <>
                      <div className="wide">
                        <div className="label-color-field">
                          <div className="label-color-grid">
                            <button
                              aria-label="Clear label color"
                              aria-pressed={!labelDraft.color}
                              className={cn(
                                "label-color-swatch label-color-swatch-clear",
                                !labelDraft.color && "label-color-swatch-active"
                              )}
                              onClick={() =>
                                setLabelDraft((current) => ({
                                  ...current,
                                  color: ""
                                }))
                              }
                              type="button"
                            >
                              <X className="size-4" />
                            </button>
                            {labelPalette.map((color) => (
                              <button
                                aria-label={`Select label color ${color}`}
                                aria-pressed={labelDraft.color === color}
                                className={cn(
                                  "label-color-swatch",
                                  labelDraft.color === color && "label-color-swatch-active"
                                )}
                                key={color}
                                onClick={() =>
                                  setLabelDraft((current) => ({
                                    ...current,
                                    color
                                  }))
                                }
                                style={{ backgroundColor: color }}
                                type="button"
                              >
                                {labelDraft.color === color ? <Check className="size-4" /> : null}
                              </button>
                              ))}
                            </div>
                          </div>
                      </div>
                    </>
                  ) : (
                    <EmptyStateCard message="Choose a label or create a new one." />
                  )}
                </div>
              </div>
            </SurfaceCard>
            {pendingLabelDelete ? (
              <div
                aria-hidden={false}
                className="confirm-backdrop"
                onClick={() => setPendingLabelDelete(null)}
                role="presentation"
              >
                <SurfaceCard
                  aria-labelledby="label-delete-title"
                  aria-modal="true"
                  className="confirm-dialog"
                  onClick={(event) => event.stopPropagation()}
                  role="dialog"
                >
                  <div className="label-delete-confirmation-copy">
                    <strong id="label-delete-title">Delete {pendingLabelDelete.name}?</strong>
                    <p>
                      It will be removed from every task and recurring template that currently
                      uses it.
                    </p>
                  </div>
                  <div className="label-delete-confirmation-actions">
                    <Button
                      disabled={isLabelDeletePending}
                      onClick={() => setPendingLabelDelete(null)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={isLabelDeletePending}
                      onClick={() => {
                        void handleLabelDeleteConfirm(pendingLabelDelete.id);
                      }}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      {isLabelDeletePending ? "Deleting..." : "Delete Label"}
                    </Button>
                  </div>
                </SurfaceCard>
              </div>
            ) : null}
          </>
        ) : null}

      </div>
    </section>
  );
}

function RetrospectiveTemplateForm(props: {
  draft: RetrospectiveTemplateDraft;
  isSaving: boolean;
  onChange: (draft: RetrospectiveTemplateDraft) => void;
  onSubmit: () => void;
  selectedTemplate: RetrospectiveTemplate | null;
}) {
  const validRounds = props.draft.rounds.filter((round) => round.title.trim());
  const canSave = props.draft.name.trim() && validRounds.length > 0;
  const updateRound = (
    clientId: string,
    patch: Partial<RetrospectiveTemplateRoundDraft>
  ) => {
    props.onChange({
      ...props.draft,
      rounds: props.draft.rounds.map((round) =>
        round.clientId === clientId ? { ...round, ...patch } : round
      )
    });
  };

  return (
    <div className="form-grid retrospective-template-editor">
      <FormField className="wide" label="Name">
        <FormInput
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              name: event.target.value
            })
          }
          placeholder="Monthly retrospective"
          value={props.draft.name}
        />
      </FormField>
      <FormField className="wide" label="Description">
        <FormTextarea
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              description: event.target.value
            })
          }
          rows={3}
          value={props.draft.description}
        />
      </FormField>

      <div className="sheet-section wide retrospective-template-rounds">
        <SectionHeading
          actions={
            <Button
              onClick={() =>
                props.onChange({
                  ...props.draft,
                  rounds: [
                    ...props.draft.rounds,
                    createRetrospectiveTemplateRoundDraft("notes", "New round")
                  ]
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="size-4" />
              Add Round
            </Button>
          }
          compact
          eyebrow="Flow"
          title="Rounds"
          titleAs="h3"
        />
        <div className="retrospective-template-round-list">
          {props.draft.rounds.map((round, index) => (
            <div className="retrospective-template-round" key={round.clientId}>
              <div className="retrospective-template-round-header">
                <strong>Round {index + 1}</strong>
                <Button
                  disabled={props.draft.rounds.length === 1}
                  onClick={() =>
                    props.onChange({
                      ...props.draft,
                      rounds: props.draft.rounds.filter(
                        (item) => item.clientId !== round.clientId
                      )
                    })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              </div>
              <div className="retrospective-form-grid">
                <FormField label="Title">
                  <FormInput
                    onChange={(event) =>
                      updateRound(round.clientId, { title: event.target.value })
                    }
                    value={round.title}
                  />
                </FormField>
                <FormSelect
                  label="Kind"
                  onValueChange={(value) =>
                    updateRound(round.clientId, {
                      kind: value as RetrospectiveRoundKind
                    })
                  }
                  options={[
                    { label: "Commitment review", value: "commitment_review" },
                    { label: "Task lookback", value: "task_lookback" },
                    { label: "Notes", value: "notes" },
                    { label: "Commitment capture", value: "commitment_capture" }
                  ]}
                  value={round.kind}
                />
                {round.kind === "notes" ? (
                  <>
                    <FormSelect
                      label="Entry"
                      onValueChange={(value) =>
                        updateRound(round.clientId, {
                          entryPhase: value as RetrospectiveEntryPhase
                        })
                      }
                      options={[
                        { label: "During period", value: "commitment_period" },
                        { label: "During retro", value: "retrospective" },
                        { label: "Both", value: "both" }
                      ]}
                      value={round.entryPhase}
                    />
                    <FormSelect
                      label="Privacy"
                      onValueChange={(value) =>
                        updateRound(round.clientId, {
                          privacy: value as RetrospectivePrivacy
                        })
                      }
                      options={[
                        { label: "Shared", value: "shared" },
                        { label: "Private until round", value: "private_until_round" },
                        { label: "Private", value: "private" }
                      ]}
                      value={round.privacy}
                    />
                  </>
                ) : null}
                <FormField className="wide" label="Prompt">
                  <FormTextarea
                    onChange={(event) =>
                      updateRound(round.clientId, { prompt: event.target.value })
                    }
                    rows={2}
                    value={round.prompt}
                  />
                </FormField>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sheet-actions wide">
        <Button
          disabled={!canSave || props.isSaving}
          onClick={props.onSubmit}
          type="button"
        >
          {props.isSaving
            ? "Saving..."
            : props.selectedTemplate
              ? "Save Template"
              : "Create Template"}
        </Button>
      </div>
    </div>
  );
}

function ArchiveView(props: {
  actor: Actor | null;
  aiAssistanceLabel: string;
  archiveMode: ArchiveMode;
  archiveSearch: string;
  isRetrospectiveLoading: boolean;
  onArchiveModeChange: (mode: ArchiveMode) => void;
  onArchiveSearchChange: (value: string) => void;
  onOpenRetrospective: (retrospectiveId: string) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  retrospectives: Retrospective[];
  settings: Settings | null;
  tasks: TaskListItem[];
}) {
  return (
    <section className="panel-stack">
      <SectionHeading
        actions={
          props.archiveMode === "issues" ? (
            <SearchField
              label="Search archive"
              onChange={props.onArchiveSearchChange}
              placeholder="Search titles or notes"
              value={props.archiveSearch}
            />
          ) : null
        }
        eyebrow="History"
        title="Archive"
      />
      <div className="archive-mode-toggle" role="group" aria-label="Archive kind">
        <Button
          aria-pressed={props.archiveMode === "issues"}
          onClick={() => props.onArchiveModeChange("issues")}
          size="sm"
          type="button"
          variant={props.archiveMode === "issues" ? "default" : "outline"}
        >
          Issues
        </Button>
        <Button
          aria-pressed={props.archiveMode === "retrospectives"}
          onClick={() => props.onArchiveModeChange("retrospectives")}
          size="sm"
          type="button"
          variant={props.archiveMode === "retrospectives" ? "default" : "outline"}
        >
          Retrospectives
        </Button>
      </div>

      {props.archiveMode === "issues" ? (
        <TaskListView
          aiAssistanceLabel={props.aiAssistanceLabel}
          description="A place for finished errands, closed loops, and things you only need to remember once in a while."
          emptyMessage="Nothing has been archived yet."
          onOpenTask={props.onOpenTask}
          onQuickMove={() => Promise.resolve()}
          onReorder={() => Promise.resolve()}
          settings={props.settings}
          showHeader={false}
          tasks={props.tasks}
          title="Archive"
        />
      ) : (
        <RetrospectiveArchiveList
          actor={props.actor}
          isLoading={props.isRetrospectiveLoading}
          onOpenRetrospective={props.onOpenRetrospective}
          retrospectives={props.retrospectives}
        />
      )}
    </section>
  );
}

function RetrospectiveArchiveList(props: {
  actor: Actor | null;
  isLoading: boolean;
  onOpenRetrospective: (retrospectiveId: string) => Promise<void>;
  retrospectives: Retrospective[];
}) {
  if (props.actor?.role !== "admin") {
    return (
      <StatusMessageCard
        description="Retrospectives include household-private notes, so only admins can open this archive."
        title="Retrospective archive is for household admins."
      />
    );
  }

  if (props.isLoading && props.retrospectives.length === 0) {
    return (
      <StatusMessageCard
        description="Gathering finalized retrospectives."
        title="Opening retrospective archive..."
      />
    );
  }

  return (
    <SurfaceCard className="retrospective-card">
      <SectionHeading
        compact
        description="Finalized retrospective sessions live here once the current cycle has moved on."
        eyebrow="Retrospectives"
        title="Past retrospectives"
      />
      {props.retrospectives.length === 0 ? (
        <EmptyStateCard message="No finalized retrospectives yet." />
      ) : (
        <div className="retrospective-list">
          {props.retrospectives.map((retrospective) => (
            <div className="retrospective-row" key={retrospective.id}>
              <span>
                <strong>{retrospective.title}</strong>
                <span>
                  {retrospective.finalizedAt
                    ? `Finalized ${formatTimestamp(retrospective.finalizedAt)}`
                    : retrospective.status}
                </span>
              </span>
              <Button
                onClick={() => void props.onOpenRetrospective(retrospective.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                Open
              </Button>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}

function RetrospectiveArtifactSheet(props: {
  detail: RetrospectiveDetail | null;
  onClose: () => void;
}) {
  if (!props.detail) {
    return null;
  }

  const detail = props.detail;
  const periodLabel = detail.period
    ? `${formatIsoDate(detail.period.periodStartOn)} to ${formatIsoDate(detail.period.closureOn)}`
    : "No period attached";
  const capturedCommitments = detail.commitments.filter(
    (commitment) => commitment.createdInRetrospectiveId === detail.id
  );
  const reviewedCommitments = detail.commitments.filter(
    (commitment) =>
      commitment.commitmentPeriodId === detail.commitmentPeriodId &&
      commitment.createdInRetrospectiveId !== detail.id
  );

  return (
    <div className="sheet-backdrop" role="presentation">
      <aside
        aria-label="Archived retrospective"
        className="sheet-panel retrospective-artifact-panel"
      >
        <header className="sheet-header">
          <div className="sheet-header-copy">
            <p className="eyebrow">Archived Retro</p>
            <h2>{detail.title}</h2>
            <p className="section-copy">
              {periodLabel}
              {detail.finalizedAt
                ? ` · Finalized ${formatTimestamp(detail.finalizedAt)}`
                : ""}
            </p>
          </div>
          <Button
            className="rounded-full"
            onClick={props.onClose}
            size="icon"
            type="button"
            variant="outline"
          >
            <X className="size-4" />
            <span className="sr-only">Close archived retrospective</span>
          </Button>
        </header>

        <div className="sheet-body">
          <section className="sheet-section retrospective-artifact-summary">
            <InfoRow>
              <div>
                <strong>Status</strong>
                <span>{detail.status}</span>
              </div>
            </InfoRow>
            <InfoRow>
              <div>
                <strong>Rounds</strong>
                <span>{detail.rounds.length}</span>
              </div>
            </InfoRow>
            <InfoRow>
              <div>
                <strong>Commitments</strong>
                <span>
                  {reviewedCommitments.length} reviewed · {capturedCommitments.length} new
                </span>
              </div>
            </InfoRow>
          </section>

          <section className="sheet-section">
            <SectionHeading
              compact
              eyebrow="Artifact"
              title="Rounds"
              titleAs="h3"
            />
            <div className="retrospective-artifact-rounds">
              {detail.rounds.map((round) => (
                <SurfaceCard className="retrospective-artifact-round" key={round.id}>
                  <SectionHeading
                    compact
                    eyebrow={formatRetrospectiveRoundKind(round.kind)}
                    title={round.title}
                    titleAs="h3"
                    {...(round.prompt ? { description: round.prompt } : {})}
                  />
                  <RetrospectiveArtifactRoundBody
                    capturedCommitments={capturedCommitments}
                    detail={detail}
                    notes={detail.notes.filter((note) => note.roundId === round.id)}
                    reviewedCommitments={reviewedCommitments}
                    round={round}
                  />
                </SurfaceCard>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function RetrospectiveArtifactRoundBody(props: {
  capturedCommitments: Commitment[];
  detail: RetrospectiveDetail;
  notes: RetrospectiveNote[];
  reviewedCommitments: Commitment[];
  round: RetrospectiveRound;
}) {
  if (props.round.kind === "task_lookback") {
    return (
      <div className="retrospective-list">
        {props.detail.taskLookback.length === 0 ? (
          <EmptyStateCard message="No completed tasks landed in this period." />
        ) : null}
        {props.detail.taskLookback.map((task) => (
          <div className="retrospective-row" key={task.id}>
            <strong>{task.title}</strong>
            <span>{task.completedAt ? formatTimestamp(task.completedAt) : ""}</span>
          </div>
        ))}
      </div>
    );
  }

  if (props.round.kind === "notes") {
    return <RetrospectiveNoteList notes={props.notes} />;
  }

  if (props.round.kind === "commitment_capture") {
    return (
      <RetrospectiveCommitmentArtifactList
        commitments={props.capturedCommitments}
        emptyMessage="No new commitments were captured in this round."
      />
    );
  }

  return (
    <RetrospectiveCommitmentArtifactList
      commitments={props.reviewedCommitments}
      emptyMessage="No commitments were reviewed in this round."
    />
  );
}

function RetrospectiveCommitmentArtifactList(props: {
  commitments: Commitment[];
  emptyMessage: string;
}) {
  if (props.commitments.length === 0) {
    return <EmptyStateCard message={props.emptyMessage} />;
  }

  return (
    <div className="retrospective-list">
      {props.commitments.map((commitment) => (
        <div className="retrospective-row" key={commitment.id}>
          <span>
            <strong>{commitment.title}</strong>
            <span>{getCommitmentProgressLabel(commitment)}</span>
            {commitment.description ? <span>{commitment.description}</span> : null}
          </span>
          <Badge variant="outline">{commitment.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function formatRetrospectiveRoundKind(kind: RetrospectiveRound["kind"]) {
  switch (kind) {
    case "commitment_capture":
      return "Commitment Capture";
    case "commitment_review":
      return "Commitment Review";
    case "task_lookback":
      return "Task Lookback";
    case "notes":
      return "Notes";
  }
}

function RetrospectiveView(props: {
  actor: Actor | null;
  onAddCheckin: (commitmentId: string) => Promise<unknown>;
  onCreateCommitment: (
    retrospectiveId: string,
    draft: CommitmentDraft
  ) => Promise<unknown>;
  onCreateNote: (input: {
    body: string;
    commitmentPeriodId: string;
    entryPhase: RetrospectiveNoteWritePhase;
    retrospectiveId?: string | null;
    roundId?: string | null;
    templateRoundId?: string | null;
  }) => Promise<unknown>;
  onDeleteCheckin: (checkinId: string) => Promise<unknown>;
  onDeleteNote: (noteId: string) => Promise<unknown>;
  onCreateRetrospective: (input: {
    closureOn?: string;
    templateId?: string;
  }) => Promise<unknown>;
  onEnterRound: (retrospectiveId: string, roundId: string) => Promise<unknown>;
  onFinalize: (retrospectiveId: string) => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onReviewCommitment: (
    commitmentId: string,
    retrospectiveId: string,
    roundId: string,
    rating: "met" | "mostly_met" | "partly_met" | "missed" | "skipped"
  ) => Promise<unknown>;
  state: RetrospectiveState;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedClosureOn, setSelectedClosureOn] = useState("");
  const home = props.state.home;
  const detail = props.state.detail;
  const activePeriod = home?.activePeriod ?? detail?.period ?? null;
  const latestAllowedClosureOn = home?.activePeriod
    ? minIsoDate(todayIsoDate(), home.activePeriod.closureOn)
    : "";
  const defaultTemplateId =
    selectedTemplateId ||
    home?.settings?.defaultRetrospectiveTemplateId ||
    props.state.templates[0]?.id ||
    "";
  const defaultTemplate = props.state.templates.find(
    (template) => template.id === defaultTemplateId
  );
  const periodNoteRounds =
    defaultTemplate?.rounds.filter(
      (round) =>
        round.kind === "notes" &&
        (round.entryPhase === "commitment_period" || round.entryPhase === "both")
    ) ?? [];

  useEffect(() => {
    setSelectedClosureOn(latestAllowedClosureOn);
  }, [home?.activePeriod?.id, latestAllowedClosureOn]);

  if (props.actor?.role !== "admin") {
    return (
      <StatusMessageCard
        description="Retrospectives include household-private notes, so only admins can open this view."
        title="Retrospective is for household admins."
      />
    );
  }

  if (props.state.isLoading && !home) {
    return (
      <StatusMessageCard
        description="Gathering commitment periods, notes, templates, and recent sessions."
        title="Opening retrospective..."
      />
    );
  }

  if (!home) {
    return (
      <section className="panel-stack">
        <StatusMessageCard
          description="The retrospective data did not load."
          title="Retrospective is unavailable."
        />
        <Button onClick={() => void props.onRefresh()} type="button" variant="outline">
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </section>
    );
  }

  const handleCreateRetrospective = () => {
    if (!home.activePeriod) {
      return;
    }

    const closureOn = selectedClosureOn || latestAllowedClosureOn;
    const daysUntilClosure = getDayDistance(closureOn, home.activePeriod.closureOn);

    if (
      daysUntilClosure > 0 &&
      !window.confirm(
        `This commitment period has ${daysUntilClosure} day${
          daysUntilClosure === 1 ? "" : "s"
        } left. Creating a retrospective now will end it early and start a new retrospective.`
      )
    ) {
      return;
    }

    void props.onCreateRetrospective({
      closureOn,
      ...(defaultTemplateId ? { templateId: defaultTemplateId } : {})
    });
  };

  return (
    <section className="retrospective-shell panel-stack">
      <SectionHeading
        actions={
          <div className="header-action-row">
            {props.state.templates.length > 1 ? (
              <div className="retrospective-header-template">
                <FormSelect
                  label="Template"
                  onValueChange={setSelectedTemplateId}
                  options={props.state.templates.map((template) => ({
                    label: template.name,
                    value: template.id
                  }))}
                  value={defaultTemplateId}
                />
              </div>
            ) : null}
            {home.activePeriod ? (
              <div className="retrospective-header-template">
                <FormField label="Ends on">
                  <FormInput
                    max={latestAllowedClosureOn}
                    min={home.activePeriod.periodStartOn}
                    onChange={(event) => setSelectedClosureOn(event.target.value)}
                    type="date"
                    value={selectedClosureOn}
                  />
                </FormField>
              </div>
            ) : null}
            <Button
              disabled={
                !home.activePeriod ||
                !defaultTemplateId ||
                !selectedClosureOn ||
                selectedClosureOn < home.activePeriod.periodStartOn ||
                selectedClosureOn > latestAllowedClosureOn
              }
              onClick={handleCreateRetrospective}
              type="button"
            >
              <Plus className="size-4" />
              Create Retro
            </Button>
          </div>
        }
        description={
          activePeriod
            ? `${formatIsoDate(activePeriod.periodStartOn)} to ${formatIsoDate(activePeriod.closureOn)}`
            : "No commitment period has been opened yet."
        }
        eyebrow="Retrospective"
        title={
          detail
            ? detail.title
            : home.daysUntilClosure === 0
              ? "Ready for review"
              : `${home.daysUntilClosure ?? 0} days until closure`
        }
      />

      {detail ? (
        <ActiveRetrospectivePanel
          detail={detail}
          onCreateCommitment={props.onCreateCommitment}
          onCreateNote={props.onCreateNote}
          onDeleteNote={props.onDeleteNote}
          onEnterRound={props.onEnterRound}
          onFinalize={props.onFinalize}
          onReviewCommitment={props.onReviewCommitment}
        />
      ) : null}

      <CommitmentTracker
        commitments={detail?.commitments ?? home.commitments}
        onAddCheckin={props.onAddCheckin}
        onDeleteCheckin={props.onDeleteCheckin}
        period={activePeriod}
      />

      {activePeriod && !detail ? (
        <SurfaceCard className="retrospective-card">
          <p className="eyebrow">Notes for next retro</p>
          <div className="retrospective-note-grid">
            {periodNoteRounds.length === 0 ? (
              <EmptyStateCard message="This template has no period note rounds." />
            ) : null}
            {periodNoteRounds.map((round) => (
              <div className="retrospective-period-note-panel" key={round.id}>
                <RetrospectiveNoteList
                  emptyMessage="No visible notes for this prompt yet."
                  notes={home.notes.filter((note) => note.templateRoundId === round.id)}
                  onDeleteNote={props.onDeleteNote}
                />
                <RetrospectiveNoteComposer
                  commitmentPeriodId={activePeriod.id}
                  entryPhase="commitment_period"
                  onCreateNote={props.onCreateNote}
                  round={round}
                />
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : null}
    </section>
  );
}

function ActiveRetrospectivePanel(props: {
  detail: RetrospectiveDetail;
  onCreateCommitment: (
    retrospectiveId: string,
    draft: CommitmentDraft
  ) => Promise<unknown>;
  onCreateNote: (input: {
    body: string;
    commitmentPeriodId: string;
    entryPhase: RetrospectiveNoteWritePhase;
    retrospectiveId?: string | null;
    roundId?: string | null;
    templateRoundId?: string | null;
  }) => Promise<unknown>;
  onDeleteNote: (noteId: string) => Promise<unknown>;
  onEnterRound: (retrospectiveId: string, roundId: string) => Promise<unknown>;
  onFinalize: (retrospectiveId: string) => Promise<unknown>;
  onReviewCommitment: (
    commitmentId: string,
    retrospectiveId: string,
    roundId: string,
    rating: "met" | "mostly_met" | "partly_met" | "missed" | "skipped"
  ) => Promise<unknown>;
}) {
  const currentRound =
    props.detail.rounds.find((round) => round.id === props.detail.currentRoundId) ??
    props.detail.rounds[0] ??
    null;
  const lastRound = props.detail.rounds[props.detail.rounds.length - 1] ?? null;

  return (
    <SurfaceCard className="retrospective-card">
      <SectionHeading
        actions={
          lastRound && currentRound?.id === lastRound.id ? (
            <Button
              disabled={props.detail.status === "finalized"}
              onClick={() => void props.onFinalize(props.detail.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              Finalize
            </Button>
          ) : null
        }
        compact
        description={
          props.detail.period
            ? `${formatIsoDate(props.detail.period.periodStartOn)} to ${formatIsoDate(props.detail.period.closureOn)}`
            : ""
        }
        eyebrow={props.detail.status}
        title={currentRound?.title ?? "Retrospective"}
      />

      <div className="retrospective-round-tabs">
        {props.detail.rounds.map((round) => (
          <Button
            key={round.id}
            onClick={() => void props.onEnterRound(props.detail.id, round.id)}
            size="sm"
            type="button"
            variant={round.id === currentRound?.id ? "default" : "outline"}
          >
            {round.title}
          </Button>
        ))}
      </div>

      {currentRound ? (
        <RetrospectiveRoundBody
          commitments={props.detail.commitments}
          detail={props.detail}
          notes={props.detail.notes.filter((note) => note.roundId === currentRound.id)}
          onCreateCommitment={props.onCreateCommitment}
          onCreateNote={props.onCreateNote}
          onDeleteNote={props.onDeleteNote}
          onReviewCommitment={props.onReviewCommitment}
          round={currentRound}
        />
      ) : null}

    </SurfaceCard>
  );
}

function RetrospectiveRoundBody(props: {
  commitments: Commitment[];
  detail: RetrospectiveDetail;
  notes: RetrospectiveNote[];
  onCreateCommitment: (
    retrospectiveId: string,
    draft: CommitmentDraft
  ) => Promise<unknown>;
  onCreateNote: (input: {
    body: string;
    commitmentPeriodId: string;
    entryPhase: RetrospectiveNoteWritePhase;
    retrospectiveId?: string | null;
    roundId?: string | null;
    templateRoundId?: string | null;
  }) => Promise<unknown>;
  onDeleteNote: (noteId: string) => Promise<unknown>;
  onReviewCommitment: (
    commitmentId: string,
    retrospectiveId: string,
    roundId: string,
    rating: "met" | "mostly_met" | "partly_met" | "missed" | "skipped"
  ) => Promise<unknown>;
  round: RetrospectiveRound;
}) {
  if (props.round.kind === "commitment_capture") {
    return (
      <CommitmentCaptureForm
        onSubmit={(draft) => props.onCreateCommitment(props.detail.id, draft)}
      />
    );
  }

  if (props.round.kind === "task_lookback") {
    return (
      <div className="retrospective-list">
        {props.detail.taskLookback.length === 0 ? (
          <EmptyStateCard message="No completed tasks landed in this period." />
        ) : null}
        {props.detail.taskLookback.map((task) => (
          <div className="retrospective-row" key={task.id}>
            <strong>{task.title}</strong>
            <span>{task.completedAt ? new Date(task.completedAt).toLocaleDateString() : ""}</span>
          </div>
        ))}
      </div>
    );
  }

  if (props.round.kind === "notes") {
    return (
      <div className="retrospective-note-grid">
        <RetrospectiveNoteList
          notes={props.notes}
          onDeleteNote={props.onDeleteNote}
        />
        {props.round.entryPhase === "retrospective" || props.round.entryPhase === "both" ? (
          <RetrospectiveNoteComposer
            commitmentPeriodId={props.detail.commitmentPeriodId}
            entryPhase="retrospective"
            onCreateNote={props.onCreateNote}
            retrospectiveId={props.detail.id}
            round={props.round}
            roundId={props.round.id}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="retrospective-list">
      {props.commitments.length === 0 ? (
        <EmptyStateCard message="No commitments are ready for review." />
      ) : null}
      {props.commitments.map((commitment) => (
        <div className="retrospective-row" key={commitment.id}>
          <span>
            <strong>{commitment.title}</strong>
            <span>{getCommitmentProgressLabel(commitment)}</span>
          </span>
          <div className="retrospective-rating-row">
            {[
              ["met", "Met"],
              ["mostly_met", "Mostly"],
              ["partly_met", "Partly"],
              ["missed", "Missed"],
              ["skipped", "Skip"]
            ].map(([rating, label]) => (
              <Button
                disabled={commitment.status === "reviewed"}
                key={rating}
                onClick={() =>
                  void props.onReviewCommitment(
                    commitment.id,
                    props.detail.id,
                    props.round.id,
                    rating as "met" | "mostly_met" | "partly_met" | "missed" | "skipped"
                  )
                }
                size="sm"
                type="button"
                variant={commitment.status === "reviewed" ? "outline" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RetrospectiveNoteList(props: {
  emptyMessage?: string;
  notes: RetrospectiveNote[];
  onDeleteNote?: (noteId: string) => Promise<unknown>;
}) {
  if (props.notes.length === 0) {
    return <EmptyStateCard message={props.emptyMessage ?? "No notes for this round yet."} />;
  }

  return (
    <div className="retrospective-list">
      {props.notes.map((note) => (
        <div
          className={cn(
            "retrospective-row retrospective-note-row",
            note.visibilityState === "private" && "retrospective-note-row-private",
            note.visibilityState === "private_until_round" &&
              "retrospective-note-row-private-until"
          )}
          key={note.id}
        >
          <span>
            <strong>{note.author?.displayName ?? "Someone"}</strong>
            <span>{note.body}</span>
          </span>
          <div className="retrospective-note-actions">
            <Badge variant="outline">{getRetrospectiveNoteVisibilityLabel(note)}</Badge>
            {props.onDeleteNote ? (
              <Button
                className="rounded-full"
                onClick={() => {
                  void props.onDeleteNote?.(note.id);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Delete note</span>
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function getRetrospectiveNoteVisibilityLabel(note: RetrospectiveNote) {
  switch (note.visibilityState) {
    case "private":
      return "Private to you";
    case "private_until_round":
      return "Private until round";
    case "revealed":
      return "Revealed";
    case "shared":
      return "Shared";
  }
}

function RetrospectiveNoteComposer(props: {
  commitmentPeriodId: string;
  entryPhase: RetrospectiveNoteWritePhase;
  onCreateNote: (input: {
    body: string;
    commitmentPeriodId: string;
    entryPhase: RetrospectiveNoteWritePhase;
    retrospectiveId?: string | null;
    roundId?: string | null;
    templateRoundId?: string | null;
  }) => Promise<unknown>;
  retrospectiveId?: string;
  round: RetrospectiveRound | RetrospectiveTemplateRound;
  roundId?: string;
}) {
  const [body, setBody] = useState("");
  const templateRoundId =
    "sourceTemplateRoundId" in props.round
      ? props.round.sourceTemplateRoundId
      : props.round.id;

  return (
    <form
      className="retrospective-composer"
      onSubmit={(event) => {
        event.preventDefault();

        if (!body.trim()) {
          return;
        }

        void props
          .onCreateNote({
            body,
            commitmentPeriodId: props.commitmentPeriodId,
            entryPhase: props.entryPhase,
            retrospectiveId: props.retrospectiveId ?? null,
            roundId: props.roundId ?? null,
            templateRoundId
          })
          .then(() => setBody(""));
      }}
    >
      <FormField label={props.round.title}>
        <FormTextarea
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            props.round.privacy === "private_until_round"
              ? "Private until this round opens"
              : props.round.privacy === "private"
                ? "Private to you"
                : "Shared with the household"
          }
          value={body}
        />
      </FormField>
      <Button size="sm" type="submit">
        <Heart className="size-4" />
        Add Note
      </Button>
    </form>
  );
}

function CommitmentCaptureForm(props: {
  onSubmit: (draft: CommitmentDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<CommitmentDraft>({
    targetCount: "",
    title: "",
    trackingInterval: "none",
    trackingKind: "binary"
  });

  return (
    <form
      className="retrospective-composer"
      onSubmit={(event) => {
        event.preventDefault();

        if (!draft.title.trim()) {
          return;
        }

        void props.onSubmit(draft).then(() =>
          setDraft({
            targetCount: "",
            title: "",
            trackingInterval: "none",
            trackingKind: "binary"
          })
        );
      }}
    >
      <FormField label="Commitment">
        <FormInput
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          placeholder="Read 3x/week"
          value={draft.title}
        />
      </FormField>
      <div className="retrospective-form-grid">
        <FormSelect
          label="Tracking"
          onValueChange={(value) =>
            setDraft({ ...draft, trackingKind: value as CommitmentTrackingKind })
          }
          options={[
            { label: "Binary", value: "binary" },
            { label: "Count per period", value: "count_per_period" },
            { label: "Checklist", value: "checklist" },
            { label: "Freeform", value: "freeform" }
          ]}
          value={draft.trackingKind}
        />
        <FormSelect
          label="Interval"
          onValueChange={(value) =>
            setDraft({
              ...draft,
              trackingInterval: value as CommitmentDraft["trackingInterval"]
            })
          }
          options={[
            { label: "None", value: "none" },
            { label: "Daily", value: "daily" },
            { label: "Weekly", value: "weekly" },
            { label: "Monthly", value: "monthly" }
          ]}
          value={draft.trackingInterval}
        />
        <FormField label="Target">
          <FormInput
            min={0}
            onChange={(event) =>
              setDraft({ ...draft, targetCount: event.target.value })
            }
            placeholder="3"
            type="number"
            value={draft.targetCount}
          />
        </FormField>
      </div>
      <Button type="submit">
        <Plus className="size-4" />
        Add Commitment
      </Button>
    </form>
  );
}

function CommitmentTracker(props: {
  commitments: Commitment[];
  onAddCheckin: (commitmentId: string) => Promise<unknown>;
  onDeleteCheckin: (checkinId: string) => Promise<unknown>;
  period: CommitmentPeriod | null;
}) {
  return (
    <SurfaceCard className="retrospective-card">
      <p className="eyebrow">Commitments</p>
      {props.commitments.length === 0 ? (
        <EmptyStateCard message="No active commitments yet." />
      ) : (
        <div className="retrospective-list">
          {props.commitments.map((commitment) => (
            <CommitmentTrackerRow
              commitment={commitment}
              key={commitment.id}
              onAddCheckin={props.onAddCheckin}
              onDeleteCheckin={props.onDeleteCheckin}
              period={props.period}
            />
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}

function CommitmentTrackerRow(props: {
  commitment: Commitment;
  onAddCheckin: (commitmentId: string) => Promise<unknown>;
  onDeleteCheckin: (checkinId: string) => Promise<unknown>;
  period: CommitmentPeriod | null;
}) {
  const sortedCheckins = props.commitment.checkins
    .slice()
    .sort((left, right) =>
      left.checkinOn === right.checkinOn
        ? left.createdAt.localeCompare(right.createdAt)
        : left.checkinOn.localeCompare(right.checkinOn)
    );
  const latestCheckin = sortedCheckins[sortedCheckins.length - 1] ?? null;
  const isCountGrid = props.commitment.trackingKind === "count_per_period";
  const targetCount = Math.max(1, props.commitment.targetCount ?? 1);
  const rowCount = isCountGrid
    ? getCommitmentGridRows(props.commitment, props.period)
    : 0;
  const slotCount = rowCount * targetCount;
  const filledCount = Math.min(
    slotCount,
    sortedCheckins.reduce((sum, checkin) => sum + checkin.amount, 0)
  );
  const canMutate = props.commitment.status === "active";

  return (
    <div className="retrospective-row commitment-tracker-row">
      <span>
        <strong>{props.commitment.title}</strong>
        <span>{getCommitmentProgressLabel(props.commitment)}</span>
      </span>
      {isCountGrid ? (
        <div className="commitment-grid-wrap">
          <div
            className="commitment-check-grid"
            style={{ gridTemplateColumns: `repeat(${targetCount}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: slotCount }, (_, index) => (
              <span
                aria-label={index < filledCount ? "Completed slot" : "Open slot"}
                className={cn(
                  "commitment-check-cell",
                  index < filledCount && "commitment-check-cell-filled"
                )}
                key={index}
                role="img"
              />
            ))}
          </div>
          <div className="commitment-stepper">
            <Button
              disabled={!canMutate || filledCount >= slotCount}
              onClick={() => void props.onAddCheckin(props.commitment.id)}
              size="icon"
              type="button"
              variant="outline"
            >
              <Plus className="size-4" />
              <span className="sr-only">Add progress</span>
            </Button>
            <Button
              disabled={!canMutate || !latestCheckin}
              onClick={() => latestCheckin && void props.onDeleteCheckin(latestCheckin.id)}
              size="icon"
              type="button"
              variant="outline"
            >
              <span aria-hidden="true">-</span>
              <span className="sr-only">Remove progress</span>
            </Button>
          </div>
        </div>
      ) : (
        <Button
          disabled={!canMutate}
          onClick={() => void props.onAddCheckin(props.commitment.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Check className="size-4" />
          Mark
        </Button>
      )}
    </div>
  );
}

function RecurringView(props: {
  canAdmin: boolean;
  isTemplateEditorOpen: boolean;
  labels: Label[];
  onSaveTemplate: (draft: TemplateDraft) => Promise<void>;
  onSelectTemplate: (templateId: string | "new" | null) => void;
  recurringTemplates: RecurringTemplate[];
  selectedTemplate: RecurringTemplate | null;
  users: UserRef[];
}) {
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(
    createTemplateDraft(props.selectedTemplate)
  );

  useEffect(() => {
    setTemplateDraft(createTemplateDraft(props.selectedTemplate));
  }, [props.selectedTemplate]);

  if (!props.canAdmin) {
    return (
      <StatusMessageCard
        description="The current browser session does not have admin access."
        title="Recurring templates are reserved for household admins."
      />
    );
  }

  return (
    <section className="settings-shell">
      <div className="settings-page-stack">
        <SurfaceCard className="settings-card gap-0 py-0">
          <SectionHeading
            actions={
              <Button
                onClick={() => props.onSelectTemplate("new")}
                size="sm"
                type="button"
                variant="outline"
              >
                New Template
              </Button>
            }
            eyebrow="Recurring Work"
            title="Templates"
          />
          <div className="template-list">
            {props.recurringTemplates.length === 0 ? (
              <EmptyStateCard message="No recurring templates yet." />
            ) : null}
            {props.recurringTemplates.map((template) => (
              <SelectionListButton
                active={props.selectedTemplate?.id === template.id}
                key={template.id}
                label={template.title}
                meta={formatRecurringScheduleMeta(template)}
                onClick={() => props.onSelectTemplate(template.id)}
              />
            ))}
          </div>
        </SurfaceCard>
      </div>

      {props.isTemplateEditorOpen ? (
        <RecurringTemplateDrawer
          draft={templateDraft}
          labels={props.labels}
          onChange={setTemplateDraft}
          onClose={() => props.onSelectTemplate(null)}
          onSubmit={() => {
            void props.onSaveTemplate(templateDraft);
          }}
          selectedTemplate={props.selectedTemplate}
          users={props.users}
        />
      ) : null}
    </section>
  );
}

function RecurringTemplateDrawer(props: {
  draft: TemplateDraft;
  labels: Label[];
  onChange: (draft: TemplateDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  selectedTemplate: RecurringTemplate | null;
  users: UserRef[];
}) {
  return (
    <div
      className="sheet-backdrop recurring-drawer-backdrop"
      onClick={props.onClose}
      role="presentation"
    >
      <aside
        aria-label="Recurring template editor"
        className="sheet-panel recurring-drawer-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-header">
          <div className="sheet-header-copy">
            <p className="eyebrow">Recurring Work</p>
            <h2>{props.selectedTemplate ? props.selectedTemplate.title : "New Template"}</h2>
            <p className="section-copy">
              Set the cadence, defaults, and checklist once, then let the board keep the rhythm.
            </p>
          </div>
          <Button
            className="rounded-full"
            onClick={props.onClose}
            size="icon"
            type="button"
            variant="outline"
          >
            <X className="size-4" />
            <span className="sr-only">Close recurring template editor</span>
          </Button>
        </header>
        <div className="sheet-body">
          <RecurringTemplateForm
            draft={props.draft}
            labels={props.labels}
            onChange={props.onChange}
            onSubmit={props.onSubmit}
            users={props.users}
          />
        </div>
      </aside>
    </div>
  );
}

function RecurringTemplateForm(props: {
  draft: TemplateDraft;
  labels: Label[];
  onChange: (draft: TemplateDraft) => void;
  onSubmit: () => void;
  users: UserRef[];
}) {
  return (
    <div className="form-grid">
      <FormField className="wide" label="Title">
        <FormInput
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              title: event.target.value
            })
          }
          value={props.draft.title}
        />
      </FormField>
      <FormField className="wide" label="Description">
        <FormTextarea
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              description: event.target.value
            })
          }
          rows={4}
          value={props.draft.description}
        />
      </FormField>
      <FormSelect
        allowEmptyOption
        label="Default assignee"
        onValueChange={(value) =>
          props.onChange({
            ...props.draft,
            defaultAssigneeUserId: value
          })
        }
        options={props.users
          .filter((user) => !user.deactivatedAt)
          .map((user) => ({
            label: user.displayName,
            value: user.id
          }))}
        placeholder="Unassigned"
        value={props.draft.defaultAssigneeUserId}
      />
      <FormField label="Next occurrence">
        <FormInput
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              nextOccurrenceOn: event.target.value
            })
          }
          type="date"
          value={props.draft.nextOccurrenceOn}
        />
      </FormField>
      <FormField label="Due time">
        <FormInput
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              defaultDueTime: event.target.value
            })
          }
          type="time"
          value={props.draft.defaultDueTime}
        />
      </FormField>
      <FormSelect
        label="Cadence"
        onValueChange={(value) =>
          props.onChange({
            ...props.draft,
            recurrenceCadence: value as "daily" | "weekly" | "monthly"
          })
        }
        options={[
          { label: "Daily", value: "daily" },
          { label: "Weekly", value: "weekly" },
          { label: "Monthly", value: "monthly" }
        ]}
        value={props.draft.recurrenceCadence}
      />
      <FormField label="Interval">
        <FormInput
          min={1}
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              recurrenceInterval: Number(event.target.value)
            })
          }
          type="number"
          value={props.draft.recurrenceInterval}
        />
      </FormField>
      <ToggleField
        checked={props.draft.isActive}
        label="Template is active"
        onCheckedChange={(value) =>
          props.onChange({
            ...props.draft,
            isActive: value
          })
        }
      />
      <ToggleField
        checked={props.draft.aiAssistanceEnabledDefault}
        label="Occurrences are AI-eligible by default"
        onCheckedChange={(value) =>
          props.onChange({
            ...props.draft,
            aiAssistanceEnabledDefault: value
          })
        }
      />

      <div className="sheet-section wide">
        <SectionHeading
          actions={
            <Button
              onClick={() =>
                props.onChange({
                  ...props.draft,
                  checklistItems: [
                    ...props.draft.checklistItems,
                    {
                      body: "",
                      clientId: crypto.randomUUID()
                    }
                  ]
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Add Item
            </Button>
          }
          compact
          eyebrow="Template Checklist"
          title="Recurring subtasks"
          titleAs="h3"
        />
        <div className="checklist-editor">
          {props.draft.checklistItems.map((item, index) => (
            <div className="checklist-row" key={item.clientId}>
              <FormInput
                onChange={(event) =>
                  props.onChange({
                    ...props.draft,
                    checklistItems: props.draft.checklistItems.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, body: event.target.value }
                        : entry
                    )
                  })
                }
                placeholder="Template checklist item"
                value={item.body}
              />
              <Button
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    checklistItems: props.draft.checklistItems.filter(
                      (_, entryIndex) => entryIndex !== index
                    )
                  })
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          ))}
          {props.draft.checklistItems.length === 0 ? (
            <EmptyStateCard message="No recurring checklist items yet." />
          ) : null}
        </div>
      </div>

      <div className="sheet-section wide">
        <SectionHeading compact eyebrow="Labels" title="Template tags" titleAs="h3" />
        <div className="checkbox-grid">
          {props.labels.map((label) => (
            <ChoiceChip
              checked={props.draft.labelIds.includes(label.id)}
              key={label.id}
              label={label.name}
              onCheckedChange={(checked) =>
                props.onChange({
                  ...props.draft,
                  labelIds: checked === true
                    ? [...props.draft.labelIds, label.id]
                    : props.draft.labelIds.filter((entry) => entry !== label.id)
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="sheet-actions wide">
        <Button
          disabled={!props.draft.title.trim() || !props.draft.nextOccurrenceOn}
          onClick={props.onSubmit}
          type="button"
        >
          Save Template
        </Button>
      </div>
    </div>
  );
}

export default App;
