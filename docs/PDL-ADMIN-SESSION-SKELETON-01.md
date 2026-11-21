# PDL-ADMIN-SESSION-SKELETON-01 — Session Verification Skeleton

## Problem

The administrator gate previously blocked the entire administration workspace with a standalone `Checking administrator session…` string. The Paseo app's existing structure is a shared header/footer, green page hero, operating notice, horizontal administration navigation and route-specific summary/cards/forms; it does **not** use a sidebar.

## Implemented

- Replace the gate's `checking` screen with the `AdminSessionSkeleton` component, rendered immediately while the existing asynchronous `GET /v1/admin/session` request continues.
- Match the real administration hero, banner, horizontal navigation and content panel geometry. Choose a route-specific title and layout, including summaries, booking lists, settings forms, calendar inputs and three image/configuration cards for Payments.
- Reuse the existing site header/footer from `SiteLayout`. Do not invent a duplicate header, sidebar, functional buttons, or session data.
- Use semantic `role=status`, `aria-busy=true`, a screen-reader progress description, decorative `aria-hidden` placeholders and CSS shimmer disabled for reduced-motion preferences. All placeholder controls remain noninteractive.
- On a successful server session check, render the existing application unchanged. A 401/403 still navigates to `/admin/sign-in`. A transient network/503 failure retains the existing retry option and does not clear the session. Aborted requests remain ignored.
- No new tokens, roles, RLS changes, database writes, backend endpoints, runtime dependencies or authority restrictions.

## Tests and acceptance

- Native build, contract tests and isolated Chromium browser acceptance include a deliberately deferred administrator session request. Confirm skeleton visible while pending, correct page heading and navigation placeholders, no interactive save control, no horizontal overflow, and transition to real loaded settings at 390px and 1440px.
- Verify a deferred 401 on the Payments route displays three placeholder payment cards, then redirects to the existing sign-in page, with no transient customer/admin data exposure.
- Preserve existing browser tests for seven module navigation, return/refresh, readback, booking/QR workflows and temporary session failure/retry.
- Styling is scoped to `.pdl-session-*`; other CRM modules remain untouched.

## Scope of certification

Synthetic delayed-session and production-build acceptance confirms frontend behavior. Real administrator sessions and backend enforcement are unchanged; no independent production role or payment workflow is asserted by this UI-only milestone.
