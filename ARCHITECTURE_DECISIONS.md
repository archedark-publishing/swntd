# Architecture Decisions

This file records the early decisions that shape the first implementation of S#!% We Need To Do (SWNTD).

## AD-001: One Household Per Deployment

- Date: 2026-03-16
- Status: Accepted

### Decision

Each deployed SWNTD instance serves exactly one household in v1.

### Rationale

- It keeps authorization and onboarding much simpler.
- It avoids accidental cross-household access in a public internet-facing deployment.
- It matches the initial use case for a single household with two human admins and one service actor.

### Consequences

- Unknown authenticated users are denied by default.
- Self-service signup and multi-household UX are explicitly deferred.
- The official deployment pipeline may use household-specific bootstrap settings without changing the OSS app contract.

## AD-002: Auth Uses Trusted Headers for Humans and Service Tokens for Service Actors

- Date: 2026-03-16
- Status: Accepted

### Decision

V1 supports three auth modes:

- `trusted_header` for browser users behind a trusted auth proxy such as exe.dev
- `service_token` for service actors and other programmatic clients
- `local_dev` for development and automated testing

### Rationale

- It keeps the application deployment-target agnostic while still fitting exe.dev cleanly.
- It avoids building a first-party auth system before the core product exists.
- It gives service actors a bounded, auditable identity independent from browser auth.

### Consequences

- `trusted_header` may only be enabled behind a proxy that strips user-supplied identity headers and injects canonical authenticated values.
- The app must never trust arbitrary client-provided auth headers when directly internet-exposed.
- Service tokens are hashed at rest, tied to service actors, and revocable.

## AD-003: Recurring Work Uses Templates and Occurrences

- Date: 2026-03-16
- Status: Accepted

### Decision

Recurring chores are represented as templates that generate task occurrences over time.

### Rationale

- It preserves a clean history of each completion cycle.
- It avoids ambiguous reset rules for comments, checklist state, and due dates.
- It makes future analytics and archive/history views much easier.

### Consequences

- Recurring template edits affect future occurrences by default.
- Only one open occurrence should exist per template at a time.
- Completed recurring occurrences move into history once their successor is generated.

## AD-004: V1 Sync Prefers Simplicity Over Push Realtime

- Date: 2026-03-16
- Status: Accepted

### Decision

V1 uses server-authoritative mutations, refetch-on-focus behavior, and optional polling instead of SSE or WebSockets.

### Rationale

- Household usage does not justify the added complexity yet.
- It reduces risk while keeping the UX acceptable for shared in-person planning.
- It is easier to implement portably across self-hosted environments.

### Consequences

- Users may need to refresh or wait for polling to see another person’s changes.
- The architecture should still keep a clean path to SSE later if usage justifies it.

## AD-005: Board Ordering Must Be Stable and Manually Reorderable

- Date: 2026-03-16
- Status: Accepted

### Decision

Tasks have a stable per-status sort key. New tasks appear at the top by default, and users can manually reorder them.

### Rationale

- Kanban without stable ordering gets frustrating quickly.
- This matches the expected household planning workflow better than timestamp-only ordering.

### Consequences

- The data model and API must support reorder operations.
- Generated recurring occurrences should also receive a top-of-column sort key.

## AD-006: Due Dates Use Date Plus Optional Time, with One-Off Calendar Export in V1

- Date: 2026-03-16
- Status: Accepted

### Decision

Tasks may have a due date and an optional due time. Household timezone is configurable, with `America/New_York` as the default for the official deployment. Calendar export in v1 creates one event at a time rather than external recurring rules.

### Rationale

- Date-only and date-time tasks are both useful in a household context.
- One-off exports keep the calendar integration simple and avoid maintaining a second recurrence engine that can drift from SWNTD state.

### Consequences

- Due dates remain optional for all tasks.
- Recurring chores can still be exported, but only as individual occurrences.

## AD-007: Attachments Use Conservative Defaults

- Date: 2026-03-16
- Status: Accepted

### Decision

V1 supports uploaded files and external links with conservative upload defaults.

### Rationale

- Attachments are useful, but file handling is one of the easiest ways to create security and maintenance problems.

### Consequences

- Uploads are stored outside the web root with randomized filenames.
- External links are stored as URLs only; the server does not fetch remote content.
- Service actors may attach links in v1; binary service uploads can be added later if needed.

## AD-008: Self-Hosted Auth Reference Uses oauth2-proxy Behind Caddy

- Date: 2026-03-16
- Status: Accepted

### Decision

The first non-exe.dev self-hosting guide should recommend `oauth2-proxy` as the authentication gateway, fronted by Caddy using `forward_auth`.

### Rationale

- It fits the trusted-header auth boundary already defined for SWNTD.
- `oauth2-proxy` supports multiple identity providers and access restriction patterns.
- Caddy keeps the reference deployment simple and approachable for self-hosters.

### Consequences

- The self-hosting guide should document the proxy boundary clearly so SWNTD never trusts end-user-supplied identity headers directly.
- The first self-hosting path will optimize for simplicity over supporting every reverse proxy from day one.

## AD-009: Service Actors Remain Link-Only for Attachments in V1

- Date: 2026-03-16
- Status: Accepted

### Decision

Service actors may add external-link attachments in v1, but binary file uploads remain human-only until a later release.

### Rationale

- It keeps the first service-token permission model simpler.
- It avoids expanding the upload threat surface before the core product is proven.
- It still allows service actors to reference documents, URLs, and artifacts generated elsewhere.

### Consequences

- Binary service uploads become a roadmap item, not a launch requirement.
- If demand emerges later, we can add them behind tighter limits and audit rules.

## AD-010: Bootstrap Seeds Initial Actors, but In-App Management Owns Them Thereafter

- Date: 2026-03-20
- Status: Accepted

### Decision

Bootstrap configuration creates missing initial admins and the initial service actor, but it does not keep overwriting household actor display names or roles once the app is running. Admins manage people, assistants, and assistant tokens through the app.

### Rationale

- Bootstrap is a good first-run safety net, but it is a poor long-term source of truth for names and assistant lifecycle.
- In-app management is necessary if the project is going to feel like a real multi-actor household tool rather than a config file with a UI attached.
- It avoids a frustrating class of bugs where a restart silently resets edited display names.

### Consequences

- `SWNTD_BOOTSTRAP_ADMIN_EMAILS` and `SWNTD_SERVICE_ACTOR_NAME` remain useful for fresh deployments, but they no longer dictate ongoing actor state.
- The settings UI and API now own household actor creation, updates, deactivation, and assistant token lifecycle.
- Deactivating a service actor revokes their active tokens and clears them from open assignments and recurring defaults.
