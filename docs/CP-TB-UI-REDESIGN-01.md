# CP-TB-UI-REDESIGN-01 — Native TalkBox Meeting Workspace Visual Redesign

Date: 2026-11-21 (Asia/Manila). Target: APSYNTRA CRM's existing native TalkBox application. Base: `origin/main` at `e9336b1a`.

## Reconciled design direction

The earlier TalkBox design direction calls for a meeting-first workflow rather than a generic records database: navy enterprise header, restrained cobalt and amber accents, `Enter Meeting`, date-labeled Meeting Sheet, central issues log, issue click-through, and a contextual right-side drawer with assignees, discussion, file attachments, tracked time and subtasks. The original screenshot was not available as a pixel-level reference; these documented behavior and visual motifs governed this iteration.

## Implemented in the existing native frontend

- Replaced the bare header and flat issue list with a gradient navy meeting header, cohesive branding, clear entry into meeting mode, a date picker, breadcrumb/status bar, balanced metric cards and a richer issue log.
- `Enter Meeting`/`Meeting overview` use transient client presentation state scoped to the signed TalkBox board. The selected meeting date is deliberately labeled **presentation-only**, not a persisted meeting record. Real issue rows and server-side signed list/search/status filters continue using the existing native RPCs; no false meeting history is written.
- The Meeting Sheet offers version-checked inline status changes through the existing `TalkBoxNativeClient.updateVerified(...)` operation. The existing `state.edit` check remains, and read-only sessions see static status pills. Other status/version conflicts and transport errors retain existing feedback/reconciliation behavior.
- The native detail drawer has clearer status, target date, assigned users, tracked time, discussions/replies, attachments, and subtasks. Existing delegated `data-action` names remain unchanged.
- Responsive CSS scoped to `.tb-app`: desktop/tablet/phone layouts, contained horizontal table scroll, touch-friendly controls, meaningful focus outlines and reduced-motion support. Existing CSS aggregation is regenerated through `scripts/build-priority5-styles.mjs`, with no new dependency.

## Verification evidence

- Focused TalkBox tests: **72/72 PASS** (including 6 new visual/interaction tests).
- Full frontend tests: **3186/3186 PASS**.
- `npm run build`, `npm run lint`, focused ESLint on changed JS, `npm run format:check`, and stylesheet bundle check: **PASS**.
- Browser rendering and control acceptance using real Chromium at **1440×900 desktop**, **820×1000 tablet**, and **390×844 phone**: **PASS**. Checked Enter Meeting, issue row, contained page width and no page-level horizontal overflow. Open detail drawer checked for discussion, timer, file and subtask controls; Meeting Sheet inline select is interactive in browser fixture.
- Saved screenshots for internal review are on the authorized Mac at `/tmp/cp-tb-ui-redesign-01-{desktop,tablet,phone,drawer}.png`. These are local fixture visual checks, not screenshots of production signed data.
- Prior CP-TB-FUNCTIONAL-CLOSEOUT-01 production signed readbacks independently verified existing RPC features, but do not themselves prove this new CSS and markup is deployed. Require GitHub Pages success and post-merge production readback.

## Changes and scope boundaries

`frontend/talkbox-ui.js`, `frontend/talkbox-application.css`, generated `frontend/apsyntra-styles.bundle.css`, `frontend/app.js`, focused tests and browser fixture script. No permission/RLS changes, database migrations, new app framework, Supabase project, credentials, destructive operational tests, or unrelated rewrites.

## Outstanding parity limitation

The original meeting-sheet concepts of **durably persisted separate meeting records, per-date attendance/issue association, carry-over, and meeting reports** are not provided by the currently deployed issue-only native RPC contract and were **not falsely implemented** as local-storage replicas. This milestone implements the visible meeting workspace shell and real issue interactions; complete meeting-specific data parity requires a separate scoped functional implementation and acceptance. Two-account QA is independent of this visual redesign and should not block it.
