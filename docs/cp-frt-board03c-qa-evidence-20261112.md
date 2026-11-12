# CP-FRT-BOARD-03C — Signed request persistence QA evidence

## Scope and evidence classification

Production preflight (read-only): zero `frt_requests`, zero FRT mirror-board items, zero date/person correction audit rows; both atomic FRT RPCs are installed and anonymous person assignment is denied. No production test request has been created or changed.

`sql/tests/cp-frt-board03c-signed-refresh-isolation-disposable.sql` executes the existing **synthetic signed PostgreSQL role simulation** in an isolated PostgreSQL 17 container. It checks the request is present in the signed safe list, edits the date with server CAS, assigns an active workspace person with server CAS, re-establishes the signed request context and independently rereads the restricted request, safe list, and assignment. It tests stale date/person writes, cross-workspace reads/writes, foreign actor denials, restores the date, clears the assignment, validates final rereads and exactly two audit entries for each operation, and rolls back all changes. It must not be represented as a genuine GoTrue-authenticated browser round-trip.

## Missing final live-acceptance proof

The currently connected browser session cannot be controlled from this chat (Browser connector access is restricted to the originating browser context). Production contains no FRT requests and therefore offers no safe row for a genuine signed-user acceptance run. Consequently the following remain **PENDING**, not failed: genuine signed GoTrue request edit; browser reload and reopen persistence; actual second workspace session denied; and deterministic cleanup of a designated non-business QA request.

## Future final closeout

Use an **authorized disposable non-business FRT request** under the existing workspace and an existing finance editor. Through a genuine signed session: read the request, change date and assignee, reload and reopen; compare exact values and audit; repeat a stale CAS attempt and a foreign-workspace attempt; revert both fields; archive/delete the QA fixture only after confirming no dependent records. Do not create new roles, projects or test users, and do not touch business financial requests merely to manufacture acceptance evidence.

## Security and operational constraints

No new grants, roles, RLS, migrations, storage policies, background monitors or production business writes. The test uses the already-installed role and workspace contracts. A local disposable SQL role simulation alone cannot prove real browser session issuance or cookie behavior.
