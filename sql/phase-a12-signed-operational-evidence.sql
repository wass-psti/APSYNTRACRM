-- CP-A12.1 signed operational acceptance: independent READ-ONLY verification.
-- QA records are already cleaned. The original signed HTTP 409 tests are
-- corroborated separately by Supabase gateway logs, never by inferring from DML.
with expected(module_key,board_name) as (
values ('fueltrans','FuelTrans Standalone'),
('tools','Tool Traceability'),('toolbox','Toolbox Issues'),
('frt','Fund Released Tracker'),('fueltrack','FuelTrack+ v3'),
('tradelink','TradeLink'),('timetracker','TimeTracker Attendance'),
('orders','Order Intake'),('evaluation','Employee Evaluation'),
('charter','Charter Navigator'),('aims','APS AIMS'),
('materials','Material Request Hub')
), boards as (
 select x.module_key,x.board_name,b.id as board_id,b.workspace_id,
   (select count(*) from public.work_board_items i where i.board_id=b.id) as remaining_items,
   (select count(*) from public.work_board_columns c where c.board_id=b.id) as typed_columns,
   (select count(*) from public.work_board_groups g where g.board_id=b.id) as groups,
   (select count(*) from public.work_board_members m where m.board_id=b.id) as memberships
 from expected x left join public.work_boards b on b.name=x.board_name
   and b.status='active' and b.archived_at is null and b.trashed_at is null
), qa_creates as (
 select b.module_key,b.board_id,e.entity_id,e.actor_id
 from boards b join public.work_board_events e on e.board_id=b.board_id
 where e.event_type='item.created'
   and e.payload->>'title' like 'APSYNTRA-A12-QA-%'
), lifecycles as (
 select q.module_key,q.board_id,q.entity_id,
  (select array_agg(e.event_type order by e.id)
    from public.work_board_events e
    where e.board_id=q.board_id and e.entity_id=q.entity_id
      and e.event_type in ('item.created','item.cell_updated','item.deleted')) as sequence,
  (select count(distinct e.actor_id) from public.work_board_events e
    where e.board_id=q.board_id and e.entity_id=q.entity_id) as actor_count,
  (select count(*) from public.work_board_events e
    where e.board_id=q.board_id and e.entity_id=q.entity_id
      and e.actor_id is distinct from q.actor_id) as actor_mismatches,
  exists(select 1 from public.work_board_items i where i.board_id=q.board_id and i.id=q.entity_id::uuid) as residue
 from qa_creates q
)
select b.module_key,b.board_name,b.board_id::text,b.workspace_id::text,
  b.typed_columns,b.groups,b.memberships,b.remaining_items,
  count(l.entity_id) as qa_runs,
  count(l.entity_id) filter(where
    l.sequence=array['item.created','item.cell_updated','item.cell_updated','item.deleted']::text[]
    and l.actor_count=1 and l.actor_mismatches=0 and not l.residue) as complete_positive_audit_runs
from boards b left join lifecycles l on l.module_key=b.module_key and l.board_id=b.board_id
group by b.module_key,b.board_name,b.board_id,b.workspace_id,
 b.typed_columns,b.groups,b.memberships,b.remaining_items
order by b.module_key;

-- HTTP negative evidence came from Supabase gateway logs for the signed
-- 2026-10-30 06:10:35Z—06:11:45Z run: 24 POST 204; 12 POST 409.
-- Rejected stale requests are not represented in item event rows.
