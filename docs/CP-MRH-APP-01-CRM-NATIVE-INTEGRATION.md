# Material Request Hub — Dedicated APSYNTRA CRM Application

**Source supplied:** `Material-Request-Hub-Standalone(2).zip`, application v0.1.0 (React 18/Vite frontend, local Node `/api` and JSON persistence).  
**CRM target:** `wass-psti/APSYNTRACRM` existing authenticated workspace, branch `feat/material-request-hub-crm-native-20261119`.  
**Route:** `#/material-request-hub` (Overview defaults).  
**Scope:** Source-informed native CRM frontend and existing Supabase Material Request Hub RPC adapter. No new server, user, database, RLS, table, migration or production records.

## Source-to-CRM capability mapping

| Standalone source | CRM integration |
| --- | --- |
| Overview / dashboard | Signed `material_request_hub_aggregates` (total requests, pending/approved/rejected, source counts); no synthetic metrics |
| New Request | Existing `material_request_hub_create_request` with request title, request type, source inventory, invoice type, quantity and remarks |
| All Requests | Existing `material_request_hub_list_requests`; paginated signed search and exact `material_request_hub_get_request` detail |
| Edit Request | Existing `material_request_hub_update_request` with expected request version |
| Approvals | Signed pending queue and existing role-restricted `material_request_hub_approve_request` / `material_request_hub_reject_request` |
| Release | Signed approved queue and `material_request_hub_release_request`, refusing already-released records |
| Detail / remarks | Signed exact record read with metadata, subitems, discussion, attachment metadata |
| Discussion | Existing `material_request_hub_add_update` RPC, capability-restricted |
| File upload/preview/download | **Not activated**. The ZIP used insecure local-file storage and demo identity; production private Storage transfer needs separate signed verification. |
| Refresh/polling | Explicit signed refresh and next-page navigation. Background polling not enabled: avoid duplicated refresh/mutation risks. |
| Material Sourcing | Existing separate Board data source `617c4c0f-e343-4b3b-8456-50d47dcbaf99`; conditional link only when the Board appears in the authorized catalog. No duplicate Board/item records. |
| Role management | Existing `material_request_hub_bootstrap`, `material_request_hub_memberships`, Supabase Auth, workspace context and server authorization. No UI-created roles. |

## Architecture and security

- Dedicated route `#/material-request-hub/<section>` under the existing CRM shell; internal navigation is source-aligned (Overview, New Request, All Requests, Approvals, Release).
- `frontend/apps/MaterialRequestHub/client.js` is the only new domain boundary. Every RPC request verifies the signed user and workspace both before and after; UI permissions derive from the signed bootstrap and authoritative server RPCs.
- All pending/release mutations first exact-read the current request version, then pass `p_expected_version` as a CAS guard. Server-side RBAC, record state checks, auditing and authorization remain authoritative.
- The application is unmounted on sign-out, workspace change or navigation away, discarding its in-memory records; stale async responses are ignored.
- Unknown/failed request mutations are not retried automatically. The UI warns the employee to inspect All Requests before resubmission.
- Request identities and Material Sourcing Board item identities are never assumed to be identical. No source JSON database, demo accounts, `DEMO-REQ-*` records, or local upload bytes are imported.
- CSS is isolated to `.mrh-app` and linked separately from the committed, generated bundle so no unrelated styles are modified.

## Verification

Static smoke and unit tests: `node --test frontend/tests/material-request-hub-native-app.test.mjs`, followed by `npm test`, `npm run check` and `npm run build`.

**Signed live acceptance still required:** existing employee member with `REQUESTOR`, `APPROVER`, `WAREHOUSE`, `VIEWER` and `ADMIN` where available; status mutations must use an approved nonproduction workspace/records, not arbitrary live requests. Validate signed role denials, cross-workspace isolation, pending→approved→release, rejection reasons, version conflict, readback after refresh, navigation, and responsive behavior. A successful build does not certify production installation of `material_request_hub_*` RPCs or that all source workflows are feature-identical.

## Intentional differences from standalone

The uploaded standalone used React, a locally seeded demo user, two local group keys and JSON data on port 5174. The native CRM module uses plain JS and the CRM's existing signed Supabase APIs instead, to avoid an incompatible second framework/runtime inside the shared host. The source's navigation and core request lifecycle are reproduced; exact pixel parity, historical media migration, attachment binary transport, local favorites, automatic background polling and any locally simulated permission behavior are not included in this increment.

**Release gate:** Keep as draft PR until frontend tests, Pages build and a real authorized signed-user check pass. Do not merge into `main` on unverified assumptions about live RPC availability.
