# CP-CRM-URM-INTEGRITY-03R — Genuine Signed Two-Profile Native Readback

## Verified production facts, November 20, 2026

The existing dual-profile signed preflight at `127.0.0.1:9224` and `127.0.0.1:9225` returned `ELIGIBLE` for distinct active users in **Work Management**: a CRM Employee and a CRM Administrator. These are independent authoritative signed server RPC responses, not fixture data.

The existing native readback script was extended to accept a second independent loopback Chromium endpoint, preserving the original single-endpoint contract. The script continues to make **no role, business, or permission writes**, and restores each browser page's original route after inspecting the four native applications. It validates authoritative access projection, native Board context, a domain HTTP 200 response and zero page errors.

### Genuine readback observations

| Application | Employee | Administrator |
|---|---|---|
| TimeTracker | VERIFIED: domain HTTP 200 and native Board match | VERIFIED: domain HTTP 200 and native Board match |
| Fund Tracker | NOT_ASSIGNED: signed projection `allowed=false` | VERIFIED: domain HTTP 200 and native Board match |
| FuelTrack+ | NOT_ASSIGNED: signed projection `allowed=false` | VERIFIED: domain HTTP 200 and native Board match |
| TradeLink | NOT_ASSIGNED: signed projection `allowed=false` | Native Board matched but expected domain HTTP 200 was not observed; FAILED readback |

A second readback recovered the Administrator's authoritative context after a transient incomplete probe. This is **not** full four-application Employee verification and **not** a role-mutation receipt. Different module assignments are a functional acceptance prerequisite, not a reason to alter server permission rules.

### Boundaries

- No production role, membership, permission or business writes were made. No new SQL migration, RLS/grant policy, credential copying or persistent browser agent.
- The existing disposable role-mutation workflow already verifies persistence and readback against an isolated Postgres fixture. That does **not** constitute a real production signed role write or Employee cross-session acceptance.
- Genuine four-application mutation, persistence and restoration on Work Management would alter production user role records. This requires separate authorization for the specified target and original assignments, or an authorized nonproduction workspace and signed Employee/Administrator pair.

**Next milestone if unresolved:** `CP-CRM-URM-INTEGRITY-03S — TradeLink Native Signed Readback Diagnosis, Authorized Nonproduction Four-Role Mutation, and Final Cross-Session Functional Acceptance`.
