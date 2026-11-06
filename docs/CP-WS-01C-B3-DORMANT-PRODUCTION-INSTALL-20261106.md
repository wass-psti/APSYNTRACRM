# CP-WS-01C/B3 — Authorized production default-OFF function installation

**Execution date:** November 6, 2026 (Asia/Manila)  
**Project:** existing `WatchdogWorkspace` Supabase project `jtlusodorfnyzgyuewkz` / PostgreSQL 17.6.  
**Authorization:** Operator explicitly authorized **only** installing the reviewed dormant workspace-creation functions with **no authenticated EXECUTE, no lifecycle activation and no production workspace creation**.  
**Final status:** **INSTALLED AND VERIFIED, DEFAULT-OFF.** This **does not** authorize production creation activation, additional role grants, creating a real workspace, B4 switching, or changing current membership.

## Source lock and deployment

- Reviewed source: `sql/cp-ws01c-b3-create-contract-candidate.sql` at immutable Git commit `83833f0850de697fc5413e2399ccfe32a661eaa0`, Git blob `1f4be2182c29d21e5895eb9c31ff7fcee900b310`.
- The source defines exactly two functions: `private.ws01_signed_actor_session()` and `public.wm_ws01_create(text,text,uuid)`. Both are `SECURITY DEFINER` with an empty locked search path; both explicitly REVOKE EXECUTE from PUBLIC, anon and authenticated.
- The source's outer `BEGIN;`/`COMMIT;` delimiters were removed for the Supabase migration executor's own atomic transaction. Function bodies and their access-control logic were otherwise unchanged. A same-transaction post-install assertion verifies function presence, default-off flags, absence of client grants, the locked search paths, absent B4 switching and zero request/audit writes.
- Applied with the connected Supabase **migration** operation, not a detached SQL statement. Durable migration history: **`20261106090007_cp_ws01c_b3_dormant_signed_create_contract_20261106`**.
- **Recovery note:** The first migration call failed an added verification assertion because PostgreSQL stores the empty path as `search_path=""`, not `search_path=`. PostgreSQL rolled back both function creations; follow-up queries confirmed both remained absent, flags OFF, workspaces 2, memberships 40 and zero request/event rows. The corrected assertion was independently checked against existing locked functions before retry. The second migration **succeeded**.
- Function source MD5 from production `pg_get_functiondef`: `private.ws01_signed_actor_session()` **`25a49e8acb1429110456c4de2211691e`**; `public.wm_ws01_create(text,text,uuid)` **`63395e8cb451560b16fd2ccb07a8d20c`**. These represent installed PostgreSQL 17.6 formatting, not interchangeable with the Git blob SHA.

## Independent production post-install verification

Executed the exact committed **read-only** `sql/tests/cp-ws01c-b3-dormant-production-postinstall-readonly.sql` in the existing project. It returned:

```text
B3_DORMANT_SIGNED_CREATE_CONTRACT_INSTALLED__NO_CLIENT_EXECUTE_NO_CREATION
dormant_functions_secured = true
private_workspace_tables_default_deny = true
no_private_client_rls_policies = true
creation_and_switch_off = true
b4_absent = true
existing_member_discovery_preserved = true
direct_workspace_writes_denied = true
create_requests = 0
lifecycle_events = 0
existing_workspaces = 2
active_memberships = 40
```

Additional independent catalog evidence:
- Both functions owned by `postgres`, `prosecdef=true`, `proconfig=["search_path=\\"\\""]`, `proacl={postgres=X/postgres}`. Explicit effective EXECUTE: **anon=false**, **authenticated=false**, **PUBLIC=false** for both.
- All six private workspace lifecycle tables remained RLS enabled, with no direct anonymous or authenticated access grants or client RLS policies.
- Original `public.wm_ws01_list()` remains accessible to authenticated signed users and denied to anonymous callers.
- `public.wm_ws01_select(uuid,uuid)` remains absent, and the existing signed actor's workspace is unaffected.
- No new workspace, member, creation-request or lifecycle-event records were inserted by this deployment.

**Security advisor recheck:** The Supabase security linter was queried after migration. It found no findings specifically referencing either new B3 function; existing project-wide findings are outside this narrowly authorized gate. An advisor result does not substitute for direct ACL and RLS verification.

## Status and next gate

| Requirement | Status |
| --- | --- |
| Reviewed two-function dormant migration | **VERIFIED** |
| Production install, migration history and source lock | **VERIFIED** |
| Default-off feature flags and no client grants | **VERIFIED** |
| Schema RLS, no direct INSERT and no B4 switching | **VERIFIED** |
| Live creation RPC callable by an authenticated user | **BLOCKED intentionally** |
| Authenticated EXECUTE + `creation_enabled=true` | **PENDING separately authorized activation** |
| Verified real signed creation, isolation, idempotency, audit, recovery | **PENDING** |
| Production per-user workspace feature / other workspace security gates | **NOT certified by dormant install** |

**Next required gate:** `CP-WS-01C/B3 — Controlled Authenticated Creation Grant + Feature-Flag Activation and Genuine Signed-User Acceptance`. This is a **different** production authorization decision because it widens database permissions and enables creation of real workspace and membership records. Review the existing activation/disable candidate scripts and test isolation, role ceiling, rollback and concurrency before proceeding. Do not automatically activate.

**Rollback boundary:** Because neither client role can call the installed functions and creation remains OFF, no emergency rollback is required to preserve the present behavior. Any later function removal or activation/disable DDL must be separately reviewed and authorized. Preserve migration history, event integrity and existing workspace records.
