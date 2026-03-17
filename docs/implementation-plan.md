# Implementation Plan: S#!% We Need To Do (SWNTD)

## Overview

This plan turns the product spec into a practical implementation sequence. It is optimized for shipping a stable, portfolio-quality v1 with clear checkpoints, low rework risk, and room for service-actor-assisted development.

The sequencing favors:

- locking domain rules before UI polish
- keeping deployment-target-agnostic boundaries intact
- shipping a useful vertical slice early
- deferring complexity that does not materially improve the first household deployment

## Delivery Strategy

The project should be built in thin vertical slices rather than by finishing the entire backend and then the entire frontend. Each phase should end in a state that is coherent, testable, and safe to build on.

### Guiding Rules

- Keep one household per deployment as a hard invariant in v1.
- Reuse shared schema and domain logic across API, UI, and MCP surfaces.
- Prefer server-authoritative state transitions over clever client logic.
- Keep service-actor integration bounded and auditable from the first implementation.
- Do not introduce push realtime until the non-realtime workflow feels complete.

## Phase 0: Workspace and Delivery Foundation

### Goal

Create a clean monorepo foundation with enough tooling to support fast, safe iteration.

### Status

- [x] Phase 0 complete

### Scope

- [x] Initialize workspace structure:
  - `apps/web`
  - `apps/api`
  - `apps/mcp`
  - `packages/shared`
- [x] Configure package management and workspace tooling
- [x] Add TypeScript base configuration
- [x] Add linting and formatting setup
- [x] Add test runner setup
- [x] Add basic GitHub Actions workflows for:
  - lint
  - typecheck
  - test
  - build
- [x] Add environment configuration examples
- [x] Add a minimal local development README section

### Deliverables

- [x] Monorepo boots locally with one install command
- [x] CI runs successfully on empty or stubbed apps
- [x] Shared package is importable from all app packages

### Exit Criteria

- [x] `install`, `lint`, `typecheck`, `test`, and `build` commands exist and pass
- [x] CI is green on the default branch
- [x] Repo structure matches the product spec

### Risks

- Overengineering tooling before app code exists

### Mitigation

- Choose boring defaults and keep the first tooling pass minimal

## Phase 1: Domain Model and Persistence

### Goal

Implement the core schema and domain services that define how SWNTD behaves.

### Status

- [x] Phase 1 complete

### Scope

- [x] Choose ORM or query layer suitable for SQLite-first development
- [x] Add initial schema and migrations for:
  - household
  - user
  - service token
  - task
  - checklist item
  - label
  - task label
  - comment
  - attachment
  - recurring task template
  - recurring task template checklist item
  - recurring task template label
  - household settings
  - task event
- [x] Implement shared domain rules for:
  - task status transitions
  - stable ordering and reorder behavior
  - stale-write revision checks
  - AI assistance eligibility
  - archive behavior
  - recurring template to occurrence generation
- [x] Seed bootstrap household, admins, and service actor from config

### Deliverables

- [x] Migrations can create a fresh database from zero
- [x] Domain services exist independent of HTTP transport
- [x] Test fixtures support realistic household scenarios

### Exit Criteria

- [x] Domain tests cover core task lifecycle and permission logic
- [x] Recurring occurrence generation is idempotent
- [x] Reorder behavior is stable and deterministic

### Risks

- Mixing transport concerns into domain logic
- Under-testing recurrence and archive rules

### Mitigation

- Keep domain services in shared backend modules with focused tests before wiring routes

## Phase 2: Authentication and Authorization Boundary

### Goal

Implement the trust boundary for humans and service actors without locking the app to one deployment platform.

### Status

- [x] Phase 2 complete

### Scope

- [x] Implement auth mode abstraction:
  - `trusted_header`
  - `service_token`
  - `local_dev`
- [x] Build actor resolution and household membership enforcement
- [x] Implement bootstrap admin email handling
- [x] Implement service-token creation and verification primitives
- [x] Add permission policy helpers for:
  - human admins
  - service actors
  - service-actor task eligibility
- [x] Add authenticated file download guards

### Deliverables

- [x] Browser requests can resolve human actors
- [x] Programmatic requests can resolve service actors via service token
- [x] Unknown authenticated users are denied

### Exit Criteria

- [x] Tests prove that spoofed direct headers are not trusted in unsupported mode
- [x] Service actors cannot mutate ineligible tasks
- [x] Human admins can manage all expected v1 operations

### Risks

- Auth logic duplicated between API and MCP
- Security drift between prose rules and implementation

### Mitigation

- Centralize authorization in shared policy functions used by all interfaces

## Phase 3: Core API

### Goal

Expose the domain model through a clean, versioned HTTP API that fully supports the v1 product.

### Status

- [x] Phase 3 complete

### Scope

- [x] Implement `/api/v1` endpoints for:
  - tasks
  - status transitions
  - reorder
  - comments
  - uploads
  - attachment links
  - archive/unarchive
  - recurring templates
  - labels
  - settings
  - current actor
- [x] Add request validation and structured error responses
- [x] Implement upload storage abstraction for local disk
- [x] Add pagination and filtering where needed for archive/history
- [x] Record task events on mutating operations

### Deliverables

- [x] API contract matches the product spec
- [x] OpenAPI or equivalent machine-readable contract is generated if practical
- [x] Integration tests cover the primary workflows

### Exit Criteria

- [x] A scriptable client can complete the household workflows end to end
- [x] Uploads are stored safely outside the web root
- [x] Conflict responses are returned for stale revisions

### Risks

- Letting generic CRUD routes bypass domain rules
- File handling becoming a sidecar system with weaker auth

### Mitigation

- Route all mutations through domain services and shared policy checks

## Phase 4: Web App MVP

### Goal

Deliver a fully usable household task board for humans on mobile and desktop browsers.

### Status

- [x] Phase 4 complete

### Scope

- [x] Build app shell and authenticated session flow
- [x] Implement views:
  - board
  - my tasks
  - archive/history
  - settings
- [x] Implement task creation and editing
- [x] Implement task detail sheet or page
- [x] Implement checklist editing
- [x] Implement comments UI
- [x] Implement attachment UI for uploads and links
- [x] Implement recurrence template management UI
- [x] Implement reorder UX
- [x] Implement refetch-on-focus and optional polling
- [x] Add loading, empty, error, and conflict states

### Deliverables

- [x] Humans can manage household work entirely through the web app
- [x] Mobile-first interactions are usable on iPhone and Android browsers
- [x] The core board feels stable and coherent without realtime push

### Exit Criteria

- [x] Full manual household workflow works without terminal or API calls
- [x] Accessibility basics are in place for navigation, forms, and status changes
- [x] UI handles conflict and permission failures cleanly

### Risks

- Building the board UI before task-detail interactions are solid
- Drag-and-drop complexity on mobile

### Mitigation

- Start with a tap-to-move fallback and add richer gesture behavior only if it remains reliable

## Phase 5: Background Jobs and Lifecycle Automation

### Goal

Automate the recurring and archival behaviors that make the product useful over time.

### Status

- [x] Phase 5 complete

### Scope

- [x] Implement recurring occurrence generation job
- [x] Implement done-task archival job
- [x] Implement stale-upload cleanup job
- [x] Add observability for job runs and failures
- [x] Ensure jobs are safe to re-run

### Deliverables

- [x] Recurring tasks generate future occurrences correctly
- [x] Done tasks archive automatically after retention period
- [x] Failed partial uploads do not accumulate indefinitely

### Exit Criteria

- [x] Job tests cover idempotency and duplicate-trigger safety
- [x] Recurring templates never produce more than one open occurrence
- [x] Archival behavior matches configured retention defaults

### Risks

- Timezone bugs
- Duplicate recurring generation under retries

### Mitigation

- Normalize scheduling logic around household timezone and add date-boundary tests

## Phase 6: MCP Server for Service Actors

### Goal

Expose a bounded, policy-respecting tool surface for service actors.

### Status

- [ ] Phase 6 complete

### Scope

- [ ] Implement MCP server backed by the same domain services as the API
- [ ] Expose only approved v1 tools:
  - `list_my_tasks`
  - `get_task`
  - `transition_task_status`
  - `add_comment`
  - `attach_link`
- [ ] Authenticate service actors via service token
- [ ] Add audit logging for MCP-triggered mutations

### Deliverables

- [ ] Service actors can work on eligible tasks without bypassing app rules
- [ ] MCP behavior is consistent with API behavior

### Exit Criteria

- [ ] Service actors can complete a realistic task lifecycle through MCP
- [ ] MCP requests fail cleanly when AI assistance is disabled or assignment changes
- [ ] Audit trails show MCP-originated actions clearly

### Risks

- MCP implementation drifting from API policy behavior

### Mitigation

- Keep MCP thin and route all business logic through shared services

## Phase 7: Deployment and Operations

### Goal

Make the app straightforward to deploy on exe.dev and understandable to self-host elsewhere.

### Status

- [ ] Phase 7 complete

### Scope

- [ ] Add production build and runtime configuration
- [ ] Add GitHub Actions deployment workflow for the official deployment
- [ ] Add environment validation at startup
- [ ] Add backup and restore guidance for SQLite and uploads
- [ ] Add first self-hosting guide using Caddy plus `oauth2-proxy`
- [ ] Document household bootstrap flow for official deployment

### Deliverables

- [ ] Official deployment path works from CI
- [ ] Self-hosting reference documentation exists
- [ ] Operators understand config, storage, and auth expectations

### Exit Criteria

- [ ] Fresh deployment can be bootstrapped from documented steps
- [ ] Environment misconfiguration fails loudly
- [ ] Persistence locations and backup guidance are documented

### Risks

- Deployment-specific assumptions leaking into app internals

### Mitigation

- Keep deployment details in config and docs, not hard-coded in the app

## Phase 8: OSS Readiness and Public Launch Polish

### Goal

Prepare the repository for wider public use once the app is in a working state.

### Status

- [ ] Phase 8 complete

### Scope

- [ ] Add `CONTRIBUTING.md`
- [ ] Add issue templates and pull request template
- [ ] Tighten README for first-time users
- [ ] Add architecture and local development guides
- [ ] Add screenshots or demo media
- [ ] Review license, credits, and roadmap docs

### Deliverables

- [ ] Repo is understandable to outside contributors
- [ ] Public docs reflect the actual shipped workflow

### Exit Criteria

- [ ] A new contributor can boot the app from the docs
- [ ] OSS support files match the real project state

## Suggested Milestones

### Milestone A: Foundation Ready

- [ ] Complete phases 0 through 2.

At this point the repo has working tooling, persistence, auth boundaries, and domain rules.

### Milestone B: Human-Usable MVP

- [ ] Complete phases 3 through 5.

At this point a household can use SWNTD through the web app for real planning and execution.

### Milestone C: Service Actor Integration

- [ ] Complete phase 6.

At this point a service actor can collaborate safely through MCP on explicitly eligible tasks.

### Milestone D: Publishable OSS Project

- [ ] Complete phases 7 and 8.

At this point the repo is ready for broader public visibility and outside contributors.

## Recommended Build Order Inside the First Working Sprint

1. Phase 0 workspace and CI skeleton
2. Database schema and migrations
3. Domain services for tasks, ordering, and recurrence
4. Auth resolution and policy checks
5. Minimal task API
6. Minimal board UI with create, edit, move, and archive
7. Settings and recurring template management

This order should get the project to a usable internal MVP quickly without forcing us to solve service-actor integration, self-host docs, and deployment automation all at once.

## Definition of Done for V1

V1 should be considered done when:

- [ ] Human admins can manage household tasks entirely through the web app
- [ ] Recurring chores work reliably through template-driven occurrences
- [ ] Service actors can safely collaborate on eligible tasks through MCP
- [ ] The official deployment is automated through GitHub Actions
- [ ] The repository is documented clearly enough for outside readers to understand and run the project
