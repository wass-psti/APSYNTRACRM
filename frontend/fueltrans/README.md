# FuelTrans native board application

Adapted from the user-supplied `fueltrans.zip` (October 26, 2026), using its Vanilla JavaScript business modules. Mounted by `frontend/fueltrans-native.js` inside the FuelTrans board; no iframe, separate login, React runtime, or new persistence store.

Includes ticket intake and private draft recovery, station history, sequential station batches, filtered ticket queues, L1/L2 assignment and handover, evidence, ticket history, reports and CSV/print, notifications, membership administration, issue reporting, recoverable deletion, and authorized recovery/export tools.

The CRM owns session refresh, workspace selection, board navigation, and access checks. Existing FuelTrans memberships, tables, RPCs, and Storage policies remain authoritative. The database-side CRM board/session restrictions are staged separately in `sql/fueltrans-crm-board-boundary-candidate.sql`; they have not been applied. Existing generic board rows are not populated with fabricated ticket projections.

Validation: repository frontend tests and syntax/CSP checks; signed read-only browser checks of dashboard, intake form, reports, and queue. Production mutations and role-by-role end-to-end operation have not been exercised.
