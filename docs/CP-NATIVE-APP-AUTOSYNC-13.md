# CP-NATIVE-APP-AUTOSYNC-13 — Staging constraint fidelity and signed three-profile preflight

## Disposition

IMPLEMENTED / LOCAL CLONE AND CI VERIFIED. LIVE SIGNED THREE-PROFILE QA AND NEW-MODULE WRITER BLOCKED.

## Grounded staging discrepancy corrected

The existing staging public.profiles status CHECK allows exactly active and disabled. CP11's temporary compatibility fixture incorrectly used inactive without a status CHECK, which could yield a misleading positive rehearsal. CP13 replaces the synthetic inactive value with disabled, adds the actual status CHECK, and adds the CRM foundation platform_role CHECK (admin_general_manager, hr, supervisor, employee). The test is still a local temporary table with ROLLBACK. **No production or staging profile was altered.**

Staging also differs from the local CRM on certain foreign key actions; a complete migration must still reconcile all real schemas and preserve invitation/workspace functions. This temporary-table fixture is not a full staging schema clone.

## Delivered test capability

- scripts/cp-native-app-autosync-13-signed-preflight.mjs: read-only browser network observer for three distinct loopback Chromium CDP endpoints targeting a supplied approved HTTPS staging application origin. It requires Auth user HTTP 200 responses from the **staging** Supabase project and authoritative workspace context from the same project, distinct signed Auth subjects, a shared workspace, active profile states and exactly one recognized administrator.
- Reports only hashed subject/workspace identifiers. No credentials, tokens, cookies, service-role keys, Auth data writes or role changes are collected or performed.
- frontend/tests/cp-native-app-autosync-13.test.mjs: verifies staging status/role constraint fidelity, strict temporary-table bounds, three independent signed accounts, cross-workspace or duplicate rejection, absent signed Auth rejection and local CDP input validation.
- scripts/cp-native-app-autosync-10-disposable-clone.sh already runs the corrected CP11 temporary compatibility SQL; direct isolated rerun PASSED database restoration, registration lifecycle, synthetic member write/readback, invalid module rejection and exact cleanup.

## Nonproduction reality

- The existing staging branch apsyntra-invites-staging has two Auth users, two workspace members, no tracked migration history and lacks canonical Boards, role assignment and signed role snapshot/catalog backend.
- No three independent signed browser CDP endpoints were accessible on the authorized Mac when inspected. Consequently **the three-user acceptance script has not passed against live signed staging sessions**.
- The newly registered application has no verified module ID plus specific role vocabulary/server writer/authoritative reader; the existing generic writer must not be fabricated or broadened to arbitrary module IDs.
- No attempt was made to install migrations over the incomplete live staging database, provision production-like identities, change permissions or bypass the existing authentication model.

## Remaining functional gates

1. Reconcile staging's existing workspace/invitation schema against the CRM baseline in a faithful isolated clone, including foreign keys, constraints, triggers, backend function dependencies and migration ledger.
2. Activate only the reviewed, compatible backend in nonproduction and verify its signed access routines.
3. Establish a genuinely authenticated nonproduction administrator plus two members on independent browser sessions and run CP13 preflight.
4. Identify the particular new module's role vocabulary and implement/test its real backend writer and signed readback, without inventing defaults.
5. Record initial assignments; test actual individual/bulk writes, independent session reload/reconnect readback, concurrency/denials and restoration.
6. Review full PR CI, production migration/deployment and sign off only on actual evidence.

## Next implementation if blocked

CP-NATIVE-APP-AUTOSYNC-14 — Staging-Schema Fidelity Recovery and Genuine Signed Three-Profile Backend Activation with Module-Writer Acceptance.

Draft PR #760 remains unmerged. Production remains unchanged.
