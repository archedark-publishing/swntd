import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type ComponentType,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import {
  CalendarDays,
  CalendarPlus2,
  X,
  Menu,
  Plus,
  Tag,
  Trash2,
  UserRound
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
  downloadAttachment,
  isConflictError,
  taskStatuses,
  type Actor,
  type Attachment,
  type Label,
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
import { toast } from "sonner";
import "./styles.css";

type ViewName = "archive" | "board" | "settings";
type SettingsPage = "general" | "household" | "labels" | "recurring";
type TaskDetailControlId = "assignee" | "calendar" | "due" | "labels" | "status";

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

type HouseholdUserDraft = {
  displayName: string;
  email: string;
  mode: "admin" | "service";
  serviceKind: string;
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
  { id: "archive", label: "Archive" }
];
const settingsNavItems: Array<{ id: SettingsPage; label: string }> = [
  { id: "general", label: "General" },
  { id: "household", label: "Household" },
  { id: "labels", label: "Labels" },
  { id: "recurring", label: "Recurring" }
];

function isSettingsPage(value: string | undefined): value is SettingsPage {
  return value === "general" || value === "household" || value === "labels" || value === "recurring";
}

function readRouteFromHash(): {
  onlyMyTasks: boolean;
  settingsPage: SettingsPage;
  view: ViewName;
} {
  const hash = window.location.hash.replace(/^#/, "");
  const [viewPart, subpagePart] = hash.split("/");

  if (viewPart === "my-tasks") {
    return { onlyMyTasks: true, settingsPage: "general", view: "board" };
  }

  if (viewPart === "archive") {
    return { onlyMyTasks: false, settingsPage: "general", view: "archive" };
  }

  if (viewPart === "settings") {
    return {
      onlyMyTasks: false,
      settingsPage: isSettingsPage(subpagePart) ? subpagePart : "general",
      view: "settings"
    };
  }

  return { onlyMyTasks: false, settingsPage: "general", view: "board" };
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

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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

export function App() {
  const initialRoute = readRouteFromHash();
  const [view, setView] = useState<ViewName>(initialRoute.view);
  const [onlyMyTasks, setOnlyMyTasks] = useState(initialRoute.onlyMyTasks);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(initialRoute.settingsPage);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [isBooting, setIsBooting] = useState(true);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | "new" | null>(null);
  const [editingUserKey, setEditingUserKey] = useState<string | "new-admin" | "new-service" | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");
  const deferredArchiveSearch = useDeferredValue(archiveSearch);
  const hasLoadedRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = readRouteFromHash();

      setView(nextRoute.view);
      setOnlyMyTasks(nextRoute.onlyMyTasks);
      setSettingsPage(nextRoute.settingsPage);
    };

    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    const nextHash = view === "settings" ? `settings/${settingsPage}` : view;

    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }
  }, [settingsPage, view]);

  useEffect(() => {
    if (!isNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isNavOpen]);

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

          if (me.actor.role === "admin") {
            const [users, labels, settings, recurringTemplates] = await Promise.all([
              api.listUsers(),
              api.listLabels(),
              api.getSettings(),
              api.listRecurringTemplates()
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
          if (!options?.background) {
            showErrorToast(
              buildFlashMessage(error),
              "refresh-error"
            );
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

  function handleViewChange(nextView: ViewName) {
    setView(nextView);
    setOnlyMyTasks(false);

    setIsNavOpen(false);
  }

  function handleSettingsPageChange(nextPage: SettingsPage) {
    setView("settings");
    setSettingsPage(nextPage);
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

    await runMutation(
      () =>
        api.reorderTask(task.id, {
          expectedRevision: task.revision,
          targetIndex
        }),
      "Task order updated."
    );
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

      await runMutation(
        () =>
          api.reorderTask(task.id, {
            expectedRevision: task.revision,
            targetIndex: safeTargetIndex
          }),
        "Task order updated."
      );

      return;
    }

    await runMutation(async () => {
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
    }, `Moved "${task.title}" to ${input.targetStatus}.`);
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

  async function handleComment(task: TaskDetail, body: string) {
    await runMutation(
      () => api.addComment(task.id, { body }),
      "Comment added."
    );
  }

  async function handleAttachmentLink(task: TaskDetail, input: { name: string; url: string }) {
    await runMutation(
      () => api.addAttachmentLink(task.id, input),
      "Link attached."
    );
  }

  async function handleAttachmentUpload(task: TaskDetail, file: File) {
    await runMutation(
      () => api.uploadAttachment(task.id, file),
      "File attached."
    );
  }

  async function handleSettingsSave(nextSettings: Settings) {
    await runMutation(
      () =>
        api.updateSettings({
          defaultCalendarExportKind: nextSettings.defaultCalendarExportKind,
          defaultTimezone: nextSettings.defaultTimezone,
          doneArchiveAfterDays: nextSettings.doneArchiveAfterDays
        }),
      "Household settings saved."
    );
  }

  async function handleLabelCreate(input: { color: string; name: string }) {
    await runMutation(
      () =>
        api.createLabel({
          color: input.color.trim() || null,
          name: input.name.trim()
        }),
      "Label added."
    );
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

  return (
    <main className="app-shell">
      <div className="grain" />
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
              visibleTasks={onlyMyTasks ? myTasks : activeTasks}
            />
          ) : null}

          {!isBooting && view === "archive" ? (
            <section className="panel-stack">
              <SectionHeading
                actions={
                  <SearchField
                    label="Search archive"
                    onChange={setArchiveSearch}
                    placeholder="Search titles or notes"
                    value={archiveSearch}
                  />
                }
                eyebrow="History"
                title="Archive"
              />
              <TaskListView
                aiAssistanceLabel={getAiAssistanceLabel(snapshot.users)}
                description="A place for finished errands, closed loops, and things you only need to remember once in a while."
                emptyMessage="Nothing has been archived yet."
                onOpenTask={openTask}
                onQuickMove={() => Promise.resolve()}
                onReorder={() => Promise.resolve()}
                showHeader={false}
                tasks={archivedTasks}
                title="Archive"
              />
            </section>
          ) : null}

          {!isBooting && view === "settings" ? (
            <SettingsView
              activePage={settingsPage}
              canAdmin={canAdmin}
              labels={snapshot.labels}
              onCreateLabel={handleLabelCreate}
              onIssueServiceToken={handleServiceTokenIssue}
              onRemoveUser={handleHouseholdUserRemove}
              onRevokeServiceToken={handleServiceTokenRevoke}
              onSaveSettings={handleSettingsSave}
              onSaveTemplate={handleTemplateSave}
              onSaveUser={handleHouseholdUserSave}
              onSelectPage={handleSettingsPageChange}
              onSelectTemplate={(templateKey) => {
                setEditingTemplateKey(templateKey);
                setSettingsPage("recurring");
              }}
              onSelectUser={(userKey) => {
                setEditingUserKey(userKey);
                setSettingsPage("household");
              }}
              isTemplateEditorOpen={editingTemplateKey !== null}
              isUserEditorOpen={editingUserKey !== null}
              recurringTemplates={snapshot.recurringTemplates}
              selectedTemplate={
                editingTemplateKey && editingTemplateKey !== "new"
                  ? snapshot.recurringTemplates.find(
                      (template) => template.id === editingTemplateKey
                    ) ?? null
                  : null
              }
              selectedUser={selectedHouseholdUser}
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
        onAddAttachmentLink={handleAttachmentLink}
        onAddComment={handleComment}
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
        onUploadAttachment={handleAttachmentUpload}
        settings={snapshot.settings}
        task={selectedTask}
        users={snapshot.users}
        variant={isCreatingTask ? "create" : "detail"}
      />
      <Toaster />
    </main>
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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
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
          <Button onClick={props.onCreateTask} size="icon" type="button" variant="outline">
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

  return (
    <SurfaceCard
      className={cn(
        "task-card gap-0 py-0",
        props.isDragging && "task-card-dragging",
        isPlaceholder && "task-card-placeholder"
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
            <Badge className="task-meta-pill" variant="outline">
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
              <Badge className="label-pill" key={label.id} variant="outline">
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
  onAddAttachmentLink: (task: TaskDetail, input: { name: string; url: string }) => Promise<void>;
  onAddComment: (task: TaskDetail, body: string) => Promise<void>;
  onArchive: (task: TaskDetail) => Promise<void>;
  onCalendarAction: (task: TaskDetail, kind: "google" | "ics") => void;
  onClose: () => void;
  onDownloadAttachment: (attachment: Attachment) => Promise<void>;
  onSave: (
    draft: TaskDraft,
    options?: { silentSuccess?: boolean }
  ) => Promise<TaskDetail | null>;
  onStatusChange: (task: TaskDetail, status: TaskStatus) => Promise<void>;
  onUnarchive: (task: TaskDetail) => Promise<void>;
  onUploadAttachment: (task: TaskDetail, file: File) => Promise<void>;
  settings: Settings | null;
  task: TaskDetail | null;
  users: UserRef[];
  variant: "create" | "detail";
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => createTaskDraft(null));
  const [activeControl, setActiveControl] = useState<TaskDetailControlId | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [linkDraft, setLinkDraft] = useState({ name: "", url: "" });
  const lastServerDraftKeyRef = useRef(serializeTaskDraft(createTaskDraft(null)));
  const currentTaskIdRef = useRef<string | null>(null);
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
    } else {
      currentTaskIdRef.current = null;
      lastServerDraftKeyRef.current = nextDraftKey;
      setDraft(nextDraft);
    }

    setActiveControl(null);
    setCommentBody("");
    setLinkDraft({ name: "", url: "" });
  }, [props.task, props.variant]);

  useEffect(() => {
    if (props.variant !== "detail") {
      return;
    }

    resizeTitleInput();
  }, [draft.title, props.variant, resizeTitleInput]);

  useEffect(() => {
    if (props.variant !== "detail" || !props.task || props.isSavingDisabled) {
      return;
    }

    const serverDraftKey = serializeTaskDraft(createTaskDraft(props.task));
    const currentDraftKey = serializeTaskDraft(draft);

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

    props.onClose();
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
              <div className="sheet-actions detail-actions">
                {currentTask.archivedAt ? (
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

          {currentTask ? (
            <>
              <section className="sheet-section">
                <SectionHeading compact eyebrow="Comments" title="Conversation" titleAs="h3" />
                <div className="timeline">
                  {currentTask.comments.length === 0 ? (
                    <EmptyStateCard message="No comments yet." />
                  ) : null}
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
                <FormField label="Add a comment">
                  <FormTextarea
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Leave a note for the household."
                    rows={3}
                    value={commentBody}
                  />
                </FormField>
                <Button
                  onClick={() => {
                    if (!commentBody.trim()) {
                      return;
                    }

                    void props.onAddComment(currentTask, commentBody.trim());
                    setCommentBody("");
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Add Comment
                </Button>
              </section>

              <section className="sheet-section">
                <SectionHeading compact eyebrow="Attachments" title="Files and links" titleAs="h3" />
                <div className="attachment-list">
                  {currentTask.attachments.length === 0 ? (
                    <EmptyStateCard message="No attachments yet." />
                  ) : null}
                  {currentTask.attachments.map((attachment) => (
                    <InfoRow
                      action={
                        attachment.storageKind === "upload" ? (
                          <Button
                            onClick={() => {
                              void props.onDownloadAttachment(attachment);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Download
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={attachment.externalUrl ?? "#"}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open Link
                            </a>
                          </Button>
                        )
                      }
                      key={attachment.id}
                    >
                      <div>
                        <strong>{attachment.originalName}</strong>
                        <p>
                          Added by {attachment.uploadedBy.displayName} on{" "}
                          {formatTimestamp(attachment.createdAt)}
                        </p>
                      </div>
                    </InfoRow>
                  ))}
                </div>
                <div className="sheet-actions">
                  <FormField className="file-input" label="Upload file">
                    <FormInput
                      accept=".csv,.heic,.jpeg,.jpg,.json,.md,.pdf,.png,.txt,.webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (!file) {
                          return;
                        }

                        void props.onUploadAttachment(currentTask, file);
                        event.currentTarget.value = "";
                      }}
                      type="file"
                    />
                  </FormField>
                  <FormField className="compact-field" label="Link label">
                    <FormInput
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                      placeholder="Reference note"
                      value={linkDraft.name}
                    />
                  </FormField>
                  <FormField className="compact-field" label="URL">
                    <FormInput
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          url: event.target.value
                        }))
                      }
                      placeholder="https://example.com"
                      type="url"
                      value={linkDraft.url}
                    />
                  </FormField>
                  <Button
                    onClick={() => {
                      if (!linkDraft.name.trim() || !linkDraft.url.trim()) {
                        return;
                      }

                      void props.onAddAttachmentLink(currentTask, {
                        name: linkDraft.name.trim(),
                        url: linkDraft.url.trim()
                      });
                      setLinkDraft({ name: "", url: "" });
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Attach Link
                  </Button>
                </div>
              </section>
            </>
          ) : null}
        </div>
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
    ? formatDate(props.draft.dueOn, props.draft.dueTime || null)
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
          active={props.activeControl === "calendar"}
          disabled={!props.currentTask.dueOn || !props.settings}
          emptyIcon={CalendarPlus2}
          onClick={() => props.onToggleControl("calendar")}
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

      {props.activeControl === "calendar" ? (
        <div className="detail-control-panel">
          <div className="detail-control-options">
            <Button
              className="rounded-full"
              disabled={!props.currentTask.dueOn || !props.settings}
              onClick={() => props.onCalendarAction(props.currentTask, "google")}
              size="sm"
              type="button"
              variant="outline"
            >
              Open Google Calendar
            </Button>
            <Button
              className="rounded-full"
              disabled={!props.currentTask.dueOn || !props.settings}
              onClick={() => props.onCalendarAction(props.currentTask, "ics")}
              size="sm"
              type="button"
              variant="outline"
            >
              Download .ics
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
  onChange: (draft: TaskDraft) => void;
  onSubmit: () => void;
  showSubmitButton: boolean;
  showTitleField: boolean;
  submitLabel: string;
  users: UserRef[];
  variant: "create" | "detail";
}) {
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
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    checklistItems: [
                      ...props.draft.checklistItems,
                      {
                        body: "",
                        clientId: crypto.randomUUID(),
                        isCompleted: false
                      }
                    ]
                  })
                }
                size="icon"
                type="button"
                variant="outline"
              >
                <Plus className="size-4" />
                <span className="sr-only">Add checklist item</span>
              </Button>
            </div>
            <div className="checklist-editor">
              {props.draft.checklistItems.map((item, index) => (
                <div className="checklist-row" key={item.clientId}>
                  <Checkbox
                    checked={item.isCompleted}
                    disabled={!props.canEdit}
                    onCheckedChange={(checked) =>
                      props.onChange({
                        ...props.draft,
                        checklistItems: props.draft.checklistItems.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, isCompleted: checked === true }
                            : entry
                        )
                      })
                    }
                  />
                  <FormInput
                    disabled={!props.canEdit}
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
                    placeholder="Subtask description"
                    value={item.body}
                  />
                  <Button
                    className="checklist-remove-button"
                    disabled={!props.canEdit}
                    onClick={() =>
                      props.onChange({
                        ...props.draft,
                        checklistItems: props.draft.checklistItems.filter(
                          (_, entryIndex) => entryIndex !== index
                        )
                      })
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Remove checklist item</span>
                  </Button>
                </div>
              ))}
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

function SettingsView(props: {
  activePage: SettingsPage;
  canAdmin: boolean;
  isTemplateEditorOpen: boolean;
  isUserEditorOpen: boolean;
  labels: Label[];
  onCreateLabel: (input: { color: string; name: string }) => Promise<void>;
  onIssueServiceToken: (
    userId: string,
    name: string
  ) => Promise<{ item: ServiceToken; plainTextToken: string } | null>;
  onRemoveUser: (userId: string) => Promise<boolean>;
  onRevokeServiceToken: (tokenId: string) => Promise<void>;
  onSaveSettings: (settings: Settings) => Promise<void>;
  onSaveTemplate: (draft: TemplateDraft) => Promise<void>;
  onSaveUser: (userId: string | null, draft: HouseholdUserDraft) => Promise<boolean>;
  onSelectPage: (page: SettingsPage) => void;
  onSelectTemplate: (templateId: string | "new" | null) => void;
  onSelectUser: (userKey: string | "new-admin" | "new-service" | null) => void;
  recurringTemplates: RecurringTemplate[];
  selectedTemplate: RecurringTemplate | null;
  selectedUser: UserRef | null;
  serviceTokensByUserId: Record<string, ServiceToken[]>;
  settings: Settings | null;
  userEditorMode: "admin" | "service";
  users: UserRef[];
}) {
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(props.settings);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(
    createTemplateDraft(props.selectedTemplate)
  );
  const [userDraft, setUserDraft] = useState<HouseholdUserDraft>(
    createHouseholdUserDraft(props.selectedUser, props.userEditorMode)
  );
  const [serviceTokenName, setServiceTokenName] = useState("");
  const [issuedServiceToken, setIssuedServiceToken] = useState<string | null>(null);
  const [userActionMessage, setUserActionMessage] = useState<string | null>(null);
  const [isUserRemovePending, setIsUserRemovePending] = useState(false);
  const [isUserSavePending, setIsUserSavePending] = useState(false);

  useEffect(() => {
    setSettingsDraft(props.settings);
  }, [props.settings]);

  useEffect(() => {
    setTemplateDraft(createTemplateDraft(props.selectedTemplate));
  }, [props.selectedTemplate]);

  useEffect(() => {
    setUserDraft(createHouseholdUserDraft(props.selectedUser, props.userEditorMode));
    setServiceTokenName("");
    setIssuedServiceToken(null);
    setUserActionMessage(null);
    setIsUserRemovePending(false);
    setIsUserSavePending(false);
  }, [props.selectedUser, props.userEditorMode]);

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
              description="Tune the default timezone, archive cadence, and calendar preference."
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
            <div className="sheet-actions">
              <Button
                onClick={() => {
                  void props.onSaveSettings(settingsDraft);
                }}
                type="button"
              >
                Save Settings
              </Button>
            </div>
          </SurfaceCard>
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
                    {props.selectedUser ? (
                      <EmptyStateCard
                        message="Removing an actor is permanent. They stay attached to past comments and history, but disappear from the household cast, cannot be assigned to anything new, and assistants lose any active tokens."
                      />
                    ) : null}

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
                  <EmptyStateCard message="Choose someone from the cast or start a new person or assistant." />
                )}
              </div>
            </div>
          </SurfaceCard>
        ) : null}

        {props.activePage === "labels" ? (
          <SurfaceCard className="settings-card gap-0 py-0">
            <SectionHeading
              description="Create short labels for things like errands, bills, cleaning, shopping, or anything else you want to scan quickly on the board."
              eyebrow="Labels"
              title="Tag Library"
            />
            <div className="sheet-actions">
              <FormField className="compact-field" label="Name">
                <FormInput
                  onChange={(event) => setLabelName(event.target.value)}
                  placeholder="Errand"
                  value={labelName}
                />
              </FormField>
              <FormField className="compact-field" label="Color note">
                <FormInput
                  onChange={(event) => setLabelColor(event.target.value)}
                  placeholder="#c96 or brass"
                  value={labelColor}
                />
              </FormField>
              <Button
                onClick={() => {
                  if (!labelName.trim()) {
                    return;
                  }

                  void props.onCreateLabel({
                    color: labelColor,
                    name: labelName
                  });
                  setLabelName("");
                  setLabelColor("");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Add Label
              </Button>
            </div>
            {props.labels.length > 0 ? (
              <div className="label-row roomy">
                {props.labels.map((label) => (
                  <Badge className="label-pill" key={label.id} variant="outline">
                    {label.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyStateCard message="No labels yet. Add a few tags to make the board easier to scan." />
            )}
          </SurfaceCard>
        ) : null}

        {props.activePage === "recurring" ? (
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
            <div className="template-grid">
              <div className="template-list">
                {props.recurringTemplates.length === 0 ? (
                  <EmptyStateCard message="No recurring templates yet." />
                ) : null}
                {props.recurringTemplates.map((template) => (
                  <SelectionListButton
                    active={props.selectedTemplate?.id === template.id}
                    key={template.id}
                    label={template.title}
                    meta={`${template.recurrenceCadence} every ${template.recurrenceInterval}`}
                    onClick={() => props.onSelectTemplate(template.id)}
                  />
                ))}
              </div>
              <div className="template-editor">
                {props.isTemplateEditorOpen ? (
                  <RecurringTemplateForm
                    draft={templateDraft}
                    labels={props.labels}
                    onChange={setTemplateDraft}
                    onSubmit={() => {
                      void props.onSaveTemplate(templateDraft);
                    }}
                    users={props.users}
                  />
                ) : (
                  <EmptyStateCard message="Choose a recurring template or start a new one." />
                )}
              </div>
            </div>
          </SurfaceCard>
        ) : null}
      </div>
    </section>
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
