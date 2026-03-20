import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
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
import "./styles.css";

type ViewName = "archive" | "board" | "my-tasks" | "settings";

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
  { id: "my-tasks", label: "My Tasks" },
  { id: "archive", label: "Archive" },
  { id: "settings", label: "Settings" }
];

function readViewFromHash(): ViewName {
  const hash = window.location.hash.replace("#", "");

  if (hash === "my-tasks" || hash === "archive" || hash === "settings") {
    return hash;
  }

  return "board";
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
    ? `Allow ${serviceActorName} to pick this up when assigned`
    : "Allow the household assistant to pick this up when assigned";
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

export function App() {
  const [view, setView] = useState<ViewName>(() => readViewFromHash());
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [isBooting, setIsBooting] = useState(true);
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingUserKey, setEditingUserKey] = useState<string | "new-admin" | "new-service" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");
  const deferredArchiveSearch = useDeferredValue(archiveSearch);
  const hasLoadedRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    window.location.hash = view;
  }, [view]);

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

      setErrorMessage(buildFlashMessage(error));
    }
  });

  const refreshApp = useEffectEvent(
    async (options?: { background?: boolean; showSpinner?: boolean }) => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

      if (options?.showSpinner) {
        setIsManualRefreshPending(true);
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
          setErrorMessage(null);
        } catch (error) {
          setErrorMessage(buildFlashMessage(error));
        } finally {
          setIsBooting(false);
          setIsManualRefreshPending(false);
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
    options?: { closeTaskSheet?: boolean }
  ) {
    try {
      const result = await action();
      setNotice(successMessage);
      setErrorMessage(null);

      if (options?.closeTaskSheet) {
        setIsTaskSheetOpen(false);
        setIsCreatingTask(false);
      }

      await refreshApp({ background: true });
      return result;
    } catch (error) {
      setErrorMessage(buildFlashMessage(error));

      if (isConflictError(error)) {
        await refreshApp({ background: true });
      }

      return null;
    }
  }

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setIsCreatingTask(false);
    setIsTaskSheetOpen(true);
  }

  function openNewTask() {
    setSelectedTaskId(null);
    setSelectedTask(null);
    setIsCreatingTask(true);
    setIsTaskSheetOpen(true);
  }

  async function handleTaskSubmit(draft: TaskDraft) {
    const payload = {
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
      labelIds: draft.labelIds,
      title: draft.title.trim()
    };

    if (isCreatingTask) {
      await runMutation(async () => {
        const created = await api.createTask(payload);

        setSelectedTaskId(created.item.id);
      }, "Task added to the ledger.", { closeTaskSheet: true });

      return;
    }

    if (!selectedTask) {
      return;
    }

    await runMutation(
      () =>
        api.updateTask(selectedTask.id, {
          ...payload,
          expectedRevision: selectedTask.revision
        }),
      "Task details updated."
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

    if (editingTemplateId) {
      await runMutation(
        () => api.updateRecurringTemplate(editingTemplateId, payload),
        "Recurring template updated."
      );
    } else {
      await runMutation(
        () => api.createRecurringTemplate(payload),
        "Recurring template added."
      );
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
      <header className="masthead">
        <div>
          <p className="eyebrow">Household Ledger</p>
          <h1>S#!% We Need To Do</h1>
          <p className="subtitle">
            A shared board for chores, errands, recurring rituals, and the small
            domestic plot twists that keep a household moving.
          </p>
        </div>
        <div className="masthead-actions">
          <button
            className="secondary-button"
            onClick={() => {
              startTransition(() => {
                void refreshApp({ background: true, showSpinner: true });
              });
            }}
            type="button"
          >
            {isManualRefreshPending ? "Refreshing..." : "Refresh"}
          </button>
          {canAdmin ? (
            <button className="primary-button" onClick={openNewTask} type="button">
              New Task
            </button>
          ) : null}
          <div className="actor-chip">
            <strong>{snapshot.actor?.displayName ?? "Loading..."}</strong>
            <span>{snapshot.actor ? formatRoleLabel(snapshot.actor) : "guest"}</span>
          </div>
        </div>
      </header>

      <nav aria-label="Primary views" className="view-nav">
        {navItems.map((item) => (
          <button
            className={item.id === view ? "nav-pill nav-pill-active" : "nav-pill"}
            key={item.id}
            onClick={() => setView(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {notice ? (
        <div aria-live="polite" className="notice-banner">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <div aria-live="polite" className="error-banner">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      {isBooting ? (
        <section className="status-panel">
          <h2>Opening the ledger...</h2>
          <p>Fetching the latest board state, settings, and household cast.</p>
        </section>
      ) : null}

      {!isBooting && view === "board" ? (
        <BoardView
          aiAssistanceLabel={getAiAssistanceLabel(snapshot.users)}
          tasks={activeTasks}
          onOpenTask={openTask}
          onQuickMove={handleQuickMove}
          onReorder={handleReorder}
        />
      ) : null}

      {!isBooting && view === "my-tasks" ? (
        <TaskListView
          aiAssistanceLabel={getAiAssistanceLabel(snapshot.users)}
          description="Work with your name on it, with quick status moves and a clean shortlist."
          emptyMessage="Nothing is assigned to you right now."
          onOpenTask={openTask}
          onQuickMove={handleQuickMove}
          onReorder={handleReorder}
          tasks={myTasks}
          title="My Tasks"
        />
      ) : null}

      {!isBooting && view === "archive" ? (
        <section className="panel-stack">
          <div className="section-header">
            <div>
              <p className="eyebrow">History</p>
              <h2>Archive</h2>
            </div>
            <label className="search-field">
              <span>Search archive</span>
              <input
                onChange={(event) => setArchiveSearch(event.target.value)}
                placeholder="Search titles or notes"
                type="search"
                value={archiveSearch}
              />
            </label>
          </div>
          <TaskListView
            aiAssistanceLabel={getAiAssistanceLabel(snapshot.users)}
            description="A place for finished errands, closed loops, and things you only need to remember once in a while."
            emptyMessage="Nothing has been archived yet."
            onOpenTask={openTask}
            onQuickMove={() => Promise.resolve()}
            onReorder={() => Promise.resolve()}
            tasks={archivedTasks}
            title="Archive"
          />
        </section>
      ) : null}

      {!isBooting && view === "settings" ? (
        <SettingsView
          canAdmin={canAdmin}
          labels={snapshot.labels}
          onCreateLabel={handleLabelCreate}
          onIssueServiceToken={handleServiceTokenIssue}
          onRemoveUser={handleHouseholdUserRemove}
          onRevokeServiceToken={handleServiceTokenRevoke}
          onSaveSettings={handleSettingsSave}
          onSaveTemplate={handleTemplateSave}
          onSaveUser={handleHouseholdUserSave}
          onSelectTemplate={(templateId) => setEditingTemplateId(templateId)}
          onSelectUser={setEditingUserKey}
          recurringTemplates={snapshot.recurringTemplates}
          selectedTemplate={
            snapshot.recurringTemplates.find(
              (template) => template.id === editingTemplateId
            ) ?? null
          }
          selectedUser={selectedHouseholdUser}
          serviceTokensByUserId={snapshot.serviceTokensByUserId}
          settings={snapshot.settings}
          userEditorMode={householdUserEditorMode}
          users={snapshot.users}
        />
      ) : null}

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
            setErrorMessage(buildFlashMessage(error));
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
    </main>
  );
}

function BoardView(props: {
  aiAssistanceLabel: string;
  onOpenTask: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  tasks: TaskListItem[];
}) {
  return (
    <section className="board-grid">
      {taskStatuses.map((status) => {
        const tasks = getTaskColumnOrder(props.tasks, status);

        return (
          <article className="board-column" key={status}>
            <header className="column-header">
              <div>
                <p className="eyebrow">Status</p>
                <h2>{status}</h2>
              </div>
              <span className="count-pill">{tasks.length}</span>
            </header>
            <div className="column-stack">
              {tasks.length === 0 ? (
                <div className="empty-card">Nothing resting here.</div>
              ) : null}
              {tasks.map((task, index) => (
                <TaskCard
                  aiAssistanceLabel={props.aiAssistanceLabel}
                  index={index}
                  key={task.id}
                  onOpen={props.onOpenTask}
                  onQuickMove={props.onQuickMove}
                  onReorder={props.onReorder}
                  task={task}
                  total={tasks.length}
                />
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function TaskListView(props: {
  aiAssistanceLabel: string;
  description: string;
  emptyMessage: string;
  onOpenTask: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  tasks: TaskListItem[];
  title: string;
}) {
  return (
    <section className="panel-stack">
      <div className="section-header">
        <div>
          <p className="eyebrow">Focused View</p>
          <h2>{props.title}</h2>
        </div>
        <p className="section-copy">{props.description}</p>
      </div>
      <div className="list-surface">
        {props.tasks.length === 0 ? (
          <div className="empty-card">{props.emptyMessage}</div>
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
      </div>
    </section>
  );
}

function TaskCard(props: {
  aiAssistanceLabel: string;
  index: number;
  onOpen: (taskId: string) => void;
  onQuickMove: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  onReorder: (task: TaskListItem, direction: -1 | 1) => Promise<void>;
  task: TaskListItem;
  total: number;
}) {
  const previousStatus = getStatusStep(props.task.status, -1);
  const nextStatus = getStatusStep(props.task.status, 1);

  return (
    <article className="task-card">
      <button className="task-card-main" onClick={() => props.onOpen(props.task.id)} type="button">
        <div className="task-card-header">
          <h3>{props.task.title}</h3>
          <span className={props.task.aiAssistanceEnabled ? "assist-badge assist-on" : "assist-badge"}>
            {props.task.aiAssistanceEnabled ? props.aiAssistanceLabel : "Human only"}
          </span>
        </div>
        <p>{props.task.description || "No notes yet."}</p>
        <div className="task-meta">
          <span>{props.task.assignee?.displayName ?? "Unassigned"}</span>
          <span>{formatDate(props.task.dueOn, props.task.dueTime)}</span>
        </div>
        <div className="task-indicators">
          <span>{props.task.checklistProgress.completed}/{props.task.checklistProgress.total} checklist</span>
          <span>{props.task.commentCount} comments</span>
          <span>{props.task.attachmentCount} attachments</span>
        </div>
        <div className="label-row">
          {props.task.labels.map((label) => (
            <span className="label-pill" key={label.id}>
              {label.name}
            </span>
          ))}
        </div>
      </button>
      {!props.task.archivedAt ? (
        <div className="card-actions">
          <button
            disabled={props.index === 0}
            onClick={() => {
              void props.onReorder(props.task, -1);
            }}
            type="button"
          >
            Move Up
          </button>
          <button
            disabled={props.index === props.total - 1}
            onClick={() => {
              void props.onReorder(props.task, 1);
            }}
            type="button"
          >
            Move Down
          </button>
          <button
            disabled={!previousStatus}
            onClick={() => {
              void props.onQuickMove(props.task, -1);
            }}
            type="button"
          >
            Back
          </button>
          <button
            disabled={!nextStatus}
            onClick={() => {
              void props.onQuickMove(props.task, 1);
            }}
            type="button"
          >
            Advance
          </button>
        </div>
      ) : null}
    </article>
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
  onSave: (draft: TaskDraft) => Promise<void>;
  onStatusChange: (task: TaskDetail, status: TaskStatus) => Promise<void>;
  onUnarchive: (task: TaskDetail) => Promise<void>;
  onUploadAttachment: (task: TaskDetail, file: File) => Promise<void>;
  settings: Settings | null;
  task: TaskDetail | null;
  users: UserRef[];
  variant: "create" | "detail";
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => createTaskDraft(null));
  const [commentBody, setCommentBody] = useState("");
  const [linkDraft, setLinkDraft] = useState({ name: "", url: "" });

  useEffect(() => {
    setDraft(createTaskDraft(props.variant === "detail" ? props.task : null));
    setCommentBody("");
    setLinkDraft({ name: "", url: "" });
  }, [props.task, props.variant]);

  if (!props.isOpen) {
    return null;
  }

  const currentTask = props.variant === "detail" ? props.task : null;

  return (
    <div className="sheet-backdrop" role="presentation">
      <aside aria-label="Task details" className="sheet-panel">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{props.variant === "create" ? "New Task" : "Task Detail"}</p>
            <h2>{props.variant === "create" ? "Add Something to the Board" : currentTask?.title}</h2>
          </div>
          <button className="secondary-button" onClick={props.onClose} type="button">
            Close
          </button>
        </header>

        <div className="sheet-body">
          <TaskForm
            aiAssistanceToggleLabel={props.aiAssistanceToggleLabel}
            canEdit={!props.isSavingDisabled}
            draft={draft}
            labels={props.labels}
            onChange={setDraft}
            onSubmit={() => {
              void props.onSave(draft);
            }}
            submitLabel={props.variant === "create" ? "Create Task" : "Save Changes"}
            users={props.users}
          />

          {currentTask ? (
            <section className="sheet-section">
              <div className="section-header compact">
                <div>
                  <p className="eyebrow">Status</p>
                  <h3>Move the card</h3>
                </div>
                <div className="status-row">
                  {taskStatuses.map((status) => (
                    <button
                      className={
                        currentTask.status === status
                          ? "status-button status-button-active"
                          : "status-button"
                      }
                      key={status}
                      onClick={() => {
                        void props.onStatusChange(currentTask, status);
                      }}
                      type="button"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sheet-actions">
                {currentTask.archivedAt ? (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      void props.onUnarchive(currentTask);
                    }}
                    type="button"
                  >
                    Restore from Archive
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      void props.onArchive(currentTask);
                    }}
                    type="button"
                  >
                    Archive Task
                  </button>
                )}
                {currentTask.dueOn && props.settings ? (
                  <CalendarActions
                    currentTask={currentTask}
                    onCalendarAction={props.onCalendarAction}
                    settings={props.settings}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {currentTask ? (
            <>
              <section className="sheet-section">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Comments</p>
                    <h3>Conversation</h3>
                  </div>
                </div>
                <div className="timeline">
                  {currentTask.comments.length === 0 ? (
                    <div className="empty-card">No comments yet.</div>
                  ) : null}
                  {currentTask.comments.map((comment) => (
                    <article className="timeline-entry" key={comment.id}>
                      <div className="timeline-meta">
                        <strong>{comment.author.displayName}</strong>
                        <span>{formatTimestamp(comment.createdAt)}</span>
                      </div>
                      <p>{comment.body}</p>
                    </article>
                  ))}
                </div>
                <label className="stack-field">
                  <span>Add a comment</span>
                  <textarea
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Leave a note for the household."
                    rows={3}
                    value={commentBody}
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (!commentBody.trim()) {
                      return;
                    }

                    void props.onAddComment(currentTask, commentBody.trim());
                    setCommentBody("");
                  }}
                  type="button"
                >
                  Add Comment
                </button>
              </section>

              <section className="sheet-section">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Attachments</p>
                    <h3>Files and links</h3>
                  </div>
                </div>
                <div className="attachment-list">
                  {currentTask.attachments.length === 0 ? (
                    <div className="empty-card">No attachments yet.</div>
                  ) : null}
                  {currentTask.attachments.map((attachment) => (
                    <article className="attachment-row" key={attachment.id}>
                      <div>
                        <strong>{attachment.originalName}</strong>
                        <p>
                          Added by {attachment.uploadedBy.displayName} on{" "}
                          {formatTimestamp(attachment.createdAt)}
                        </p>
                      </div>
                      {attachment.storageKind === "upload" ? (
                        <button
                          className="secondary-button"
                          onClick={() => {
                            void props.onDownloadAttachment(attachment);
                          }}
                          type="button"
                        >
                          Download
                        </button>
                      ) : (
                        <a
                          className="secondary-link"
                          href={attachment.externalUrl ?? "#"}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open Link
                        </a>
                      )}
                    </article>
                  ))}
                </div>
                <div className="sheet-actions">
                  <label className="file-input">
                    <span>Upload file</span>
                    <input
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
                  </label>
                  <label className="stack-field compact-field">
                    <span>Link label</span>
                    <input
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                      placeholder="Reference note"
                      value={linkDraft.name}
                    />
                  </label>
                  <label className="stack-field compact-field">
                    <span>URL</span>
                    <input
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
                  </label>
                  <button
                    className="secondary-button"
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
                    type="button"
                  >
                    Attach Link
                  </button>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function CalendarActions(props: {
  currentTask: TaskDetail;
  onCalendarAction: (task: TaskDetail, kind: "google" | "ics") => void;
  settings: Settings;
}) {
  return (
    <>
      <button
        className="secondary-button"
        onClick={() =>
          props.onCalendarAction(
            props.currentTask,
            props.settings.defaultCalendarExportKind
          )
        }
        type="button"
      >
        Add to Calendar
      </button>
      <button
        className="secondary-button"
        onClick={() =>
          props.onCalendarAction(
            props.currentTask,
            props.settings.defaultCalendarExportKind === "google"
              ? "ics"
              : "google"
          )
        }
        type="button"
      >
        Use {props.settings.defaultCalendarExportKind === "google" ? "ICS" : "Google"} Instead
      </button>
    </>
  );
}

function TaskForm(props: {
  aiAssistanceToggleLabel: string;
  canEdit: boolean;
  draft: TaskDraft;
  labels: Label[];
  onChange: (draft: TaskDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  users: UserRef[];
}) {
  return (
    <section className="sheet-section">
      <div className="form-grid">
        <label className="stack-field wide">
          <span>Title</span>
          <input
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
        </label>

        <label className="stack-field wide">
          <span>Description</span>
          <textarea
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
        </label>

        <label className="stack-field">
          <span>Assignee</span>
          <select
            disabled={!props.canEdit}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                assigneeUserId: event.target.value
              })
            }
            value={props.draft.assigneeUserId}
          >
            <option value="">Unassigned</option>
            {props.users
              .filter((user) => !user.deactivatedAt)
              .map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
              ))}
          </select>
        </label>

        <label className="stack-field">
          <span>Due date</span>
          <input
            disabled={!props.canEdit}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                dueOn: event.target.value
              })
            }
            type="date"
            value={props.draft.dueOn}
          />
        </label>

        <label className="stack-field">
          <span>Due time</span>
          <input
            disabled={!props.canEdit}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                dueTime: event.target.value
              })
            }
            type="time"
            value={props.draft.dueTime}
          />
        </label>

        <label className="toggle-field">
          <input
            checked={props.draft.aiAssistanceEnabled}
            disabled={!props.canEdit}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                aiAssistanceEnabled: event.target.checked
              })
            }
            type="checkbox"
          />
          <span>{props.aiAssistanceToggleLabel}</span>
        </label>
      </div>

      <div className="sheet-section">
        <div className="section-header compact">
          <div>
            <p className="eyebrow">Checklist</p>
            <h3>Subtasks</h3>
          </div>
          <button
            className="secondary-button"
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
            type="button"
          >
            Add Item
          </button>
        </div>
        <div className="checklist-editor">
          {props.draft.checklistItems.map((item, index) => (
            <div className="checklist-row" key={item.clientId}>
              <input
                checked={item.isCompleted}
                disabled={!props.canEdit}
                onChange={(event) =>
                  props.onChange({
                    ...props.draft,
                    checklistItems: props.draft.checklistItems.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, isCompleted: event.target.checked }
                        : entry
                    )
                  })
                }
                type="checkbox"
              />
              <input
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
              <button
                className="ghost-button"
                disabled={!props.canEdit}
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    checklistItems: props.draft.checklistItems.filter(
                      (_, entryIndex) => entryIndex !== index
                    )
                  })
                }
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
          {props.draft.checklistItems.length === 0 ? (
            <div className="empty-card">No checklist items yet.</div>
          ) : null}
        </div>
      </div>

      <div className="sheet-section">
        <div className="section-header compact">
          <div>
            <p className="eyebrow">Labels</p>
            <h3>Categories</h3>
          </div>
        </div>
        <div className="checkbox-grid">
          {props.labels.map((label) => (
            <label className="choice-pill" key={label.id}>
              <input
                checked={props.draft.labelIds.includes(label.id)}
                disabled={!props.canEdit}
                onChange={(event) =>
                  props.onChange({
                    ...props.draft,
                    labelIds: event.target.checked
                      ? [...props.draft.labelIds, label.id]
                      : props.draft.labelIds.filter((entry) => entry !== label.id)
                  })
                }
                type="checkbox"
              />
              <span>{label.name}</span>
            </label>
          ))}
          {props.labels.length === 0 ? (
            <div className="empty-card">Create labels in Settings to use them here.</div>
          ) : null}
        </div>
      </div>

      <div className="sheet-actions">
        <button
          className="primary-button"
          disabled={!props.canEdit || !props.draft.title.trim()}
          onClick={props.onSubmit}
          type="button"
        >
          {props.submitLabel}
        </button>
      </div>
    </section>
  );
}

function SettingsView(props: {
  canAdmin: boolean;
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
  onSelectTemplate: (templateId: string | null) => void;
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
      <section className="status-panel">
        <h2>Settings are reserved for household admins.</h2>
        <p>The current browser session does not have admin access.</p>
      </section>
    );
  }

  const selectedServiceTokens =
    props.selectedUser?.role === "service"
      ? props.serviceTokensByUserId[props.selectedUser.id] ?? []
      : [];

  return (
    <section className="settings-grid">
      <article className="settings-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">House Rules</p>
            <h2>Settings</h2>
          </div>
          <p className="section-copy">
            Tune the default timezone, archive cadence, and calendar preference.
          </p>
        </div>
        <div className="form-grid">
          <label className="stack-field">
            <span>Timezone</span>
            <input
              onChange={(event) =>
                setSettingsDraft({
                  ...settingsDraft,
                  defaultTimezone: event.target.value
                })
              }
              value={settingsDraft.defaultTimezone}
            />
          </label>
          <label className="stack-field">
            <span>Done retention (days)</span>
            <input
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
          </label>
          <label className="stack-field">
            <span>Default calendar export</span>
            <select
              onChange={(event) =>
                setSettingsDraft({
                  ...settingsDraft,
                  defaultCalendarExportKind: event.target.value as "google" | "ics"
                })
              }
              value={settingsDraft.defaultCalendarExportKind}
            >
              <option value="google">Google Calendar</option>
              <option value="ics">ICS download</option>
            </select>
          </label>
        </div>
        <div className="sheet-actions">
          <button
            className="primary-button"
            onClick={() => {
              void props.onSaveSettings(settingsDraft);
            }}
            type="button"
          >
            Save Settings
          </button>
        </div>
      </article>

      <article className="settings-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Household Cast</p>
            <h2>People and Assistants</h2>
          </div>
          <div className="sheet-actions">
            <button
              className="secondary-button"
              onClick={() => props.onSelectUser("new-admin")}
              type="button"
            >
              New Person
            </button>
            <button
              className="secondary-button"
              onClick={() => props.onSelectUser("new-service")}
              type="button"
            >
              New Assistant
            </button>
          </div>
        </div>
        <div className="template-grid">
          <div className="template-list">
            {props.users.length === 0 ? (
              <div className="empty-card">No household actors yet.</div>
            ) : null}
            {props.users.map((user) => (
              <button
                className={
                  props.selectedUser?.id === user.id
                    ? "template-row template-row-active"
                    : "template-row"
                }
                key={user.id}
                onClick={() => props.onSelectUser(user.id)}
                type="button"
              >
                <strong>{user.displayName}</strong>
                <span>{formatRoleLabel(user)}</span>
              </button>
            ))}
          </div>
          <div className="template-editor">
            <div className="form-grid">
              <label className="stack-field">
                <span>Type</span>
                <input
                  disabled
                  value={userDraft.mode === "admin" ? "Person" : "Assistant"}
                />
              </label>
              <label className="stack-field">
                <span>Display name</span>
                <input
                  onChange={(event) =>
                    setUserDraft({
                      ...userDraft,
                      displayName: event.target.value
                    })
                  }
                  value={userDraft.displayName}
                />
              </label>
              {userDraft.mode === "admin" ? (
                <label className="stack-field wide">
                  <span>Email</span>
                  <input
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
                </label>
              ) : (
                <label className="stack-field wide">
                  <span>Service kind</span>
                  <input
                    onChange={(event) =>
                      setUserDraft({
                        ...userDraft,
                        serviceKind: event.target.value
                      })
                    }
                    placeholder="assistant"
                    value={userDraft.serviceKind}
                  />
                </label>
              )}
            </div>
            <div className="sheet-actions">
              <button
                className="primary-button"
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
                  const saved = await props.onSaveUser(props.selectedUser?.id ?? null, userDraft);

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
              </button>
              {props.selectedUser ? (
                <button
                  className="ghost-button"
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
                  type="button"
                >
                  {isUserRemovePending ? "Removing..." : "Remove Actor"}
                </button>
              ) : null}
            </div>
            {userActionMessage ? <div className="empty-card">{userActionMessage}</div> : null}
            {props.selectedUser ? (
              <div className="empty-card">
                Removing an actor is permanent. They stay attached to past comments and
                history, but disappear from the household cast, cannot be assigned to
                anything new, and assistants lose any active tokens.
              </div>
            ) : null}

            {props.selectedUser?.role === "service" ? (
              <section className="sheet-section">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">Assistant Access</p>
                    <h3>Service Tokens</h3>
                  </div>
                </div>
                <div className="sheet-actions">
                  <label className="stack-field compact-field">
                    <span>Token name</span>
                    <input
                      onChange={(event) => setServiceTokenName(event.target.value)}
                      placeholder="Assistant exe.dev"
                      value={serviceTokenName}
                    />
                  </label>
                  <button
                    className="secondary-button"
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
                    type="button"
                  >
                    Issue Token
                  </button>
                </div>
                {issuedServiceToken ? (
                  <div className="empty-card">
                    <strong>Copy this token now:</strong>
                    <p>{issuedServiceToken}</p>
                  </div>
                ) : null}
                <div className="cast-list">
                  {selectedServiceTokens.length === 0 ? (
                    <div className="empty-card">No service tokens issued yet.</div>
                  ) : null}
                  {selectedServiceTokens.map((token) => (
                    <div className="cast-row" key={token.id}>
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
                      <button
                        className="ghost-button"
                        disabled={Boolean(token.revokedAt)}
                        onClick={() => {
                          void props.onRevokeServiceToken(token.id);
                        }}
                        type="button"
                      >
                        {token.revokedAt ? "Revoked" : "Revoke"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="section-header compact">
          <div>
            <p className="eyebrow">Labels</p>
            <h3>Quick Add</h3>
          </div>
        </div>
        <div className="sheet-actions">
          <label className="stack-field compact-field">
            <span>Name</span>
            <input
              onChange={(event) => setLabelName(event.target.value)}
              placeholder="Errand"
              value={labelName}
            />
          </label>
          <label className="stack-field compact-field">
            <span>Color note</span>
            <input
              onChange={(event) => setLabelColor(event.target.value)}
              placeholder="#c96 or brass"
              value={labelColor}
            />
          </label>
          <button
            className="secondary-button"
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
            type="button"
          >
            Add Label
          </button>
        </div>
        <div className="label-row roomy">
          {props.labels.map((label) => (
            <span className="label-pill" key={label.id}>
              {label.name}
            </span>
          ))}
        </div>
      </article>

      <article className="settings-card settings-card-wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Recurring Work</p>
            <h2>Templates</h2>
          </div>
          <button
            className="secondary-button"
            onClick={() => props.onSelectTemplate(null)}
            type="button"
          >
            New Template
          </button>
        </div>
        <div className="template-grid">
          <div className="template-list">
            {props.recurringTemplates.length === 0 ? (
              <div className="empty-card">No recurring templates yet.</div>
            ) : null}
            {props.recurringTemplates.map((template) => (
              <button
                className={
                  props.selectedTemplate?.id === template.id
                    ? "template-row template-row-active"
                    : "template-row"
                }
                key={template.id}
                onClick={() => props.onSelectTemplate(template.id)}
                type="button"
              >
                <strong>{template.title}</strong>
                <span>
                  {template.recurrenceCadence} every {template.recurrenceInterval}
                </span>
              </button>
            ))}
          </div>
          <div className="template-editor">
            <RecurringTemplateForm
              draft={templateDraft}
              labels={props.labels}
              onChange={setTemplateDraft}
              onSubmit={() => {
                void props.onSaveTemplate(templateDraft);
              }}
              users={props.users}
            />
          </div>
        </div>
      </article>
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
      <label className="stack-field wide">
        <span>Title</span>
        <input
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              title: event.target.value
            })
          }
          value={props.draft.title}
        />
      </label>
      <label className="stack-field wide">
        <span>Description</span>
        <textarea
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              description: event.target.value
            })
          }
          rows={4}
          value={props.draft.description}
        />
      </label>
      <label className="stack-field">
        <span>Default assignee</span>
        <select
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              defaultAssigneeUserId: event.target.value
            })
          }
          value={props.draft.defaultAssigneeUserId}
        >
          <option value="">Unassigned</option>
          {props.users
            .filter((user) => !user.deactivatedAt)
            .map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
            ))}
        </select>
      </label>
      <label className="stack-field">
        <span>Next occurrence</span>
        <input
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              nextOccurrenceOn: event.target.value
            })
          }
          type="date"
          value={props.draft.nextOccurrenceOn}
        />
      </label>
      <label className="stack-field">
        <span>Due time</span>
        <input
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              defaultDueTime: event.target.value
            })
          }
          type="time"
          value={props.draft.defaultDueTime}
        />
      </label>
      <label className="stack-field">
        <span>Cadence</span>
        <select
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              recurrenceCadence: event.target.value as "daily" | "weekly" | "monthly"
            })
          }
          value={props.draft.recurrenceCadence}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      <label className="stack-field">
        <span>Interval</span>
        <input
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
      </label>
      <label className="toggle-field">
        <input
          checked={props.draft.isActive}
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              isActive: event.target.checked
            })
          }
          type="checkbox"
        />
        <span>Template is active</span>
      </label>
      <label className="toggle-field">
        <input
          checked={props.draft.aiAssistanceEnabledDefault}
          onChange={(event) =>
            props.onChange({
              ...props.draft,
              aiAssistanceEnabledDefault: event.target.checked
            })
          }
          type="checkbox"
        />
        <span>Occurrences are AI-eligible by default</span>
      </label>

      <div className="sheet-section wide">
        <div className="section-header compact">
          <div>
            <p className="eyebrow">Template Checklist</p>
            <h3>Recurring subtasks</h3>
          </div>
          <button
            className="secondary-button"
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
            type="button"
          >
            Add Item
          </button>
        </div>
        <div className="checklist-editor">
          {props.draft.checklistItems.map((item, index) => (
            <div className="checklist-row" key={item.clientId}>
              <input
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
              <button
                className="ghost-button"
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    checklistItems: props.draft.checklistItems.filter(
                      (_, entryIndex) => entryIndex !== index
                    )
                  })
                }
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="sheet-section wide">
        <div className="section-header compact">
          <div>
            <p className="eyebrow">Labels</p>
            <h3>Template tags</h3>
          </div>
        </div>
        <div className="checkbox-grid">
          {props.labels.map((label) => (
            <label className="choice-pill" key={label.id}>
              <input
                checked={props.draft.labelIds.includes(label.id)}
                onChange={(event) =>
                  props.onChange({
                    ...props.draft,
                    labelIds: event.target.checked
                      ? [...props.draft.labelIds, label.id]
                      : props.draft.labelIds.filter((entry) => entry !== label.id)
                  })
                }
                type="checkbox"
              />
              <span>{label.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sheet-actions wide">
        <button
          className="primary-button"
          disabled={!props.draft.title.trim() || !props.draft.nextOccurrenceOn}
          onClick={props.onSubmit}
          type="button"
        >
          Save Template
        </button>
      </div>
    </div>
  );
}

export default App;
