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
| Reports | Period/department/location filters, date summaries, print, CSV export | **PARTIAL** personal today/week/month/all reports and period-scoped CSV implemented; cross-user authorized reports, advanced filters and print **PENDING** |
| Calendar | Philippine holiday data, date views and authorized custom events | **PENDING** |
| OT | Draft/Submitted/Approved/Rejected, request editing, department approval, self-approval prohibition, credited OT impact | **PARTIAL** own OT requests preview through signed central state; creation/review decisions/credit impact **PENDING** server-enforced workflow |
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

**Write boundary:** the native commit client is implemented, but live Clock In/Out UI controls and their event handler are **fail-closed disabled** via `TT_LIVE_ATTENDANCE_WRITES_ACCEPTED=false` until server-side work-note/audit requirements and genuine signed operational acceptance pass. The native UI provides personal attendance reads and CSV while the write gate remains closed. No operator/assistant-driven production attendance mutations or demo data writes were performed during development. No new tables, roles, grants, JWT configurations, SDK dependencies or app hosting were created.

**Additional native read-only slice:** personal Today / This Week / This Month / All History reporting and export use the existing signed attendance state, and personal Draft/Submitted/Approved/Rejected OT previews use `timetracker.ot.v1`. Both explicitly re-filter signed owner IDs in the browser and contain no OT mutation or privileged approve/reject functionality. Backend-role-scoped supervisor/finance reporting and independent OT request/action authorization are not yet certified.

## Critical security and operational acceptance gaps

The existing server function requires `p_geo.status='captured'` but, as a browser-supplied claim, that is **not a cryptographic attestation of physical position**. It also **does not enforce offsite Work Note server-side** (current native frontend enforces it, which is not sufficient as a security control). The server function does not visibly append a corresponding TimeTracker audit event during its transaction; separate source app audit state should not be presumed from its existence. Existing `list_module_state` returns role-dependent data, with broader data exposure for privileged roles, but server-side department-scoped Supervisor reporting and exact-GPS Finance restrictions need separate verification/hardening. The existing attendance RPC contains a module grant but does **not** call `work_board_access` or independently require this dedicated board ID; the native browser gates board access, but that is not a replacement for server-side board-authorization enforcement.

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


## CP-TT-NATIVE-01 no-write production backend preflight

The read-only source-controlled audit `sql/tests/cp-tt-native-01-production-readonly-preflight.sql` was executed against production. Its observed result:

- One existing TimeTracker board, **40** active module role assignments, and **one** current authoritative attendance state entry.
- Existing `commit_timetracker_attendance_action`: installed, `SECURITY DEFINER`, authenticated EXECUTE **true**, anonymous EXECUTE **false**.
- Signed identity, `has_module_access`, current workspace, advisory concurrency lock and state invariants: present in live server code.
- Explicit `Offsite (Home)` work-note enforcement: **absent** in server function.
- Explicit dedicated-board permission check inside commit function: **absent** (`work_board_access` not referenced).
- Explicit TimeTracker audit append on clock commit: **absent** in server function.
- No data, employee information, financial or attendance writes, or production permissions were changed by this preflight.

**Safety disposition:** The native commit adapter is implemented and unit-tested, but the deployed UI keeps Clock In/Out disabled until the server security gaps and signed operational acceptance are verified. Existing production grants are unchanged and the historical RPC remains directly callable by previously authorized clients. Frontend gating is **not a substitute** for backend security hardening.

## Latest automated integration evidence — 2026-11-02

**GitHub Actions:** [Frontend Validation #41405150992](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41405150992) ran against native TimeTracker revision `49eaed3d7246914dcda7035317a8c78a5926a249`. **SUCCESS:** frontend **259/259**, disposable PostgreSQL **SUCCESS**, live Pages source smoke **SUCCESS**. This verifies build/source/unit regression contracts, not a genuine browser clock transaction. The signed production backend was inspected only with the no-write preflight described above.

**Verified code coverage added for this application:** source attendance policy, per-user filtering, concurrency rejection preflight, central module and board gate, stable identity, GPS client acquisition validation, constrained server receipts, escaped history/report/OT display, CSV formula escaping, report periods, session-expiry state clearing, and explicit disabled production write state.

**Acceptance accounting:** TT-01, TT-02 and TT-03 are **VERIFIED**, or **3 of 10 narrow acceptance gates = 30%**. TT-04 through TT-10 are not accepted. No other application board was modified by the native TimeTracker work. Overall twelve-application final acceptance remains **0/12**.

**Next implementation blocker:** stage server-enforced board grant, offsite Work Note, location/department validation, and immutable attendance audit changes against the existing transaction contract, then complete controlled authorization review before any production deployment. The current Clock In/Out user interface stays disabled; no live clock writes or operator sign-in were performed in this development run. All 12 original source modules require separate parity mapping; this initial slice does not constitute full TimeTracker feature equivalence.


## Clock reference design integration — 2026-11-02

**Operator visual reference:** supplied annotated screenshot of the original TimeTracker **Clock** tab within Monday.com. The screenshot was used as a **visual-language reference**, not embedded or redeployed. The surrounding Monday.com toolbar, application shell, branding and public-share indicator were intentionally not copied; APSYNTRA's existing board shell, authentication, and route remain authoritative.

**Implemented natively in** \`frontend/time-tracker-ui.js\`, \`frontend/styles.css\`, \`frontend/app.js\`:

- Light segmented TimeTracker sub-header, small orange clock icon, dynamic centralized TimeTracker role badge, real backend safety notices.
- Horizontally independently scrolling feature tab strip. Clock is the default active tab. Log, Reports, OT remain functional, authorized read-only native screens. Source-only Overview, Calendar, My Hours, Team, Roles, Monitor and GPS tab labels are **disabled**, not implied complete.
- Central, large serif local clock with real greeting, current date, orange colon, separately styled seconds and AM/PM, source screenshot's session indicators (today's records/credited hours/Idle or Active state).
- Centered Clock In/Out card with server-derived active state, location and department selectors, Office/Home quick-select chips, offsite work-note field and explicit fail-closed production write banner. Disabled Clock start/end preserves backend security boundary.
- Scope-specific clean styling, responsive narrow-screen layout, visible keyboard focus, reduced-motion support, CSS-isolated table scrolling and no new rendering framework.
- A **single 1-second text-only timer** is created only while the authenticated native Clock view is mounted; it is stopped when leaving that view, signing out, or session expiring. No recurring database polling, persistent monitoring, or telemetry was added.

**Verification:** [GitHub Actions Frontend Validation #41406622172](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41406622172) for commit \`7981535b9ef9e1e37820494345bd8f48a2e9bdd3\` — **PASS: 262/262 frontend tests**, disposable PostgreSQL **SUCCESS**, exact-source Pages smoke **SUCCESS**. Added Clock visual contract, local-time formatting, text-node-only ticker, quick-location/navigation, disabled server-write presentation and existing authorization regression tests. Earlier SEC07 session-expiry test caught a timer cleanup placement change; corrected without altering expiry semantics before the final green run.

**Classification:** Clock visual and frontend regression implementation **VERIFIED at source/CI scope**, signed live TimeTracker read and clock transactions **NOT VERIFIED** by this visual task. Clock-in/out production writes remain deliberately **DISABLED** pending the independently documented backend board grant, offsite-note and audit enforcement gaps. This design milestone **does not change TT-01..TT-10 acceptance accounting**: **3/10 verified = 30%**, and all twelve applications remain **0/12 fully operationally accepted**. No records, module roles, production function grants, auth policies or board schema were modified.


### Clock default-board route and final regression result

**Follow-up UX integration:** the generic \`#/boards/<id>\` routing now selects the native Clock view automatically **only** when the signed board registry identifies the existing \`TimeTracker Attendance\` board; it does not affect the other eleven application boards. The original generic Board Items view remains reachable at \`#/boards/<id>/items\`; explicit \`/attendance\` still works. Within the native TimeTracker UI the Clock, Log, Reports and OT views are interactive with authorized personal read-only data; other source tabs are distinctly disabled until their native workflow contracts exist. The current local clock is updated in six text nodes without repeatedly rendering or polling PostgreSQL. Office/Home quick selection operates only on the existing validated location dropdown.

**Final changed-source validation:** [GitHub Actions Frontend Validation #41406947456](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41406947456) at commit \`9ed4fdd9c9a2692299499e7cf2c5c4be8dc37a1c\`: **263/263 frontend tests PASS**, disposable PostgreSQL PASS and exact-source Pages smoke PASS. These checks cover HTML semantics, source UI and the current central backend contract; full visual pixel-match, actual signed-user Clock attendance writes, and end-to-end production runtime acceptance remain **NOT VERIFIED**. No production finance or attendance data, roles or permission grants changed. Existing Clock write gating remains **false** until separately accepted backend hardening.
