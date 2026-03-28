# Shadcn UI Refresh Plan

## Goal

Adopt `shadcn/ui` in the web app on a dedicated branch, using preset `b7BrBnhIm`, without destabilizing the existing product behavior.

## Constraints

- Keep the work isolated to `feat/shadcn-ui-refresh` until the refreshed UI is ready for review.
- Preserve current app behavior while changing the presentation layer.
- Treat the first step as foundation work only: install and configure the design system, confirm the build stays healthy, and avoid large screen rewrites in the same commit.
- Keep SWNTD visually distinctive. `shadcn/ui` should provide primitives and theme structure, not flatten the app into a generic dashboard.

## Phase 1: Safe Foundation

Status: complete

- Initialize `shadcn/ui` in `apps/web` using preset `b7BrBnhIm`.
- Add any required Tailwind, alias, config, and generated support files.
- Keep the existing app screens in place.
- Verify:
  - `pnpm --filter @swntd/web typecheck`
  - `pnpm --filter @swntd/web lint`
  - `pnpm --filter @swntd/web test`
  - `pnpm --filter @swntd/web build`

## Phase 2: Shell Migration

Status: initial pass complete

- Migrate the app shell first:
  - masthead
  - navigation
  - notice/error banners
  - shared buttons, cards, panels, inputs
- Introduce a small local component structure so `App.tsx` can start shrinking.
- Keep existing copy and flows stable.

## Phase 3: Core Screen Migration

Status: mostly complete, with the task sheet, settings forms, section headers, empty states, and selection controls migrated to shared `shadcn`-backed components

- Move the board, task list, task sheet, and settings UI onto `shadcn` primitives.
- Prefer `Card`, `Button`, `Badge`, `Sheet`, `Tabs`, `Input`, `Textarea`, `Select`, `Checkbox`, `Alert`, and related primitives.
- Preserve touch-friendly flows and mobile-first behavior.

## Phase 4: Visual Polish

Status: in progress, with the display typography, card states, and metadata pills starting to align with the story-forward theme

- Reintroduce the story-forward visual identity intentionally:
  - typography
  - spacing rhythm
  - color tokens
  - background treatment
  - subtle texture and motion
- Remove leftover CSS that no longer serves the new system.

## Risks

- `shadcn` setup may expect aliases or Tailwind configuration that the current Vite app does not yet have.
- A full migration could easily turn into a large UI rewrite with noisy diffs if we do not stage it carefully.
- Overusing stock primitives could make the app feel more generic instead of more polished.

## Mitigations

- Keep the setup commit separate from the visual refactor commits.
- Favor incremental component extraction over a one-shot rewrite.
- Keep validation green after each milestone.
- Preserve a small amount of custom styling where it reinforces SWNTD’s identity.
