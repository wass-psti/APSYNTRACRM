# CP-OI-NATIVE-02A — Signed runtime and source reconciliation

## Evidence recorded 2026-11-24
Candidate d16e837c; baseline origin/main 4e6b3374; branch feat/cp-oi-native-01-20261124.
- Genuine existing Chromium signed CRM shell was accessible. Opened the production canonical Order Intake board (d045708b-6e36-4f0a-92fc-f0b8baf93de3) in a separate tab. Rendered title Order Intake, Main group, ten headers and the empty placeholder "No items in this group yet"; no load-more control. The placeholder is not a business record.
- Read-only Supabase project jtlusodorfnyzgyuewkz aggregate SQL independently confirmed the board is active in Work Management (00000000-0000-4000-8000-000000000001): total board items 0, active 0, archived 0; domain orders total 1, active 0, archived 1. Grouped domain count returned only this workspace. Eight reference PO numbers (2598, PO260000038144, 260610, A-2026-10-006, A-2026-10-007, 150007177, S26-0557, S26-0556) had zero active matches.
- SQL ran with the connected project account, not an end-user CRM session; it establishes source counts, not signed RLS/runtime acceptance.
- Existing board columns are generic reference/lineage columns. They are not a complete purchase order financial schema.
- Local built candidate served on loopback port 4173: clean isolated Chromium startup returned HTTP 200, visible sign-in, no native business data and zero page errors.
- Existing production browser origin and local candidate origin have separate authentication. During inspection the available Chromium tab set changed to another local application; no signed local candidate session was established. No credentials or session tokens extracted or transferred. No browser restart or changes to unrelated processes.
- Prior candidate tests remain 3602/3602 and eight isolated fixture checks; not a fresh signed acceptance.

## Read-only reproduction SQL
```sql
select b.name, b.workspace_id, b.status,
 count(i.id) as total_board_items,
 count(i.id) filter (where i.archived_at is null) as active_board_items,
 count(i.id) filter (where i.archived_at is not null) as archived_board_items,
 (select count(*) from public.order_intake_orders o
  where o.workspace_id=b.workspace_id and not o.archived) as active_domain_orders,
 (select count(*) from public.order_intake_orders o
  where o.workspace_id=b.workspace_id and o.archived) as archived_domain_orders
from public.work_boards b left join public.work_board_items i on i.board_id=b.id
where b.id='d045708b-6e36-4f0a-92fc-f0b8baf93de3'
group by b.id,b.name,b.workspace_id,b.status;
```

## Determination
Source population discrepancy VERIFIED: zero active CRM records in either inspected source, versus 100 orders displayed in the supplied legacy screenshots (historical reference, not current authoritative export). The absence of operational data is confirmed; the historical cause and location of the legacy records are not yet verified. No production records, roles, policies, migrations, dependencies or model execution paths changed. Do not restore the archived record or create synthetic orders to manufacture acceptance.

CP-OI-NATIVE-02A is incomplete: signed native route, real nonempty record retrieval, dashboard/workflow/record detail reconciliation and signed refresh/request counts remain unverified. No UI implementation defect established by this inspection.

## Next checkpoint: CP-OI-NATIVE-02B — Authoritative legacy source discovery and import dry run
Obtain a real source export or existing supported read integration; establish source field/PO identity, currency, VAT, missing-client/date rules, status mapping, duplicates, totals and lineage. Prepare deterministic dry-run reconciliation against existing active/archived domain rows; document rejected/ambiguous records, never invent missing values. Validate on nonproduction fixtures without writes to the live project. Any production import is a separately authorized data operation with reviewed counts, rollback/restore strategy, and signed readback. Once a genuine local signed session exists, verify native empty state independently and rerun populated signed acceptance after authorized import. Then proceed with CP-OI-NATIVE-03. No additional authorization rules or training.
