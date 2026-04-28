# Retrospective View Specification

## Overview

The Retrospective view adds a first-class recurring reflection and planning workflow to SWNTD. It should support household relationship retros, housemate check-ins, solo planning, project reviews, and small-team retros without hardcoding any one use case.

The core idea is a guided, round-by-round retrospective session backed by structured commitments, notes with configurable entry timing and privacy, and a task lookback for the reviewed period.

Tasks remain tasks. Retrospectives can query completed tasks for lookback, but commitments and notes live in the retrospective domain so the kanban board stays focused on work that belongs there.

## Product Goals

- Let a household create and run one draft or active retrospective at a time.
- Support configurable cadence and reusable retrospective templates.
- Walk users through a retrospective one round at a time.
- Track the current commitment period between retrospectives.
- Track commitments throughout the period without turning them into task checklists.
- Support notes that can be shared immediately, private forever, or private until the configured retrospective round is reached.
- Preserve finalized retrospectives as historical snapshots.
- Keep the language warm and direct, not corporate.
- Keep the implementation open-source friendly and useful beyond one household's relationship ritual.

## Non-Goals For V1

- Multiple active retrospectives in the same household.
- Automatic roll-forward of incomplete commitments.
- Hard links from tasks to retrospectives.
- Hiding individual completed tasks from the lookback.
- Per-note privacy overrides that differ from the round's privacy setting.
- Service actor or MCP access to retrospective data.
- Realtime collaborative editing.
- Audit history beyond created and updated timestamps.

## Cycle Model

Retrospectives and commitment periods are separate concepts:

- A retrospective reviews the previous commitment period.
- Finalizing a retrospective starts the next commitment period.
- The commitment period has a `period_start_on` and `closure_on`.
- `closure_on` is the date commitments are due and the date the next retrospective becomes available.
- The Retrospective home shows days remaining until `closure_on`, clamped at `0`.
- If the household creates the next retrospective late, the reviewed period still ends on the prior `closure_on`; late creation does not silently extend the period.
- The current commitment period remains `active` until a retrospective is created for it. Once `closure_on` arrives, it is active but ready for review.

V1 does not need a separate `next_retrospective_available_on`. It is derived from `closure_on`.

## Primary V1 Flow

1. A household admin opens the Retrospective view.
2. If no retrospective is active, the view shows:
   - current commitment period and days until closure
   - active commitments and current progress
   - note composers for rounds that accept commitment-period entries
   - past retrospectives
   - a create retrospective action once closure has arrived
3. Creating a retrospective chooses:
   - template of pre-composed ordered rounds
   - title
   - optional initial notes for rounds that accept retrospective entries
4. The new retrospective reviews the current review-ready commitment period.
5. The new retrospective snapshots its template rounds.
6. During the retrospective, the UI shows one round at a time.
7. When a notes round with `private_until_round` privacy is reached, matching notes become visible to the household inside that retrospective.
8. New commitments are created during the commitment-capture round and assigned to the next period.
9. Finalizing the retrospective stores the historical session, closes the active session, and starts the next commitment period.

## Starter Template

The app should seed one generic starter template for convenience. It should not be treated as mandatory or relationship-specific. Households may edit it, create another template, and choose their own default. Deleting the last remaining template should be blocked.

Suggested starter template:

1. `Commitments`
   - Round kind: `commitment_review`
   - Purpose: assess prior commitments manually.
2. `Lookback`
   - Round kind: `task_lookback`
   - Purpose: show completed tasks for the reviewed period and allow high-level notes.
3. `Topics`
   - Round kind: `notes`
   - Entry phase: `both`
   - Privacy: `shared`
   - Purpose: work through shared discussion points gathered before or during the retrospective.
4. `Next commitments`
   - Round kind: `commitment_capture`
   - Purpose: create commitments for the next period.
5. `Planning`
   - Round kind: `notes`
   - Entry phase: `retrospective`
   - Privacy: `shared`
   - Purpose: capture scheduling and planning notes during the session.
6. `Highlights`
   - Round kind: `notes`
   - Entry phase: `commitment_period`
   - Privacy: `private_until_round`
   - Purpose: reveal notes collected during the period when this round is reached.

The labels are template data, not hardcoded. Other templates can rename rounds to `Appreciation`, `Wins`, `Things worth remembering`, `Blockers`, or anything else.

## Round Model

Retrospective templates are composed from ordered rounds. Each round has a `kind` that controls the UI behavior and a user-editable title.

Initial round kinds:

- `commitment_review`: lists commitments ready for review and captures manual assessment.
- `task_lookback`: lists tasks completed during the reviewed commitment period.
- `notes`: shared or private note collection, discussion, planning, appreciation, highlights, or freeform reflection.
- `commitment_capture`: creates commitments for the next commitment period.

Notes rounds carry two important config fields:

- `entry_phase`
  - `commitment_period`: composer appears during the commitment period before the retrospective exists.
  - `retrospective`: composer appears during the live retrospective.
  - `both`: composer appears during both phases.
- `privacy`
  - `shared`: visible to the household immediately.
  - `private_until_round`: visible only to the author until this round is reached in the retrospective.
  - `private`: visible only to the author indefinitely.

Privacy is configured at the round level in V1. Individual notes do not override the round's privacy setting.

## Commitment Model

Commitments are first-class records owned by the household. They may be created during a retrospective, but they are not tasks.

Supported V1 tracking kinds:

- `binary`: one-off goal, manually marked complete or incomplete.
- `count_per_period`: target count over a repeating interval, such as `Read 3x/week`.
- `checklist`: finite list of items.
- `freeform`: commitment that is only assessed during review.

Commitments are manually assessed during a later retrospective. Progress tracking helps the humans decide how it went; it should not auto-grade the commitment.

Commitments remain editable after a retrospective is finalized. V1 should allow editing title, description, assignee, tracking kind, tracking interval, target count, checklist items, and status. The only audit trail required in V1 is timestamps.

Example commitment definitions:

- `Plan one date night`
  - tracking kind: `binary`
  - period: next retrospective cycle
- `Read 3x/week`
  - tracking kind: `count_per_period`
  - target count: `3`
  - tracking interval: `weekly`
- `Prepare taxes`
  - tracking kind: `checklist`
  - items can be added and changed as the plan becomes clearer
- `Be more intentional about bedtime`
  - tracking kind: `freeform`

## Notes And Privacy Model

Notes are attached to a commitment period and a template round or retrospective round. This lets users enter notes during the commitment period before the next retrospective has been created.

Examples:

- Discussion topics: `notes`, `entry_phase = both`, `privacy = shared`.
- Planning notes: `notes`, `entry_phase = retrospective`, `privacy = shared`.
- Highlights or appreciation: `notes`, `entry_phase = commitment_period`, `privacy = private_until_round`.
- Personal journal: `notes`, `entry_phase = commitment_period`, `privacy = private`.

Private notes must be inaccessible through normal API queries to users other than the author until they are revealed.

V1 visibility states:

- `shared`: visible to household admins immediately.
- `private_until_round`: visible only to the author until reveal.
- `private`: visible only to the author indefinitely.
- `revealed`: visible to household admins in the retrospective where it was revealed.

Privacy boundary:

- The API must filter unrevealed private notes by `author_user_id`.
- Reveal must be a server-side mutation.
- Service actors must not read or mutate retrospective data in V1.
- This is application-layer privacy, not encryption against database operators.

Reveal behavior:

- When a `notes` round with `privacy = private_until_round` becomes the current round, matching notes for the reviewed period are revealed.
- Reveal should set `revealed_at`, `revealed_in_retrospective_id`, `revealed_in_round_id`, and `visibility_state = revealed`.
- Finalized retrospectives should show revealed notes as part of the retrospective history.

## Settings

Settings should add a `Retrospective` tab.

Retrospective settings:

- retrospective cadence: `weekly`, `monthly`, `quarterly`, or `custom`
- retrospective cadence interval: positive integer
- default retrospective template
- finalized retrospective edit policy: `locked` or `editable`

Recommended defaults:

- cadence: `monthly`
- interval: `1`
- edit policy: `locked`

## Data Model

The schema should stay household-scoped even though SWNTD currently deploys one household per instance.

### `retrospective_templates`

- `id`
- `household_id`
- `name`
- `description`
- `is_system`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_templates_household_id_idx`

Default template selection should live on `household_settings.default_retrospective_template_id`, not as an `is_default` flag on templates.

### `retrospective_template_rounds`

- `id`
- `template_id`
- `title`
- `kind`: `commitment_review`, `task_lookback`, `notes`, `commitment_capture`
- `prompt`
- `sort_order`
- `entry_phase`: `commitment_period`, `retrospective`, `both`, nullable for non-notes rounds
- `privacy`: `shared`, `private_until_round`, `private`, nullable for non-notes rounds
- `config_json`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_template_rounds_template_id_idx`

### `commitment_periods`

Commitment periods are the bridge between retrospectives. Notes and commitments attach to a period even before the reviewing retrospective exists.

- `id`
- `household_id`
- `opened_by_retrospective_id`
- `reviewed_by_retrospective_id`
- `status`: `active`, `closed`, `reviewed`
- `period_start_on`
- `closure_on`
- `created_at`
- `updated_at`

Indexes:

- `commitment_periods_household_status_idx`
- `commitment_periods_household_closure_idx`
- V1 should enforce at most one `active` commitment period per household.

Bootstrap should create an initial active commitment period if one does not exist.

Creating a retrospective for a period should mark that period `closed`. Finalizing the retrospective should mark it `reviewed` and create the next `active` period.

### `retrospectives`

- `id`
- `household_id`
- `template_id`
- `commitment_period_id`
- `title`
- `status`: `draft`, `active`, `finalized`
- `current_round_id`
- `created_by_user_id`
- `updated_by_user_id`
- `started_at`
- `finalized_at`
- `created_at`
- `updated_at`

Indexes:

- `retrospectives_household_status_idx`
- `retrospectives_commitment_period_idx`
- V1 should enforce at most one `draft` or `active` retrospective per household.

The reviewed date range is read from the associated commitment period's `period_start_on` and `closure_on`.

### `retrospective_rounds`

These are snapshots copied from the template when a retrospective is created.

- `id`
- `retrospective_id`
- `source_template_round_id`
- `title`
- `kind`
- `prompt`
- `sort_order`
- `entry_phase`
- `privacy`
- `config_json`
- `started_at`
- `completed_at`
- `summary`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_rounds_retrospective_id_idx`

### `retrospective_notes`

Shared notes, private notes, discussion topics, planning bullets, highlights, and round summaries.

- `id`
- `household_id`
- `commitment_period_id`
- `template_round_id`
- `retrospective_id`
- `round_id`
- `author_user_id`
- `body`
- `entry_phase`: `commitment_period`, `retrospective`
- `visibility_state`: `shared`, `private_until_round`, `private`, `revealed`
- `revealed_in_retrospective_id`
- `revealed_in_round_id`
- `revealed_at`
- `sort_order`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_notes_household_author_idx`
- `retrospective_notes_period_idx`
- `retrospective_notes_round_idx`
- `retrospective_notes_revealed_retrospective_idx`

Notes entered during a commitment period should store `template_round_id`. When the next retrospective is created and rounds are snapshotted, matching period notes should also receive `retrospective_id` and `round_id` for the corresponding copied round.

### `commitments`

- `id`
- `household_id`
- `commitment_period_id`
- `created_in_retrospective_id`
- `title`
- `description`
- `assignee_user_id`
- `tracking_kind`: `binary`, `count_per_period`, `checklist`, `freeform`
- `tracking_interval`: `none`, `daily`, `weekly`, `monthly`
- `target_count`
- `status`: `active`, `reviewed`, `archived`
- `created_by_user_id`
- `updated_by_user_id`
- `completed_at`
- `created_at`
- `updated_at`

Indexes:

- `commitments_household_status_idx`
- `commitments_period_idx`
- `commitments_created_in_retrospective_idx`

`commitment_period_id` is nullable while a retrospective is active. Commitments captured for the next period should store `created_in_retrospective_id` first. When the retrospective is finalized, the API creates the next commitment period and assigns those captured commitments to it.

### `commitment_checkins`

Progress entries for binary and count-based commitments.

- `id`
- `commitment_id`
- `actor_user_id`
- `checkin_on`
- `amount`
- `note`
- `created_at`
- `updated_at`

Indexes:

- `commitment_checkins_commitment_id_idx`
- `commitment_checkins_commitment_date_idx`

### `commitment_checklist_items`

- `id`
- `commitment_id`
- `body`
- `is_completed`
- `sort_order`
- `created_at`
- `updated_at`

Indexes:

- `commitment_checklist_items_commitment_id_idx`

### `commitment_reviews`

Manual assessments captured during a retrospective.

- `id`
- `commitment_id`
- `retrospective_id`
- `round_id`
- `rating`: `met`, `mostly_met`, `partly_met`, `missed`, `skipped`
- `note`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Indexes:

- `commitment_reviews_commitment_id_idx`
- `commitment_reviews_retrospective_id_idx`
- unique on `commitment_id`, `retrospective_id`

### `household_settings` additions

- `retrospective_cadence`
- `retrospective_cadence_interval`
- `default_retrospective_template_id`
- `finalized_retrospective_edit_policy`

## API Design

All endpoints should require a human admin in V1 unless explicitly noted.

### Retrospective Home

- `GET /api/v1/retrospective-home`
  - Returns active commitment period, days until closure, active or draft retrospective if present, active commitments, visible period notes, and recent finalized retrospectives.

### Retrospectives

- `GET /api/v1/retrospectives`
  - Lists retrospectives for the household.
  - Supports `status`, `limit`, and `offset`.
- `POST /api/v1/retrospectives`
  - Creates a draft retrospective for the current review-ready commitment period and snapshots template rounds.
  - Marks the reviewed commitment period `closed`.
  - Should fail if `closure_on` has not arrived.
  - Should fail if another draft or active retrospective exists.
- `GET /api/v1/retrospectives/:retrospectiveId`
  - Returns full detail including period, rounds, visible notes, commitment reviews, revealed notes, and task lookback.
- `PATCH /api/v1/retrospectives/:retrospectiveId`
  - Updates title or current round while editable.
- `POST /api/v1/retrospectives/:retrospectiveId/start`
  - Moves `draft` to `active`.
- `POST /api/v1/retrospectives/:retrospectiveId/rounds/:roundId/enter`
  - Makes the round current.
  - Runs reveal if the round is a `notes` round with `privacy = private_until_round`.
- `POST /api/v1/retrospectives/:retrospectiveId/rounds/:roundId/complete`
  - Marks the round complete and advances to the next round.
- `POST /api/v1/retrospectives/:retrospectiveId/finalize`
  - Marks the retrospective finalized.
  - Marks the reviewed commitment period as `reviewed`.
  - Creates the next active commitment period using cadence settings.
  - Assigns commitments captured in the retrospective to the new period.

### Templates

- `GET /api/v1/retrospective-templates`
- `POST /api/v1/retrospective-templates`
- `GET /api/v1/retrospective-templates/:templateId`
- `PATCH /api/v1/retrospective-templates/:templateId`
- `DELETE /api/v1/retrospective-templates/:templateId`

Deleting a template should be blocked if it is the household default, the last template, or has active draft usage.

### Notes

- `GET /api/v1/retrospective-notes`
  - Supports `commitmentPeriodId`, `retrospectiveId`, `templateRoundId`, `roundId`, `from`, and `to`.
  - Returns shared/revealed notes plus unrevealed private notes authored by the actor.
- `POST /api/v1/retrospective-notes`
  - Creates a note using the target round's configured entry phase and privacy.
- `PATCH /api/v1/retrospective-notes/:noteId`
  - Only the author may edit private or unrevealed notes.
  - Shared notes may be edited by household admins while the related period/retro is editable.
- `DELETE /api/v1/retrospective-notes/:noteId`
  - Only the author may delete private or unrevealed notes.
  - Shared notes may be deleted by household admins while the related period/retro is editable.

Reveal is not a standalone public endpoint in V1. It happens when entering a configured round.

### Commitments

- `GET /api/v1/commitments`
  - Supports `status`, `commitmentPeriodId`, and `assigneeUserId`.
- `POST /api/v1/commitments`
- `GET /api/v1/commitments/:commitmentId`
- `PATCH /api/v1/commitments/:commitmentId`
  - Allows editing title, description, assignee, tracking kind, tracking interval, target count, checklist items, and status.
- `POST /api/v1/commitments/:commitmentId/checkins`
- `PATCH /api/v1/commitment-checkins/:checkinId`
- `DELETE /api/v1/commitment-checkins/:checkinId`
- `POST /api/v1/commitments/:commitmentId/reviews`
- `PATCH /api/v1/commitment-reviews/:reviewId`

## Web UI Design

Add `Retrospective` to the main nav.

### Retrospective Home

When no draft or active retrospective exists:

- Current commitment period.
- Days until closure, clamped at `0`.
- Active commitments, grouped by tracking kind and assignee.
- Commitment quick tracker.
- Note composers for template rounds with `entry_phase = commitment_period` or `both`.
- Create retrospective button once closure has arrived.
- Past retrospectives list.

When a draft or active retrospective exists:

- Continue retrospective action.
- Current round summary.
- Active commitments quick tracker.
- Note composers for visible period notes if the retro is not finalized.

### Facilitated Retrospective View

The active session should show:

- round title and progress indicator
- current round content
- previous and next controls
- finalize action on the last round

Round-specific UI:

- `commitment_review`
  - Show commitments from the reviewed period that are active or unreviewed.
  - Show progress evidence.
  - Capture rating and notes.
- `task_lookback`
  - Show tasks completed between the commitment period's `period_start_on` and `closure_on`.
  - Include archived and unarchived completed tasks.
  - Allow round summary notes.
- `notes`
  - Lightweight bullet list.
  - Respect the round's `entry_phase` and `privacy`.
  - Add, edit, delete, reorder.
  - Reveal notes automatically when the round is entered if `privacy = private_until_round`.
- `commitment_capture`
  - Commitment creation form.
  - Support binary, count-per-period, checklist, and freeform.
  - Assign new commitments to the next commitment period that will be created on finalization.

### Completed Retrospective Detail

Completed retrospectives should render dashboard-style:

- date and reviewed period
- round summaries and notes
- commitments reviewed with ratings
- commitments created for the next period
- revealed notes
- completed-task lookback

If finalized retros are locked, edit controls should be hidden or disabled.

### Settings UI

Add `Retrospective` to the Settings tab list.

The Retrospective settings tab should manage:

- cadence
- interval
- default template
- finalized edit policy
- template list
- template editor with ordered rounds and note round config

## Authorization

V1 policy:

- Human admins may manage retrospective templates, retrospectives, commitments, shared notes, and settings.
- Human admins may only read private or unrevealed notes that they authored.
- Human admins may read revealed notes for their household.
- Service actors cannot read or mutate retrospective data in V1.

This requires new shared authorization helpers, separate from task-specific helpers:

- `canManageRetrospectives(actor)`
- `canReadRetrospectiveNote(actor, note)`
- `canMutateRetrospectiveNote(actor, note)`
- `canRevealRetrospectiveNotes(actor)`
- `canReadCommitment(actor, commitment)`
- `canMutateCommitment(actor, commitment)`

## Task Lookback Query

The task lookback should query tasks by:

- same household
- `status = Done`
- `completed_at` within the reviewed commitment period

It should include archived tasks. No task-retrospective link is created in V1.

## Implementation Plan

### Phase 1: Domain And Schema

- [x] Add Drizzle schema entities and migration.
- [x] Add retrospective settings columns.
- [x] Add shared domain constants and type unions for round kinds, statuses, tracking kinds, ratings, entry phases, and visibility states.
- [x] Add authorization helpers and tests.
- [x] Seed the generic starter template during bootstrap if none exists for the household.
- [x] Seed an initial active commitment period during bootstrap if none exists for the household.

### Phase 2: API Services

- [x] Add service functions for templates, commitment periods, retrospectives, rounds, notes, commitments, and checkins.
- [x] Add service functions for commitment reviews.
- [x] Add private-note query filtering at the service layer.
- [x] Add reveal mutation as an atomic server-side operation.
- [x] Add completed-task lookback query.
- [x] Add finalization logic that creates the next commitment period.
- [x] Add integration tests for starter template and initial period bootstrap.
- [x] Add integration tests for creating a retrospective from a template after closure.
- [x] Add integration test for refusing retrospective creation before closure.
- [x] Add integration test for one-active-retro enforcement.
- [x] Add integration test for private notes hidden from other admins.
- [x] Add integration test for private notes revealed on configured notes round.
- [x] Add integration test for private-forever notes never revealed.
- [x] Add integration tests for commitment reviews.
- [x] Add integration tests for commitment creation and edits.
- [x] Add integration tests for commitment checkins.

### Phase 3: API Routes And Client

- [x] Add Hono route schemas.
- [x] Add backend routes for retrospective home, template listing, retrospective lifecycle, notes, commitments, and checkins.
- [x] Add backend routes for commitment reviews.
- [x] Add frontend API client types and methods.
- [x] Prefer view-specific loading for retrospective data so the main board refresh does not grow too large.

### Phase 4: Web UI

- [x] Add Retrospective nav item and hash route.
- [x] Build Retrospective Home.
- [x] Build active facilitated session shell.
- [x] Build commitment review rating controls.
- [ ] Build richer completed-task lookback and completed-round summaries.
- [x] Build commitment tracker components.
- [ ] Build completed retrospective detail.
- [x] Add Retrospective settings tab.
- [ ] Add retrospective template editor.

### Phase 5: Polish And Documentation

- [ ] Update README feature list.
- [ ] Update product spec or link this feature spec.
- [ ] Add contributor notes for privacy-sensitive retrospective data.
- [ ] Run lint, typecheck, tests, and build.

## Recommended V1 Decisions

- Store only `closure_on`; derive next-retro availability from it.
- Create the next commitment period when a retrospective is finalized.
- If a retrospective is created late, review only through the prior `closure_on`.
- Keep note privacy at the round level in V1.
- Reveal `private_until_round` notes when the configured notes round becomes current.
- Store live notes added during the reveal round according to that round's privacy setting. Since the round has already been reached, `private_until_round` notes created there should be immediately revealed.
- Keep commitment assignee optional; household-level commitments are useful.
- Do not duplicate task lookback data in V1. A finalized retro stores round content and revealed notes, while task lookback remains a query by completed date.
- Keep finalized retros locked by default, with a setting to allow edits.
