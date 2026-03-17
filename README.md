# S#!% We Need To Do (SWNTD)

S#!% We Need To Do is a lightweight household kanban board and issue tracker designed for humans and AI collaborators to share a single source of truth for chores, errands, and recurring home tasks.

The project is being built as a polished, general-purpose open source web app that other households can fork and self-host, while still working well with exe.dev deployment and authentication.

## Status

Planning and specification.

The first implementation work should follow the product spec in [docs/product-spec.md](docs/product-spec.md).

Key architectural choices and their rationale are tracked in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).
The execution sequence is tracked in [docs/implementation-plan.md](docs/implementation-plan.md).

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
- Human-admin permissions with constrained Ada automation
- REST API plus a built-in MCP server for agent workflows
- Realtime board updates
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
- Treat Ada support as a first-class interface, not an afterthought.

## Naming Notes

- Public-facing product name: `S#!% We Need To Do`
- Common abbreviation: `SWNTD`
- Repository slug: `swntd`

## License

MIT. See [LICENSE](LICENSE).
