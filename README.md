# S#!% We Need To Do (SWNTD)

S#!% We Need To Do is a lightweight household kanban board and issue tracker designed for humans and AI collaborators to share a single source of truth for chores, errands, and recurring home tasks.

The project is being built as a polished, general-purpose open source web app that other households can fork and self-host, while still working well with exe.dev deployment and authentication.

## Status

Phase 6 complete, with household actor management now live in Settings alongside the MCP surface, web app, API, and lifecycle jobs.

The current implementation baseline includes the `/api/v1` HTTP surface, upload/download handling, task event recording, recurring/archive cleanup jobs, admin-managed household people and assistants, assistant service-token issuance and revocation, permanent soft-removal for mistaken or retired actors, a stdio MCP server with the approved v1 tool surface, and a responsive board-oriented web app with board, my tasks, archive, and settings views. Product details still follow [docs/product-spec.md](docs/product-spec.md), with execution tracking in [docs/implementation-plan.md](docs/implementation-plan.md).

Key architectural choices and their rationale are tracked in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).
The API also exposes a lightweight machine-readable contract at `/api/v1/openapi.json`.

## Local Development

The repository is organized as a `pnpm` workspace with four packages:

- `apps/web` for the React + Vite frontend
- `apps/api` for the HTTP API
- `apps/mcp` for the MCP server
- `packages/shared` for shared types and domain utilities

To bootstrap the workspace locally:

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm db:bootstrap
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Useful package-level commands:

```bash
pnpm db:migrate
pnpm db:bootstrap
pnpm jobs:run
pnpm --filter @swntd/web dev
pnpm --filter @swntd/api dev
pnpm --filter @swntd/mcp dev
```

For browser development, `apps/web` proxies `/api` requests to `SWNTD_API_PROXY_TARGET`, which defaults to `http://127.0.0.1:3001`, and can optionally send `VITE_SWNTD_DEV_ACTOR_EMAIL` in local development when the API is running in `local_dev` auth mode.

The MCP server reads `SWNTD_MCP_SERVICE_TOKEN` from the environment and authenticates as a service actor on each tool call. In local development, point that env var at an issued SWNTD service token before running `pnpm --filter @swntd/mcp dev`.

The bootstrap configuration is intentionally generic. Household-specific admin emails, service actor names, and deployment secrets should live in local `.env` files or GitHub Actions secrets, not in committed repository data. Bootstrap now seeds missing initial users, but in-app household actor management becomes the source of truth for display names, assistant tokens, and whether an actor still belongs in the active household cast after setup.

## Product Goals

- Keep household task management simple, fast, and mobile-friendly.
- Support a shared board for humans plus a bounded AI collaborator workflow.
- Stay deployment-target agnostic even though exe.dev is the first deployment target.
- Provide a clean open source codebase with strong documentation, CI/CD, and contributor ergonomics.

## Planned V1 Highlights

- Four board states: `To Do`, `In Progress`, `Waiting`, and `Done`
- Responsive web UI with board, my tasks, archive/history, and settings views
- Recurring task reset behavior for chores and ongoing responsibilities
- Checklist-style subtasks inside cards
- Comments, labels, attachments, and due dates
- Human-admin permissions with constrained service-actor automation
- REST API plus a built-in MCP server for agent workflows
- Server-authoritative sync with refetch/polling in v1
- "Add to Calendar" support for tasks that should surface in personal calendars

## Recommended Stack

- TypeScript throughout
- React + Vite frontend
- Lightweight TypeScript API backend
- SQLite-first persistence with a clean path to PostgreSQL later
- Local disk attachment storage for self-hosted deployments
- GitHub Actions for lint, test, build, and deployment automation

## Repository Standards

- Keep product decisions documented before implementation.
- Preserve deployment-agnostic boundaries around auth, storage, and runtime assumptions.
- Prefer explicit contracts and shared schemas over hidden coupling.
- Treat service-actor support as a first-class interface, not an afterthought.

## Naming Notes

- Public-facing product name: `S#!% We Need To Do`
- Common abbreviation: `SWNTD`
- Repository slug: `swntd`

## License

MIT. See [LICENSE](LICENSE).
