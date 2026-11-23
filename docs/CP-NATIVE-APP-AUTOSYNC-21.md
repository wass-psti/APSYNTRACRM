# CP-NATIVE-APP-AUTOSYNC-21 — Genuine signed writer readiness and reversible acceptance gate

## Engineering recommendation and disposition

**IMPLEMENTED / VERIFIED:** A read-only, executable acceptance preflight now checks the original canonical workspace role writer's immutable audit dependency, available registered module contracts and the prerequisites for three genuinely signed users to write and read against **one isolated database**. The readiness result is BLOCKED, correctly, because these prerequisites are not all present. It does not modify Auth, workspaces, module roles, audit entries, sessions, permissions, or live staging/production.

**BLOCKED:** The approved CP20 standalone PostgreSQL owner-preserving schema clone has no connected GoTrue HTTP runtime or verified new-module writer/reader. Three real signed users on that same backend, signed writer-to-reader acceptance, and final restoration are not established.

## Why the nonproduction source database must not be used for a destructive acceptance shortcut

Read-only live inspection of the existing disposable local CRM database verifies:

- The original `public.wm_application_role_audit` table has a `wm_application_audit_immutable` BEFORE UPDATE/DELETE trigger.
- Its original `public.wm_reject_application_audit_mutation()` function rejects historical changes with SQLSTATE 42501.
- Therefore actual canonical role writes directly to the shared developer database would generate persistent audit rows. Simply removing temporary QA Auth users afterward **would not restore that source database to its initial state**, and bypassing or disabling the audit trigger would weaken the original backend contract.

CP18 genuine signed local GoTrue sessions and CP17's original canonical SQL writer remain individually verified **but are not a joined end-to-end result**. CP21 explicitly does not combine unrelated tokens with synthetic SQL claims.

## CP21 implementation

`scripts/cp-native-app-autosync-21-signed-readiness.mjs` reads the existing local nonproduction database's actual audit trigger/function and active board-backed registration metadata. It uses CP20's registration-contract parser and compares requirements without writing data.

`assessSignedWriterReadiness` requires all of these to proceed: a recognized nonproduction backend, the original append-only audit contract, a genuinely new registered module with an explicitly verified domain role writer/reader, a disposable target, a confirmed same-database GoTrue/writer connection, **exactly three independently signed subjects**, and functioning signed writer and reader. It cannot silently promote a UI module label or an old predefined module into a new registration. It does not introduce a new global authorization gate in the application; this is an acceptance-only safeguard.

Observed result:
- `CP21_APPEND_ONLY_AUDIT=VERIFIED`
- `CP21_REGISTRATION_STATUS=BLOCKED`
- `CP21_SIGNED_WRITER_STATUS=BLOCKED`
- The blockers are missing new-module registration, disposable same-backend Auth/writer runtime, three signed identities on that backend, and its signed writer/reader pair.

The local owner-preserving CP20 runner was also re-invoked during CP21; that attempt exited nonzero without diagnostic output. Cleanup of the temporary container and lock was verified. **This invocation is NOT a passing rerun of CP20** and requires renewed diagnosis if isolation work resumes. CP20's earlier independent success remains historical evidence, not a substitute for a fresh passing run.

## No-training implementation constraint

The CP21 change introduces no dependencies, gradient descent, backpropagation, fine-tuning, retraining, model-training loops, gradient optimizers, or weight-update code. It does not alter the frontend inference architecture. Focused source assertions explicitly cover known training API patterns. No model training was executed.

## Measurable final acceptance remaining

1. Get the standalone owner-preserving schema clone to pass **again**, including reliable failure diagnostics and cleanup.
2. Start compatible GoTrue and the canonical Data API against that same isolated clone without changing shared production/nonproduction roles or credentials.
3. Obtain three independent legitimate sign-ins and revalidate the signed identities on that isolated backend.
4. Provision/select a real registered new application with an approved role vocabulary, explicit server-side writer and authoritative reader. Do not invent a role or bypass the existing writer policy.
5. Execute signed administrator individual and two-member batch assignments, independent readback/audit, non-admin denial, revocation and exact cleanup; confirm original source DB and temporary isolated environment are restored.
6. Pass full regression, build, CI and documented release checks before removing draft status.

No new Supabase project or application authorization restrictions are required.

## Next solid implementation if blocked

**CP-NATIVE-APP-AUTOSYNC-22 — Deterministic Owner-Clone Diagnostics, Supported Disposable GoTrue/Data API Integration, and Registered-Module Signed Acceptance.**

Focus first on reproducible clone restoration diagnostics and exact staged Auth runtime compatibility; then onboard a *real* registered module contract and test signed role writes against one disposable database. Keep PR #760 draft until the signed acceptance and recovery evidence are complete.
