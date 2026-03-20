# Product Specification: S#!% We Need To Do (SWNTD)

## 1. Overview

S#!% We Need To Do (SWNTD) is a lightweight, story-forward household kanban board and issue tracker for humans and AI collaborators. The product is intended to be open source, self-hostable, and useful as a polished portfolio-quality project, while still solving a practical day-to-day household need.

The first release targets a single household with two human admins and one non-admin AI service actor. Each deployed instance serves exactly one household in v1. The architecture must remain deployment-target agnostic so other users can fork the repository and deploy it on infrastructure of their choice.

### Primary Goals

- Provide a simple web-based household task board that works well on both iPhone and Android.
- Support recurring chores, one-off errands, comments, attachments, and lightweight collaboration.
- Enable bounded AI participation through both an application API and a built-in MCP server.
- Maintain strong documentation and clean engineering standards from the first commit.

### Non-Goals for V1

- Native mobile applications
- Multi-household productization
- Full nested task hierarchies
- Push notifications managed by the application
- Autonomous service-actor self-assignment without explicit human approval

## 2. Requirements

### 2.1 Functional Requirements

#### Task Board

- The system must provide exactly four task statuses in v1:
  - `To Do`
  - `In Progress`
  - `Waiting`
  - `Done`
- The main board view must display tasks grouped by status and allow drag-and-drop or equivalent touch-friendly status changes.
- Each status column must preserve a stable manual ordering.
- New tasks and newly generated recurring occurrences must appear at the top of their status column by default.
- The system must also provide:
  - a `My Tasks` view
  - an `Archive/History` view
  - a `Settings` view

#### Tasks

- A task must support the following fields in v1:
  - title
  - description
  - status
  - assignee
  - due date
  - due time
  - labels
  - comments
  - attachments
  - AI assistance toggle
  - checklist-style subtasks
- Tasks may be one-off tasks or occurrences generated from recurring task templates.
- Comments must store submitter identity and timestamp.
- Attachments must support uploaded files and external links.
- The system must allow local-disk-backed file storage for self-hosted deployments.
- Hard delete is out of scope for v1; tasks should be archived instead.

#### Recurring Tasks

- The system must support recurring tasks for chores and ongoing responsibilities via recurring task templates.
- Recurrence must be cadence-based, with at least weekly and monthly support in v1.
- A recurring task template must generate normal task occurrences over time.
- Only one open occurrence may exist per recurring task template at a time.
- The next occurrence must not be generated until the current occurrence has been marked `Done` and the next scheduled time has arrived.
- Edits to a recurring task template must affect future occurrences by default and must not silently rewrite historical completed occurrences.
- Completed recurring occurrences must remain visible in history and archive views.

#### Archiving

- Non-recurring tasks marked `Done` must auto-archive after a configurable server-wide retention period.
- The default done-task retention period must be 30 days.
- Archived tasks must remain visible in the `Archive/History` view.
- Completed recurring occurrences should auto-archive when their successor occurrence is generated.
- Recurring task templates must not themselves be auto-archived while still active.

#### Calendar Support

- Tasks with a due date must offer an `Add to Calendar` action.
- A due date consists of a date plus an optional time.
- V1 calendar support should rely on user-managed calendar reminders rather than app-managed notification scheduling.
- V1 must support both:
  - Google Calendar deep-link export
  - `.ics` event export
- The admin settings or deployment configuration must allow choosing the default calendar export option.
- V1 calendar export must create a single event per task occurrence and must not attempt to manage external recurring calendar rules.

#### Shared Sync Behavior

- V1 sync behavior should prioritize simplicity and correctness over push-based realtime updates.
- Clients must reflect successful mutations immediately from authoritative server responses.
- Clients must refetch relevant board data on window focus.
- The system may use periodic polling with a conservative default interval, but it must not require SSE or WebSockets in v1.
- A full browser refresh must always recover canonical state.

### 2.2 Permission Requirements

- The initial household contains two human admins.
- Human admins may create, edit, assign, comment on, attach files to, archive, and manage settings.
- Human admins may manage recurring task templates and reorder tasks.
- Service actors are not admins.
- Only human admins may assign tasks to service actors.
- Service actors may interact only with tasks that are both:
  - assigned to the acting service actor
  - explicitly marked with AI assistance enabled
- On eligible tasks, service actors may:
  - move status among `To Do`, `In Progress`, `Waiting`, and `Done`
  - leave comments
  - add external-link attachments
- Service actors may not:
  - access admin settings
  - create tasks in v1
  - upload binary files in v1
  - assign tasks to humans
  - change permissions
  - self-assign new work in v1
- If AI assistance is disabled or a task is reassigned away from a service actor, any subsequent service-actor write must be rejected immediately.

### 2.3 UX and Responsiveness Requirements

- The application must be mobile-first and work well on both iPhone and Android browsers.
- Common actions must remain usable via touch interactions.
- The design language should feel intentional and slightly whimsical, with room for story-inspired branding rather than enterprise project-management aesthetics.
- The product must remain accessible with clear focus states, semantic structure, and keyboard support for desktop users.

### 2.4 OSS and Delivery Requirements

- The repository must be suitable for public open source development under the `archedark-publishing` organization.
- The project must include strong documentation and contributor guidance from the start.
- GitHub Actions must be part of the planned delivery pipeline for lint, test, build, and deployment.

### 2.5 Edge Cases and Behavioral Rules

- Tasks without due dates must still be fully supported.
- A task may have zero labels, zero comments, and zero attachments.
- Large numbers of archived tasks must not degrade the active board view.
- Recurring occurrence generation must be idempotent so duplicate jobs or retries do not create duplicate open occurrences.
- Sync behavior must not allow clients to bypass permission checks.
- Attachment failures must not corrupt the task record or comment history.
- Unknown authenticated users must be denied by default unless they belong to the configured household bootstrap or stored membership list.
- Task reorder operations must remain stable after refresh.
- Stale writes must fail clearly instead of silently overwriting newer changes.

## 3. Technical Specification

### 3.1 Architecture

#### Recommended Stack

- Frontend: React + Vite + TypeScript
- Backend: lightweight TypeScript API service
- Database: SQLite in local and initial hosted environments, with schema discipline that preserves a path to PostgreSQL
- Shared contracts: TypeScript types plus schema validation shared across frontend, backend, and MCP surfaces
- Sync transport: mutation-driven refetches plus optional polling
- File storage: local disk abstraction with a provider boundary for future object storage support
- CI/CD: GitHub Actions

#### Monorepo Layout

The initial implementation should use a small workspace-oriented monorepo:

- `apps/web` for the React application
- `apps/api` for the HTTP API and auth integration
- `apps/mcp` for the built-in MCP server
- `packages/shared` for schemas, domain types, permission helpers, and shared utilities
- `docs/` for product and architecture documentation

#### Deployment Strategy

- Each deployment hosts exactly one household in v1.
- Browser access may be public on the internet, but household access must remain private to approved actors.
- The core application must not assume provider-specific infrastructure outside a dedicated auth adapter and deployment configuration layer.
- Initial deployments may use any compatible hosting, login, and runtime environment for browser users and service actors.
- The official deployment may bootstrap only deployment-specific household admins and service actors through deployment secrets and CI configuration.
- Unknown authenticated users must be denied until an admin explicitly adds them to the household.
- V1 must not include self-service signup, invites, or multi-household tenant switching.
- The application must remain self-hostable with alternate auth and deployment providers added later.
- Deployment configuration should include at least:
  - household name
  - bootstrap admin emails
  - default timezone
  - auth mode
  - done-task archive retention days
- The first self-hosting guide should recommend `oauth2-proxy` behind Caddy `forward_auth` as the reference auth setup.

### 3.2 Authentication and Authorization

#### Auth Provider Boundary

The backend must expose an auth abstraction so platform-specific identity extraction is isolated.

Initial adapters and auth modes:

- `trusted_header`
  - production-oriented mode for deployments behind a trusted auth proxy
  - may only be enabled when the upstream proxy strips user-supplied identity headers and injects canonical authenticated values
  - the implementation reads a configured authenticated email header, defaulting to `X-Forwarded-Email`
  - unauthenticated browser requests may be redirected by the upstream auth layer before they reach the app
- `service_token`
  - used by service actors and other programmatic clients
  - authenticates via bearer token tied to a service actor record
  - tokens must be hashed at rest and support rotation or revocation
- local development adapter
  - provides a simple mock identity flow for local development and automated testing
- If the app is directly internet-exposed without a trusted proxy, `trusted_header` mode must not be enabled.

#### Identity Model

- Users must be represented as actor records in the application database.
- Human users are authenticated via configured auth adapters.
- Service actors must be represented as non-admin actors in the same household.
- Programmatic service-actor access must use service-token-backed application API or MCP authentication, not direct database access as part of the formal product contract.
- Authenticated actors must still be members of the deployment household to receive access.
- Service tokens must only be accepted for non-browser programmatic clients.

### 3.3 Data Model

The v1 schema should include at least the following entities.

#### Household

- `id`
- `name`
- `created_at`
- `updated_at`

Note: v1 operates on a single household, but household scoping should still exist in the schema for future extensibility and clean ownership boundaries.

#### User

- `id`
- `household_id`
- `external_auth_id`
- `email`
- `display_name`
- `role` with values `admin` or `service`
- `service_kind` nullable, used for service actors
- `created_at`
- `updated_at`

#### Service Token

- `id`
- `user_id`
- `name`
- `token_hash`
- `last_used_at` nullable
- `expires_at` nullable
- `revoked_at` nullable
- `created_at`

#### Recurring Task Template

- `id`
- `household_id`
- `title`
- `description`
- `default_assignee_user_id` nullable
- `ai_assistance_enabled_default`
- `default_due_time` nullable
- `recurrence_cadence`
- `recurrence_interval`
- `next_occurrence_on`
- `is_active`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

#### Task

- `id`
- `household_id`
- `recurring_task_template_id` nullable
- `title`
- `description`
- `status`
- `assignee_user_id` nullable
- `ai_assistance_enabled`
- `due_on` nullable
- `due_time` nullable
- `sort_key`
- `revision`
- `completed_at` nullable
- `archived_at` nullable
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

#### Checklist Item

- `id`
- `task_id`
- `body`
- `is_completed`
- `sort_order`
- `created_at`
- `updated_at`

#### Label

- `id`
- `household_id`
- `name`
- `color` nullable
- `created_at`
- `updated_at`

#### Task Label

- `task_id`
- `label_id`

#### Recurring Task Template Checklist Item

- `id`
- `recurring_task_template_id`
- `body`
- `sort_order`
- `created_at`
- `updated_at`

#### Recurring Task Template Label

- `recurring_task_template_id`
- `label_id`

#### Comment

- `id`
- `task_id`
- `author_user_id`
- `body`
- `created_at`
- `updated_at`

#### Attachment

- `id`
- `task_id`
- `uploaded_by_user_id`
- `storage_kind` with values like `upload` or `external_link`
- `original_name`
- `mime_type` nullable
- `storage_path` nullable
- `external_url` nullable
- `byte_size` nullable
- `created_at`

#### Household Settings

- `household_id`
- `done_archive_after_days`
- `default_timezone`
- `default_calendar_export_kind`
- `created_at`
- `updated_at`

#### Task Event

- `id`
- `task_id`
- `actor_user_id`
- `event_type`
- `payload_json`
- `created_at`

The task event log exists to power auditability, history views, and future analytics without overloading current-state tables.

### 3.4 API Contract

The backend must expose a versioned API under `/api/v1`.

#### Core Endpoints

- `GET /tasks`
  - filters by status, assignee, archived, label, recurring-template presence, and search query
- `POST /tasks`
- `GET /tasks/:taskId`
- `PATCH /tasks/:taskId`
- `POST /tasks/:taskId/status`
- `POST /tasks/:taskId/reorder`
- `POST /tasks/:taskId/comments`
- `POST /tasks/:taskId/uploads`
- `POST /tasks/:taskId/attachment-links`
- `POST /tasks/:taskId/archive`
- `POST /tasks/:taskId/unarchive`
- `GET /recurring-templates`
- `POST /recurring-templates`
- `GET /recurring-templates/:templateId`
- `PATCH /recurring-templates/:templateId`
- `GET /labels`
- `POST /labels`
- `GET /settings`
- `PATCH /settings`
- `GET /me`

#### API Rules

- All mutations must enforce household scoping and permission checks on the server.
- Status transitions must be explicit server-side actions, not purely client-side field edits.
- Task writes must include an expected task revision or equivalent stale-write guard, and the server must return a conflict response when the client is out of date.
- Attachment upload success and metadata persistence must be handled transactionally where possible, or with compensating cleanup logic where full transactions are not possible.
- New tasks and newly generated recurring occurrences must receive a top-of-column sort key by default.
- V1 uploads should use conservative defaults:
  - maximum 20 MB per file
  - allow common household-friendly formats such as JPEG, PNG, WebP, HEIC, PDF, plain text, Markdown, CSV, and JSON
  - store uploaded files outside the web root using randomized filenames
  - serve downloads through authenticated application endpoints
  - never fetch remote URLs server-side for external-link attachments
- Service actors may attach external links but may not upload binary files in v1.
- Hard delete should not be exposed in the v1 API.
- The API must return enough structured error information for the UI and MCP layers to present actionable failures.

### 3.5 MCP Server

The system must include a built-in MCP server that exposes bounded task-management capabilities backed by the same domain logic as the HTTP API.

#### Initial MCP Tool Surface

- `list_my_tasks`
- `get_task`
- `transition_task_status`
- `add_comment`
- `attach_link`

#### MCP Requirements

- MCP calls must use the same permission rules as the standard API.
- Service actors must only receive access appropriate to the bound service identity.
- The MCP layer must not bypass task-level eligibility rules for AI assistance.
- V1 MCP tools must not expose task creation, task reassignment, admin settings, or binary file upload.

### 3.6 Sync Model

- The frontend should update local UI from authoritative mutation responses and then refetch affected collections as needed.
- The frontend should refetch relevant data when the browser window regains focus.
- The frontend may poll for updated data on a conservative interval, such as every 60 seconds.
- The server is authoritative for current state.
- Push-based realtime transport such as SSE is explicitly deferred from v1.

### 3.7 Background Jobs

The backend must support scheduled work for:

- recurring occurrence generation from templates
- done-task auto-archival
- automatic archival of completed recurring occurrences once successors are generated
- stale upload cleanup if partial attachment writes fail

Job execution must be idempotent so retries or duplicate triggers do not create duplicate state transitions.

## 4. UI/UX Specification

### 4.1 Overall Experience

The visual direction should feel warm, slightly literary, and a little whimsical without becoming novelty UI. The product should feel more like a household story ledger than a sterile productivity dashboard.

### 4.2 Main Views

#### Board View

- Default landing experience after login
- Four columns for the core statuses
- Cards show title, assignee, due date or due date and time, labels, checklist progress, AI assistance state, and attachment/comment indicators
- Touch-friendly drag-and-drop or tap-to-move interactions
- Users must be able to preserve and adjust the manual ordering of tasks within each status column.

#### My Tasks View

- Filtered list of tasks assigned to the current user
- Must support quick scanning for due dates, waiting items, and active work

#### Archive/History View

- Shows archived non-recurring tasks and meaningful task history
- Must support filtering and search

#### Settings View

- User preferences
- Household admin settings
- Server-wide done-task retention period
- Default timezone
- Default calendar export option
- Future location for auth/provider integrations and automation settings

### 4.3 Task Detail Experience

- Openable from board cards and task lists
- Must support:
  - editing task fields
  - managing checklist items
  - viewing and adding comments
  - viewing and adding attachments
  - toggling AI assistance
  - configuring or linking to recurrence template settings where applicable
  - calendar export action when due date exists

### 4.4 Responsiveness and Accessibility

- The mobile layout must prioritize fast navigation and thumb-friendly interaction targets.
- Desktop layout may expose denser information, but should preserve the same mental model.
- Keyboard users must be able to navigate all primary views and task actions.
- Screen-reader-relevant labels and status announcements must be present for dynamic updates.

## 5. Constraints & Assumptions

- V1 is one household per deployment, but the schema and authorization model should not hard-code a permanent single-tenant assumption.
- Application internals should remain portable across deployment targets.
- Both initial human users are admins.
- Service actors are non-admin actors.
- The official deployment should default to the `America/New_York` timezone.
- Unknown users are denied by default.
- Trusted-header auth requires a trusted upstream proxy and is not safe for direct internet exposure without that boundary.
- The first self-hosted reference deployment should use `oauth2-proxy` behind Caddy.
- Local disk storage for uploads is acceptable in v1.
- SQLite is the initial database engine.
- Google Calendar compatibility matters more than generalized notification infrastructure in v1.
- The repository should be implementation-ready for GitHub Actions-based automation from the start.

## 6. Open Questions

- No blocking product questions remain for v1 specification.
- Future roadmap questions may be recorded here as implementation clarifies scope.

## 7. Appendix

### 7.1 Interview Notes

- Project origin: a shared household kanban board and issue tracker for two human admins and one service actor
- Deployment posture: deployment-target agnostic across runtime and auth integrations
- Deployment tenancy: one household per deployment in v1
- Core statuses: `To Do`, `In Progress`, `Waiting`, `Done`
- Task types: one-off errands, recurring chores, and checklist-style subtasks
- AI posture: service actors can act only on explicitly AI-enabled tasks assigned to them
- Reminder philosophy: keep notifications lightweight by letting users add selected tasks to their calendars
- OSS goal: polished, general-purpose project suitable for public adoption and portfolio value
- Delivery expectations: GitHub Actions from the start, docs-first implementation, future API/MCP-friendly developer experience

### 7.2 Rationale for the Recommended Stack

- TypeScript reduces friction across frontend, backend, schemas, and MCP integrations.
- React + Vite provides a fast developer experience without forcing deployment onto a single hosting model.
- SQLite keeps self-hosting simple for early adopters while leaving room for a PostgreSQL migration path.
- Polling plus refetch-on-focus keeps v1 sync behavior simple and portable while preserving a clean path to SSE later if needed.
