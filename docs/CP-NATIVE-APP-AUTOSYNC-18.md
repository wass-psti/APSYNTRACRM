# CP-NATIVE-APP-AUTOSYNC-18 — Genuine local signed QA, staging Auth migration fidelity and module-writer readiness

## Disposition

**IMPLEMENTED AND VERIFIED LOCALLY:** three independently authenticated GoTrue QA subjects using the existing isolated disposable-local Supabase Auth service; invalid-password rejection; bearer /user identity readback; deletion/revocation check; authoritative cleanup and source database count preservation.

**BLOCKED:** GoTrue against the faithful *existing staging schema clone*, three signed users in the real staging project, canonical staging CRM backend activation, a specific newly registered module's actual domain writer/reader, signed application-level persistence and production release.

This is functionality-first and adds no new authorization restrictions, production roles, remote identities, permissions or staging/production data. No new Supabase project is created.

## Grounded Auth migration fingerprint

Read-only inspection on November 22, 2026:

- Existing staging Auth has **84** applied migration identifiers, from 00 through 20261030120000. Its ordered version-list MD5 is **89b5e505220d565bc38e8092af7b6c0f**.
- Existing installed local GoTrue v2.197.0 has **82** migration identifiers, ending 20260831180000.
- Exactly two newer staging identifiers are 20260911120000 and 20261030120000. Taking the *local 82 plus those two* yields precisely the staging 84-version checksum.
- Read-only SQL acceptance is in sql/acceptance/cp-native-app-autosync-18-auth-migration-ledger.sql. It is not a migration and writes no records.

An experimental separate GoTrue runtime was pointed only to the CP15 faithful schema clone. Its isolated Auth role could read the reconstructed 84-version ledger, but startup still failed in 00_init_auth_schema.up.sql with **SQLSTATE 42501**. Schema ownership and managed Auth migration behavior are not fully reproduced by the ownership-neutral clone. Repeated attempts were stopped; no bypass of GoTrue verification, fake tokens, skipped Auth checks or transplanting of persistent Auth accounts was accepted. The unsuccessful experimental runner is not shipped. The disposable Auth container/clone were destroyed.

**Therefore a checksum match alone is not equivalent to a working staging-compatible GoTrue runtime.**

## Real three-session nonproduction Auth acceptance

Run on the authorized developer Mac only:

    python3 scripts/cp-native-app-autosync-18-local-signed-qa.py --local-disposable

The script identifies the *existing* disposable CLI project from Docker's verified com.supabase.cli.project/workdir labels, checks the known loopback Auth gateway, reads only the local anonymous API key from the CLI environment, and asserts the read-only Auth migration fingerprint. It **never** uses the service-role key and never contacts the connected staging or production Supabase project.

For three separately generated random QA email addresses/passwords, it invokes real GoTrue HTTP registration, password sign-in, and authenticated /user identity readback; it rejects duplicate subjects and checks invalid-password denial. It then removes **only those exact random temporary QA accounts** (and their synthetic profiles) from the disposable *local* Auth database in a transaction. Final readback verifies the counts for Auth users, sessions, profiles, workspace members, canonical app roles and application audit are unchanged. An authenticated /user read after deletion must not resolve the deleted QA identity. User IDs, emails, passwords, keys and tokens are not logged or committed.

Observed local acceptance:
- Three distinct GoTrue sign-ins with bearer /user HTTP 200 and matching authenticated subjects: **PASS**
- Invalid password denied: **PASS**
- Three QA accounts persisted temporarily in disposable local Auth: **PASS**
- All three accounts removed and auth.users restored to **12**: **PASS**
- No CP18 QA accounts remain; source sessions, profiles, workspace memberships, roles and audit counts restored: **PASS**
- Deleted user's old token fails /user identity resolution: **PASS**

The preceding CP17 PostgreSQL acceptance remains separate and valid: real staging-schema clone, original CRM writer, two members and two established applications, persistent readback/audit and denial/rollback. **It used synthetic SQL request claims, not these real local GoTrue sessions.**

## Newly registered application acceptance

The existing staging branch still lacks the work_boards catalog and native registry RPC; the inspected local source has no board-backed registered module descriptors in the native module registry, and no verified *newly registered* module ID with a declared role vocabulary, server assignment writer and authoritative reader was found. Creating an arbitrary module label or letting the generic legacy writer accept any role would be misleading and potentially unsafe. No new-module writer is activated by CP18.

## Live staging and release limitations

Live staging still has two genuine Auth users, two memberships and zero tracked CRM migrations, without its canonical Boards/workspace role writer, role snapshot or application catalog RPC. There are no three independent staging Auth sessions or signed user-role writes; local GoTrue acceptance is **not** remote staging acceptance. Existing staging invitation/workspace structures must remain intact.

Keep draft PR #760 unmerged; production deployment is not certified.

## Next solid implementation if blocked

**CP-NATIVE-APP-AUTOSYNC-19 — Isolated Staging Auth Ownership/GoTrue Migration Compatibility, Named Registered-Module Contract Provisioning, and Genuine Signed Role-Writer Acceptance.**

Recover the exact staging Auth ownership/migration runtime contract in a disposable environment without touching live users, then use a concrete registered module ID, role vocabulary and existing server writer to perform an authenticated administrator-plus-two-member assignment, independent signed readback, denial and exact restoration. Do not treat the local signed QA harness and CP17's synthetic SQL fixtures as a joined end-to-end test until they actually execute together against one backend.
