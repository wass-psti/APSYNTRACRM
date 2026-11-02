# CP-TT-NATIVE-01 — TimeTracker Attendance native integration baseline

**Date:** 2026-11-02 Asia/Manila  
**Repository:** `wass-psti/APSYNTRACRM` · direct `main` · GitHub Pages  
**Source archive:** operator-provided `time-tracker.zip`, SHA-256 `41d3889311daa91043aa98bb32085138caa53ba5f23f3232a69cc12cd15c540d`  
**Source role:** **reference only** — no archive, original standalone JS/CSS/server, or synthetic JSON records are deployed or imported.

## Existing source assessment

The ZIP contains TimeTracker Attendance standalone **v0.1.60**, derived from **v2.0.14**, using browser-native `bootstrap.js`, `app.js`, `styles.css`, local Node `server/index.js` and `server/db.js`, plus a standalone temporary local JSON persistence store and synthetic data. Source history includes CP5 staging host compatibility adapter; **the adapter was never mounted as a production workflow**.

**Source features inventoried:**

| Original capability | Original behavior | APSYNTRA native status |
| --- | --- | --- |
| Clock | Clock In/Out, GPS, location, department, non-admin offsite Work Note, attendance session state | **IMPLEMENTED-UNVERIFIED** actual signed production commits; native frontend and atomic RPC client unit tested |
| Overview | Day-focused multiuser morning flow, whereabouts, department activity, exception stream | **PARTIAL** personal daily KPIs; full scoped team/day overview **PENDING** backend scoped projection |
| Log | Attendance records, expanded audit, GPS evidence, search/filters, admin corrections | **PARTIAL** own record history, safe fields and credited-time calculation; corrections/GPS details **PENDING** |
| Reports | Period/department/location filters, date summaries, print, CSV export | **PARTIAL** own attendance CSV; full authorized reports and print **PENDING** |
| Calendar | Philippine holiday data, date views and authorized custom events | **PENDING** |
| OT | Draft/Submitted/Approved/Rejected, request editing, department approval, self-approval prohibition, credited OT impact | **PENDING** — must be server-enforced, not raw snapshot writes |
| Roles | TimeTracker-only `System Admin`, `IT Administrator`, `HR`, `Supervisor`, `Finance`, `OJT`, `Employee` | **PARTIAL** current signed module role resolved from centralized directory; all mutations remain in central User Role Management |
| Audit | Clock and correction audit events; privileged audit views/exports | **PENDING** native server append-only audit event acceptance |
| Auto Clock-Out | **Only on app initialization**, exact computed credited-hours threshold, approved OT extension, GPS retry/recovery evidence | **PENDING** — the existing manual transactional RPC timestamps at server commit time; it is **not** an auto-backdating API |
| Accessibility, responsive layout | Keyboard controls, overlays, reduced motion, mobile layout, large reports | **PARTIAL** native semantic forms and CSS; full E2E and cross-device checks **PENDING** |

**Preserved policy references (implemented in `frontend/time-tracker-native.js`):**
- 08:00 local on-time threshold (strictly later = Late);
- unpaid break overlap 12:00–13:00 deducted rather than always subtracting a full hour;
- base required credited duration 9 hours, excluding validated approved OT until operational OT integration;
- exact five location and six department choices from original source;
- non-System Admin Offsite (Home) requires a nonempty Work Note, max 500 characters in current backend contract.

## Existing APSYNTRA infrastructure verified read-only in production

- Exactly one existing dedicated `TimeTracker Attendance` board, fixed ID `46bf4ee7-368a-4c35-842c-8593ea1f6ac3`, and existing v1 schema/board registry. **No new board was created**.
- Existing module identifier `time-tracker`, central `has_module_access`, `module_role_for`, `list_module_directory`, `list_module_state`, role ceilings and workspace isolation via current signed workspace.
- Existing server transaction RPC `commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb)`, `SECURITY DEFINER`, `authenticated EXECUTE=true`, `anon=false`; uses signed `auth.uid()`, module grant, workspace scope, advisory transaction lock, active-session conflict prevention, server timestamp, immutable generated record ID, integrity check, revision and backup update. No new database server or auth was introduced.
- `module_state_entries` currently has 11 TimeTracker entries; one shared `timetracker.attendance.v1` record exists. Only key names and payload byte lengths were inspected; no personal attendance details were read by this development audit.
- `module_role_assignments` has 40 enabled TimeTracker assignments (point-in-time count); role assignment mutations remain exclusively under existing central management.
- The current frontend uses `AuthClient`, `DomainApi`, `work_board_access` and the signed board data route. A standalone unified TypeScript SDK does **not** appear as a separate first-party runtime module in this checkout; the existing central DomainApi JS contract was reused rather than inventing a competing SDK. SDK unification remains an architecture follow-up where required.

## First native implementation changes

- `frontend/time-tracker-native.js`: source-derived timekeeping math, per-user safe history projection, strict signed board+module access, central role and directory identity, live state read, server-authoritative commit receipt and conflict guard, browser real GPS acquisition (no demo fallback), offsite note validation.
- `frontend/time-tracker-ui.js`: own attendance KPIs/history, Clock In/Out form, source policy display, personal CSV export. No exact GPS coordinates, privileged audit payloads or other employees' records rendered.
- `frontend/app.js`: `#/boards/<existing-uuid>/attendance` route and a TimeTracker tab **within the existing CRM board**, signed lifecycle/expiry/workspace resets, explicit user-initiated attendance form action and no background mutations.
- `frontend/styles.css`: scoped responsive TimeTracker styles with isolated horizontal table scrolling.
- `frontend/tests/time-tracker-native.test.mjs`: policy, per-user scope, deny cases, GPS, server receipt, duplicate active-session conflict, CSV escaping, native UI and routing assertions. Existing full frontend suite remains mandatory.

**Write boundary:** the native UI invokes the existing production attendance action only after a signed user explicitly submits Clock In/Out and browser geolocation succeeds. No operator/assistant-driven production attendance mutations or demo data writes were performed during development. No new tables, roles, grants, JWT configurations, SDK dependencies or app hosting were created.

## Critical security and operational acceptance gaps

The existing server function requires `p_geo.status='captured'` but, as a browser-supplied claim, that is **not a cryptographic attestation of physical position**. It also **does not enforce offsite Work Note server-side** (current native frontend enforces it, which is not sufficient as a security control). The server function does not visibly append a corresponding TimeTracker audit event during its transaction; separate source app audit state should not be presumed from its existence. Existing `list_module_state` returns role-dependent data, with broader data exposure for privileged roles, but server-side department-scoped Supervisor reporting and exact-GPS Finance restrictions need separate verification/hardening.

Therefore **full production authorization, offsite policy enforcement, audit logging, supervisor/finance scoped projections, and auto-clock-out are NOT ACCEPTED** by the UI implementation. Treat these as backend acceptance blockers. Do not silently modify the existing live security-definer RPC or permissions without a controlled and separately authorized production change.

## Evidence-based 10-gate TimeTracker tracker

The phases below are deliberately narrow to distinguish verified source/build evidence from genuinely live end-to-end workflow acceptance.

| Gate | Acceptance condition | Classification |
| --- | --- | --- |
| TT-01 | Complete reference ZIP structure and operational source inventory | **VERIFIED** (source inspected; synthetic data excluded) |
| TT-02 | Existing dedicated board, central module role, signed RPC contracts found in live backend | **VERIFIED** (read-only SQL and current main source) |
| TT-03 | Native signed board route, own-record projection, policy and security unit tests | **VERIFIED** when target main CI passes; otherwise **IMPLEMENTED-UNVERIFIED** |
| TT-04 | Genuine signed Clock In/Out against existing backend with user consent and GPS | **IMPLEMENTED-UNVERIFIED**; no production data changes were made during development |
| TT-05 | Original full scoped Overview and Log including GPS/audit inspection | **PENDING** |
| TT-06 | Full Reports and Calendar contracts | **PENDING** |
| TT-07 | OT workflows with server-enforced ownership, approval boundaries, audit and time-credit rules | **PENDING** |
| TT-08 | Backend hardening of work notes, per-role scope, anti-spoofing bounds and append-only audit | **BLOCKED** pending controlled authorization/security revision |
| TT-09 | Launch-only automatic Clock Out, recovery, approved OT integration, persisted revision evidence | **PENDING** |
| TT-10 | End-to-end signed runtime, cross-workspace, role ceiling, network, accessibility and compatibility acceptance | **PENDING** |

**Progress metric:** when TT-03 CI is green, **3/10 narrow gates verified = 30% TimeTracker stage acceptance** (not 30% feature parity). Otherwise 2/10 = 20%. **Overall 12-app final acceptance: 0/12**, because no application has passed complete native operational acceptance yet.

**Next action:** finish server-side attendance validation and audit hardening as a staged, reviewed, additive-to-current-contract change before enabling full operational acceptance; run a genuine existing signed TimeTracker user Clock In/Out only with user-initiated action, then implement restricted team overview, OT, Reports, Calendar and authorized corrections. Do not proceed to any of the other 11 applications until TimeTracker applicable acceptance requirements pass.
