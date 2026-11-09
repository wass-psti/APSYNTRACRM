# APSYNTRA CRM — startup deadlock recovery

## Incident observations (2026-11-09)

- The affected connected browser tab rendered only the static index.html
  overlay with its unadvanced status Preparing frontend.
- A separate fresh Chromium runtime loaded the deployed application and
  rendered unauthenticated sign-in without any JavaScript exceptions.
  This rules out a universal backend or deployment outage; the exact failed
  resource or browser-cache condition in the affected tab could not be
  inspected from page text alone.
- Reproduction: when an imported entry dependency is blocked,
  frontend/app.js does not evaluate and boot() never runs. Previously
  finishInitialization() existed exclusively inside its finally block;
  the static overlay therefore persisted with no fallback.
- Secondary defect: AuthClient.restore() treated transient network failures,
  HTTP 5xx and timeouts the same as revoked or malformed authentication,
  erasing legitimate stored credentials. The initial workspace-load catch
  also signed out on all non-403 exceptions.

## Corrective implementation

frontend/startup-guard.js is a self-contained classic script that executes
before the ESM entry graph. It has no access to stored sessions or privileged
backend APIs. It records one of the states INITIALIZING, AUTHENTICATED,
UNAUTHENTICATED, RECOVERABLE_ERROR and FATAL_ERROR. When module loading
fails, it offers an accessible recovery control rather than an endless WebGL
overlay. Its bounded entry (12 s) and initial execution (75 s) watchdogs are
error ceilings, not loading delays; successful application initialization
closes the overlay immediately.

frontend/session.js bounds complete provider requests, including JSON-body
reads, to 12 s, with abort and a terminal timeout. Invalid responses, revoked
tokens and mismatched signed identities still clear authentication. Temporary
transport failures, rate limits and server outages preserve the signed session
for an explicit same-page retry. No invalid JWT is interpreted as workspace
authority.

frontend/app.js handles unavailable workspace APIs without implicit
signOut, clears unverified workspace context, renders an accessible
Retry connection action, and re-executes the same signed Auth + workspace
gate on retry. Login, Board, role and workspace contracts are unchanged.
A successful onRoute() only establishes AUTHENTICATED after verifying the
current signed actor still matches the authoritative workspace. All other
application modules remain untouched.

## Verification

- node --test frontend/tests/*.test.mjs
- node scripts/verify-pages-source.mjs
- node --check frontend/app.js
- node --check frontend/session.js
- node --check frontend/startup-guard.js
- In Chromium with only synthetic Auth and workspace responses, confirmed
  fresh unauthenticated launch, valid session restoration, interrupted
  Auth retrieval, same-page recovery into Overview and navigation to Boards,
  confirmed token expiry, denied workspace, and entry-module failure.
  Local asset/intercepted backend fixtures never used real user tokens,
  never wrote live Supabase rows, and created no persistent browser profiles.

## Follow-up and constraints

- A tab already stuck on the old static overlay must reload once to obtain
  the new independent startup guard. Future module-loading failures will
  present the recovery panel instead of trapping that tab.
- Real signed-user startup and role-specific Board access require user-side
  interaction. Synthetic browser acceptance is not a production signed-user
  acceptance certificate.
- A module import failure necessarily requires a user-initiated retry of
  the page, because failed static ESM evaluation cannot safely reinitialize
  the loaded module graph in place. API failures recover within the same
  document without reloading or clearing valid auth.
