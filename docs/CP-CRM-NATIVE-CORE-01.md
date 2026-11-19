# CP-CRM-NATIVE-CORE-01 — Four-Application Native Runtime Recovery Stabilization

**Date:** November 20, 2026 (Asia/Manila)
**Scope:** TimeTracker, Fund Tracker, FuelTrack+, TradeLink only. The other eight Board-linked modules are outside this initiative and are not claimed as native implementations.

## Root-cause findings and corrections

1. **Transient workspace-context failure detached Board synchronization prematurely.** In `refreshWorkspace()`, the app stopped `boardCacheChannel` and invalidated the Board cache before `db.context()` resolved. If that authoritative read failed temporarily, startup recovery preserved the existing signed session, but it had already torn down the current Board synchronization and cache. The correction defers the cache/sync rotation until **after** a successful signed context read, before applying the new context and existing identity/workspace state resets. No credentials, claims, or Board data are trusted without server verification.
2. **Native Board-catalog fallback over-accepted failures.** The four standalone routes may initialize through the independent signed `native_application_board_context` resolver when the generic Board list is temporarily unavailable. However, the prior `allowBoardListFailure` option also suppressed confirmed 401, 403, 404, 409, and other nontransient failures, presenting them as transient catalog outages. The corrected fallback accepts only bounded HTTP transient conditions (408, 429, 5xx) or network/timeout failures, while definitive 4xx denials always propagate even if accompanied by a network error code. Existing module-scoped native resolution remains mandatory.

No new authentication restrictions, access grants, permissions, RLS policies, database migrations, native Board changes, or business workflow changes were introduced.

## Acceptance and evidence

- Focused tests exercise recoverable 408/429/5xx and network/timeouts; confirmed 401/403/404/409/422 and invalid context are not suppressed; a changed signed workspace remains rejected.
- Regression assertion confirms the authoritative context read must resolve before cache/sync teardown, and that synchronization restarts under the resolved identity/workspace.
- Native application Board normalization, route ownership, signed user/workspace/Board invariants, and existing four-module contracts continue to be checked.
- Full frontend suite, build, and GitHub CI/deployment evidence should be recorded after merge.
- The connected Chromium QA profile currently displays **Sign in**; therefore this milestone cannot claim a newly completed genuine signed-user production cold-start or cross-account access test.

## Closeout boundary

The two reproducible recovery defects are corrected and testable. The native application runtime is **not universally certified** until a genuinely signed employee can exercise the four native routes with their module read APIs, refresh/reopen, and workspace switching through the deployed version. If local/build/CI checks pass, close the code implementation and retain a **runtime acceptance blocker** rather than inventing production verification.

## CI dependency portability correction

During PR validation, jobs that intentionally omit development/browser dependencies failed when importing the older FINAL-02 and FINAL-04 read-only QA scripts into Node unit tests: both eagerly imported optional `playwright` at module load. The scripts now dynamically import Playwright **only inside their CLI execution path**. Their exported pure helpers can be tested without a browser dependency, and genuine browser execution still requires the existing local Playwright installation and authenticated Chromium. No new dependency, bypass, or functional behavior was introduced. A focused regression prevents reintroducing eager browser imports.
