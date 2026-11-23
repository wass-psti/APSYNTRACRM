# CP-FUELTRANS-M7-02 — Ticket Numbering and Remaining Acceptance Record

**Date:** 2026-11-23
**Branch:** feat/fueltrans-m7-02-20261123
**Base:** M7-01 commit 1eb266c
**Implementation status:** IMPLEMENTED — VERIFIED IN DISPOSABLE ENVIRONMENT
**Production activation:** PENDING
**Final acceptance:** PENDING

## 1. Delivered

### Server-allocated ticket references

Implemented the requested client/year/sequence format:

- UNIOIL: \`UNI-YYYY-NNN\`
- ARAMCO: \`ARA-YYYY-NNN\`
- REPHIL: \`REP-YYYY-NNN\`
- PETRON: \`PET-YYYY-NNN\`

The sequence is maintained independently per client and Philippine calendar year. The sequence is minimum three digits and can grow beyond 999 without truncation.

The new migration \`20261123150000_cp_fueltrans_m7_ticket_number_allocator.sql\`:

- Adds a private counter keyed by client code and year.
- Uses one transactional upsert to serialize concurrent inserts for the same client/year.
- Keeps the counter increment in the same transaction as the ticket insert, so a rolled-back insert does not consume a number.
- Adds a unique index for nonblank ticket references.
- Seeds counters from existing matching client-prefixed references.
- Preserves historical identifiers that do not match the new format.
- Assigns the authoritative number before insert and synchronizes \`payload.ticketId\` and creation-activity metadata.
- Enables RLS on the new private counter table and revokes direct table/function access from API roles. Existing role assignments, existing RLS policies, and existing workflow permissions are unchanged.

The browser no longer invents a ticket number. It sends a null reference and uses the number returned by the database.

### Migration source integrity

Registered the new forward migration and SHA-256 digest in \`supabase/migration-source-manifest.json\`. The historical 222-migration recovery baseline was not rewritten.

## 2. Verification evidence

| Check | Result |
|---|---|
| Full repository test suite | 3,500 / 3,500 PASS |
| Production build | PASS |
| Package syntax check | PASS |
| ESLint | PASS |
| Migration source manifest | PASS — 222 baseline + 76 forward migrations |
| Git whitespace/diff check | PASS |
| Disposable PostgreSQL 17 migration application | PASS |
| Existing-reference high-water seeding | PASS |
| Legacy ticket-reference preservation | PASS |
| Internal counter RLS and API-role privilege checks | PASS |
| GoTrue/PostgREST acceptance | PASS — 76 HTTP checks |
| Concurrent ticket creation | PASS — 12 simultaneous UNIOIL writes, unique contiguous numbers |
| Transaction rollback | PASS — rolled-back insert did not consume a number |
| Client prefix and year-boundary tests | PASS |
| Two-account L1/L2 lifecycle and compare-and-swap | PASS |
| CP-FT-UI-08 browser acceptance | PASS |
| CP-FT-UI-09 browser and XLSX/PDF export acceptance | PASS |
| Responsive checks | PASS at 1200, 768, 540 and 390 px |

The disposable database seeded \`UNI-2026-037\` and \`ARA-2026-012\`; subsequent writes received \`UNI-2026-038\` and \`ARA-2026-013\`. The 12 concurrent UNIOIL writes received unique consecutive values. REPHIL tests confirmed the Philippine local-year rollover, and PETRON prefix allocation passed.

All GoTrue users, tickets, containers, and database state used by the integration test were disposable and removed after the run.

The build retains the repository's existing large PDF/application chunk warning. No package dependency was added.

## 3. Live CRM inspection and outstanding gates

The current CRM tab was inspected read-only. It has one authenticated CRM session and one directly assigned FuelTrans board member. The current workspace dashboard displayed zero tickets. No production ticket, user, role, membership, or credential was created or changed.

### A. Production activation — pending

The migration and frontend change are committed only in the local feature branch. The live Supabase migration ledger has not been changed, and the live app has not been deployed with the allocator. Production ticket numbering is therefore not yet certified.

A read-only live database check found one existing UNIOIL ticket with the legacy reference `FT-20261022-EF60F251`; no existing client-prefixed sequence references were present. That historical reference will be preserved. Unless a verified historical sequence baseline is supplied before activation, the first new 2026 UNIOIL reference will be `UNI-2026-001` (and the first ARAMCO reference will be `ARA-2026-001`). The specification's `UNI-2026-038` example is not treated as a confirmed high-water mark without matching historical records.

### B. Genuine CRM-host two-account acceptance — pending

The local GoTrue/PostgREST tests used independent reporter, L1, L2, administrator, and other-role sessions. The browser test's CRM host handshake was emulated. The current live CRM browser has only one authenticated account available, so a genuine second-account host handshake and simultaneous live CRM session acceptance cannot be certified yet.

### C. Call Center lifecycle capability — unchanged and pending

The existing database workflow-authority contract does not permit the Call Center fixture to claim and transition tickets. No trigger, policy, role, grant, or permission was changed to bypass that contract.

### D. Client Manager client-scoped analytics — unchanged and pending

The existing Client Manager viewer fixture receives no ticket rows under the current database client-scope contract. No new read path or role/data-access authority was added.

These two role-contract gaps remain outside the current functionality-only scope. They require explicit scope expansion before changing existing workflow authority or client data access.

## 4. Existing Supabase advisor baseline

A read-only advisor scan of the live APSYNTRACRM project reported existing project-wide findings, including:

- 3 anonymous-executable SECURITY DEFINER functions and 354 authenticated-executable SECURITY DEFINER functions.
- 9 functions with mutable search paths.
- Leaked-password protection disabled.
- 137 tables with RLS enabled but no policies (INFO findings).
- The table inspection also flagged private-schema tables with RLS disabled.

These are pre-existing project-wide findings, not changes introduced by this local M7 migration. No existing role, grant, policy, Auth setting, or unrelated table was modified. The new counter table itself has RLS enabled and no direct API-role privileges.

References:
- [RLS-enabled tables without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## 5. Inference-only constraint

No gradient descent, backpropagation, model training, retraining, fine-tuning, weight-update loop, or model-training dependency was introduced or executed. Existing inference-only behavior remains unchanged.

## 6. Acceptance verdict and next implementation

**M7-02 ticket numbering is locally verified, but M7-02 is not eligible for final production sign-off.** Production migration activation, genuine CRM-host two-account acceptance, and the two existing role-contract gaps remain outstanding.

**Measured M7-02 progress: 1 of 3 workstreams verified (33%).** This is a workstream checklist measure, not a production-readiness percentage.

Next logically scoped implementation:

**CP-FUELTRANS-M7-03 — Production Ticket Numbering Activation, Genuine CRM-Host Two-Account Acceptance, and Final Runtime Reconciliation.**

M7-03 should deploy the frontend and migration together through the repository's existing release path, verify the live migration ledger and actual ticket creation, and complete the two-account host walkthrough when a second genuine test account is available. Call Center and Client Manager authority changes remain deferred unless explicitly authorized.
