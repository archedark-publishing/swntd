# Retrospective View Specification

## Overview

The Retrospective view adds a first-class recurring reflection and planning workflow to SWNTD. It should support a household's monthly relationship retro, but the product shape should stay general enough for housemates, solo planning, projects, and small teams.

The core idea is a guided, round-by-round review session backed by structured commitments, private-until-revealed reflection entries, discussion topics, and a task lookback for the reviewed period.

V1 should avoid tying retrospectives to tasks too tightly. Tasks remain tasks. Retrospectives can query completed tasks for lookback, but new commitments should live in the retrospective domain rather than cluttering the kanban board.

## Product Goals

- Let a household create and run one active retrospective at a time.
- Support configurable cadence and reusable retrospective templates.
- Walk users through a retrospective one round at a time.
- Preserve finalized retrospectives as historical snapshots.
- Track commitments throughout the next period without exploding them into task checklists.
- Support private reflection entries that are inaccessible to other users until the configured reveal round.
- Keep the language warm and direct, not corporate.
- Keep the implementation open-source friendly and useful beyond one household's relationship ritual.

## Non-Goals For V1

- Multiple active retrospectives in the same household.
- Automatic roll-forward of incomplete commitments.
- Hard links from tasks to retrospectives.
- Hiding individual completed tasks from the lookback.
- Advanced privacy options beyond private-until-revealed.
- Service actor or MCP access to private retrospective data.
- Realtime collaborative editing.

## Primary V1 Flow

1. A household admin opens the Retrospective view.
2. If no retrospective is active, the view shows:
   - active commitments and current progress
   - private reflection entry composer for the current user
   - past retrospectives
   - a create retrospective action
3. Creating a retrospective chooses:
   - template
   - reviewed period start and end
   - scheduled date
   - title
   - initial discussion topics
4. The new retrospective snapshots its template rounds.
5. During the retrospective, the UI shows one round at a time.
6. When the reveal/private-reflection round is reached, entries for that period become visible to the household inside that retrospective.
7. New commitments are created during the commitment round and become active for the next period.
8. Finalizing the retrospective stores a historical snapshot and closes the active session.

## Default Household Template

The default template should match the current relationship-retro flow while using general labels:

1. `Review commitments`
   - Round kind: `commitment_review`
   - Purpose: assess prior commitments manually.
2. `Month in review`
   - Round kind: `task_lookback`
   - Purpose: show completed tasks for the retrospective period and allow high-level notes.
3. `Discussion topics`
   - Round kind: `shared_notes`
   - Purpose: work through lightweight shared bullet points.
4. `New commitments`
   - Round kind: `commitment_capture`
   - Purpose: create commitments for the next period.
5. `Planning`
   - Round kind: `planning_notes`
   - Purpose: capture scheduling and planning notes without forcing task links.
6. `Appreciation`
   - Round kind: `private_reveal`
   - Purpose: reveal private reflection entries from the period and allow live additions.

The labels should be template data, not hardcoded. Other templates can rename `Appreciation` to `Wins`, `Shout-outs`, `Things worth remembering`, or anything else.

## Round Model

Retrospective templates are composed from ordered rounds. Each round has a `kind` that controls the UI behavior and a user-editable title.

Initial round kinds:

- `commitment_review`: lists commitments that are ready for review and captures manual assessment.
- `task_lookback`: lists tasks completed during the retrospective period.
- `shared_notes`: shared bullet-list discussion.
- `commitment_capture`: creates commitments for the next tracking period.
- `planning_notes`: shared notes focused on planning and scheduling.
- `private_reveal`: reveals private reflection entries for the reviewed period.
- `freeform`: plain shared notes for custom templates.

Round behavior should be generic. `private_reveal` should not assume appreciation-specific language in the data model.

## Commitment Model

Commitments are first-class records owned by the household. They may be created during a retrospective, but they are not tasks.

Supported V1 tracking kinds:

- `binary`: one-off goal, manually marked complete or incomplete.
- `count_per_period`: target count over a repeating interval, such as `Read 3x/week`.
- `checklist`: finite list of items.
- `manual`: freeform commitment that is only assessed during review.

Commitments are manually assessed during a later retrospective. Progress tracking helps the humans decide how it went; it should not auto-grade the commitment.

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
  - items: collect forms, review deductions, file
- `Be more intentional about bedtime`
  - tracking kind: `manual`

## Privacy Model

Private reflection entries must be inaccessible through normal API queries to users other than the author until they are revealed.

V1 visibility states:

- `private_until_reveal`: visible only to the author.
- `revealed`: visible to household admins in the retrospective where it was revealed.

Privacy boundary:

- The API must filter private entries by `author_user_id`.
- Reveal must be a server-side mutation.
- Service actors must not read or mutate retrospective private entries in V1.
- This is application-layer privacy, not encryption against database operators.

Reveal behavior:

- A `private_reveal` round reveals matching private entries for the retrospective period.
- Reveal should set `revealed_at`, `revealed_in_retrospective_id`, and `visibility_state = revealed`.
- Finalized retrospectives should show the revealed entries as part of the retrospective history.

## Settings

General Settings should add retrospective defaults:

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
- `is_default`
- `is_system`
- `created_by_user_id`
- `updated_by_user_id`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_templates_household_id_idx`
- unique partial/default guard so each household has one default template

### `retrospective_template_rounds`

- `id`
- `template_id`
- `title`
- `kind`
- `prompt`
- `sort_order`
- `config_json`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_template_rounds_template_id_idx`

### `retrospectives`

- `id`
- `household_id`
- `template_id`
- `title`
- `status`: `draft`, `active`, `finalized`
- `cadence`
- `cadence_interval`
- `period_start_on`
- `period_end_on`
- `scheduled_for_on`
- `current_round_id`
- `created_by_user_id`
- `updated_by_user_id`
- `started_at`
- `finalized_at`
- `created_at`
- `updated_at`

Indexes:

- `retrospectives_household_id_status_idx`
- `retrospectives_period_idx`
- V1 should enforce at most one `draft` or `active` retrospective per household.

### `retrospective_rounds`

These are snapshots copied from the template when a retrospective is created.

- `id`
- `retrospective_id`
- `source_template_round_id`
- `title`
- `kind`
- `prompt`
- `sort_order`
- `config_json`
- `started_at`
- `completed_at`
- `summary`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_rounds_retrospective_id_idx`

### `retrospective_notes`

Shared notes, discussion topics, planning bullets, and round summaries.

- `id`
- `retrospective_id`
- `round_id`
- `author_user_id`
- `body`
- `sort_order`
- `created_at`
- `updated_at`

Indexes:

- `retrospective_notes_round_id_idx`

### `reflection_entries`

Private-until-reveal notes written during a period.

- `id`
- `household_id`
- `author_user_id`
- `body`
- `entry_on`
- `visibility_state`: `private_until_reveal`, `revealed`
- `revealed_in_retrospective_id`
- `revealed_in_round_id`
- `revealed_at`
- `created_at`
- `updated_at`

Indexes:

- `reflection_entries_household_author_idx`
- `reflection_entries_household_entry_on_idx`
- `reflection_entries_revealed_retrospective_idx`

### `commitments`

- `id`
- `household_id`
- `created_in_retrospective_id`
- `title`
- `description`
- `assignee_user_id`
- `tracking_kind`: `binary`, `count_per_period`, `checklist`, `manual`
- `tracking_interval`: `none`, `daily`, `weekly`, `monthly`
- `target_count`
- `period_start_on`
- `period_end_on`
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

### Retrospectives

- `GET /api/v1/retrospectives`
  - Lists retrospectives for the household.
  - Supports `status`, `limit`, and `offset`.
- `POST /api/v1/retrospectives`
  - Creates a draft retrospective and snapshots template rounds.
- `GET /api/v1/retrospectives/:retrospectiveId`
  - Returns full detail including rounds, notes, commitment reviews, revealed reflection entries, and task lookback.
- `PATCH /api/v1/retrospectives/:retrospectiveId`
  - Updates title, dates, scheduled date, or current round while editable.
- `POST /api/v1/retrospectives/:retrospectiveId/start`
  - Moves `draft` to `active`.
- `POST /api/v1/retrospectives/:retrospectiveId/rounds/:roundId/complete`
  - Marks the round complete and advances to the next round.
  - If the next or current round is `private_reveal`, runs the reveal mutation.
- `POST /api/v1/retrospectives/:retrospectiveId/finalize`
  - Marks the retrospective finalized.

### Templates

- `GET /api/v1/retrospective-templates`
- `POST /api/v1/retrospective-templates`
- `GET /api/v1/retrospective-templates/:templateId`
- `PATCH /api/v1/retrospective-templates/:templateId`
- `DELETE /api/v1/retrospective-templates/:templateId`

Deleting a template should be blocked if it is the household default or has active draft usage.

### Notes And Topics

- `POST /api/v1/retrospectives/:retrospectiveId/rounds/:roundId/notes`
- `PATCH /api/v1/retrospective-notes/:noteId`
- `DELETE /api/v1/retrospective-notes/:noteId`

Discussion topics are notes in a `shared_notes` round.

When creating a retrospective, initial discussion topics should be inserted as notes on the first `shared_notes` round in the selected template snapshot. If the template has no `shared_notes` round, the create flow should hide that input.

### Reflection Entries

- `GET /api/v1/reflection-entries`
  - Returns only the actor's private entries plus revealed entries visible to the household.
  - Supports `from` and `to`.
- `POST /api/v1/reflection-entries`
- `PATCH /api/v1/reflection-entries/:entryId`
  - Only the author may edit while private.
- `DELETE /api/v1/reflection-entries/:entryId`
  - Only the author may delete while private.

Reveal is not a standalone public endpoint in V1. It happens as part of round advancement.

### Commitments

- `GET /api/v1/commitments`
  - Supports `status`, `from`, `to`, and `assigneeUserId`.
- `POST /api/v1/commitments`
- `GET /api/v1/commitments/:commitmentId`
- `PATCH /api/v1/commitments/:commitmentId`
- `POST /api/v1/commitments/:commitmentId/checkins`
- `PATCH /api/v1/commitment-checkins/:checkinId`
- `DELETE /api/v1/commitment-checkins/:checkinId`
- `POST /api/v1/commitments/:commitmentId/reviews`
- `PATCH /api/v1/commitment-reviews/:reviewId`

## Web UI Design

Add `Retrospective` to the main nav.

### Retrospective Home

When there is no active retrospective:

- Active commitments, grouped by tracking kind and assignee.
- Private reflection composer for the current user.
- Create retrospective button.
- Past retrospectives list.

When a draft or active retrospective exists:

- Continue retrospective action.
- Current round summary.
- Discussion topics for the first `shared_notes` round, if present.
- Active commitments quick tracker.
- Private reflection composer.

### Facilitated Retrospective View

The active session should show:

- round title and progress indicator
- current round content
- previous and next controls
- finalize action on the last round

Round-specific UI:

- `commitment_review`
  - Show commitments from the prior period that are active or unreviewed.
  - Show progress evidence.
  - Capture rating and notes.
- `task_lookback`
  - Show tasks completed between `period_start_on` and `period_end_on`.
  - Include archived and unarchived completed tasks.
  - Allow shared round notes.
- `shared_notes`
  - Lightweight bullet list.
  - Add, edit, delete, reorder.
- `commitment_capture`
  - Commitment creation form.
  - Support binary, count-per-period, checklist, and manual.
- `planning_notes`
  - Shared bullet list or text area.
- `private_reveal`
  - Reveal entries for the period.
  - Allow live shared notes.

### Completed Retrospective Detail

Completed retrospectives should render dashboard-style:

- date and reviewed period
- round summaries and notes
- commitments reviewed with ratings
- commitments created
- revealed reflection entries
- completed-task lookback

If finalized retros are locked, edit controls should be hidden or disabled.

## Authorization

V1 policy:

- Human admins may manage retrospective templates, retrospectives, commitments, shared notes, and settings.
- Human admins may only read private reflection entries that they authored until reveal.
- Human admins may read revealed reflection entries for their household.
- Service actors cannot read or mutate retrospective data in V1.

This requires new shared authorization helpers, separate from task-specific helpers:

- `canManageRetrospectives(actor)`
- `canReadReflectionEntry(actor, entry)`
- `canMutateReflectionEntry(actor, entry)`
- `canRevealReflectionEntries(actor)`
- `canReadCommitment(actor, commitment)`
- `canMutateCommitment(actor, commitment)`

## Task Lookback Query

The task lookback should query tasks by:

- same household
- `status = Done`
- `completed_at` within retrospective period

It should include archived tasks. No task-retrospective link is created in V1.

## Implementation Plan

### Phase 1: Domain And Schema

- Add Drizzle schema entities and migration.
- Add retrospective settings columns.
- Add shared domain constants and type unions for round kinds, statuses, tracking kinds, ratings, and visibility states.
- Add authorization helpers and tests.
- Seed the default retrospective template during bootstrap if none exists for the household.

### Phase 2: API Services

- Add service functions for templates, retrospectives, rounds, notes, reflection entries, commitments, checkins, and reviews.
- Add private-entry query filtering at the service layer.
- Add reveal mutation as an atomic server-side operation.
- Add completed-task lookback query.
- Add integration tests for:
  - creating a retrospective from a template
  - one-active-retro enforcement
  - private entries hidden from other admins
  - private entries revealed on reveal round
  - commitment creation, checkins, and manual review

### Phase 3: API Routes And Client

- Add Hono route schemas.
- Add frontend API client types and methods.
- Include retrospective data in `refreshApp` or add view-specific loading if payload size grows.

### Phase 4: Web UI

- Add Retrospective nav item and hash route.
- Build Retrospective Home.
- Build active facilitated session shell.
- Build round components.
- Build commitment tracker components.
- Build completed retrospective detail.
- Add General Settings controls for cadence, default template, and finalized edit policy.

### Phase 5: Polish And Documentation

- Update README feature list.
- Update product spec or link this feature spec.
- Add contributor notes for privacy-sensitive retrospective data.
- Run lint, typecheck, tests, and build.

## Open Questions

- Should `private_reveal` reveal entries when the round is opened or when leaving the previous round?
- Should live entries added during the reveal round be stored as shared notes or revealed reflection entries?
- Should commitment assignee be required, optional, or default to household-level?
- Should solo users see different default wording for the private reveal round?
- Should finalized snapshots duplicate task lookback data, or should completed-task lookback remain a live query by period?

## Recommended V1 Decisions

- Reveal entries when the `private_reveal` round becomes the current round.
- Store live reveal-round additions as shared retrospective notes unless the user adds them through the private reflection composer before reveal.
- Keep commitment assignee optional; household-level commitments are useful.
- Do not duplicate task lookback data in V1. A finalized retro stores round content and revealed entries, while task lookback remains a query by completed date.
- Keep finalized retros locked by default, with a setting to allow edits.
