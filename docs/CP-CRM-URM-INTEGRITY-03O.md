# CP-CRM-URM-INTEGRITY-03O — Independent Browser Session Verification

## Observed production evidence (2026-11-20)

- A previously isolated Chromium profile was gracefully reopened using the **same retained user-data directory**, adding a loopback-only Chrome DevTools endpoint (`127.0.0.1:9224`). Browser cookies, credentials, and tokens were neither copied nor logged.
- The unchanged 03F signed preflight verified **one** genuine active **CRM Administrator** in **Work Management** (hashed account key `74085cf92fe5c39a`, hashed workspace key `11e594f481958c10`) via independent HTTP 200 signed `wm_auth_access_context` and `apsyntra_crm_my_effective_access` responses. Its one-account overall outcome correctly remained `BLOCKED`.
- The other available APSYNTRA CRM tab displays a Work Management CRM Administrator with User Role Management; the connector is read-only and does not establish an independent Employee session. The previous two-account Chrome DevTools endpoint is no longer running.
- A fresh independent Employee Chromium login profile was opened (loopback `127.0.0.1:9225`). The two-endpoint runtime test completed normally, confirmed the Admin account and correctly returned `BLOCKED` because the new Employee window is not yet authenticated. There is still **no independently verified signed Employee browser session** in Work Management. Genuine production mutation, persistence verification, restoration and final cross-session acceptance are **NOT EXECUTED**. Role, membership, business-record and permission writes: **zero**.

## Implemented acceptance fix

The 03F signed preflight previously supported only one CDP endpoint. This prevented independent Chrome profiles from being assessed together even when both were legitimately signed. It now accepts one or two distinct loopback endpoints, e.g.:

```sh
node scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs \
  --cdp-url=http://127.0.0.1:9224 \
  --cdp-url-2=http://127.0.0.1:9225
```

For each existing APSYNTRA CRM page, it observes only authoritative HTTP 200 signed context/effective-access responses, pseudonymizes account/workspace identifiers, and feeds the **same existing** strict two-person role/workspace classifier. All attached browser connections are closed after inspection. A valid Admin+Employee pair is **ELIGIBLE**, not proof of any mutation. Invalid, duplicate, remote/non-loopback, unauthenticated and wrong-workspace sessions remain blocked. The old single-CDP flow remains supported.

No database schema, RLS, grants, role writers, deployment configuration, persistent agents, or new restrictions are added.

## Remaining signed acceptance

An independently signed **Employee** in Work Management must open APSYNTRA CRM in an additional authorized browser profile, ideally with its own loopback CDP endpoint. Only then can the existing preflight establish a genuine independent pair; permitted nonproduction role changes must be separately evidenced with original assignment capture, signed write, persisted readback, Employee refresh, and restoration. Material production role/permission changes require separate explicit approval.

**Next if blocked:** `CP-CRM-URM-INTEGRITY-03P — Independent Work Management Employee Sign-In, Genuine Two-Profile Eligibility, Reversible Four-Native-Role Readback, and Final Functional Acceptance`.
