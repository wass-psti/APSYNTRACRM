-- CP-A12.1: Independent READ-ONLY audit after a genuine 12-board signed QA run.
-- Does not impersonate users, modify records, or infer stale-write denial from positive logs.
WITH expected(module_key,board_name) AS (
 VALUES
  ('fueltrans','FuelTrans Standalone'),
  ('tools','Tool Traceability'),
  ('toolbox','Toolbox Issues'),
  ('frt','Fund Released Tracker'),
  ('fueltrack','FuelTrack+ v3'),
  ('tradelink','TradeLink'),
  ('timetracker','TimeTracker Attendance'),
  ('orders','Order Intake'),
  ('evaluation','Employee Evaluation'),
  ('charter','Charter Navigator'),
  ('aims','APS AIMS'),
  ('materials','Material Request Hub')
),
board_rows AS (
 SELECT x.module_key,x.board_name,b.id AS board_id,b.workspace_id,b.description
 FROM expected x
 LEFT JOIN public.work_boards b
  ON b.name=x.board_name AND b.status='active'
  AND b.archived_at IS NULL AND b.trashed_at IS NULL
),
qa_creates AS (
 SELECT br.module_key,br.board_id,e.entity_id,e.actor_id,
        e.payload->>'title' AS qa_label
 FROM board_rows br JOIN public.work_board_events e ON e.board_id=br.board_id
 WHERE e.event_type='item.created'
  AND e.payload->>'title' LIKE 'APSYNTRA-A12-QA-%'
),
qa_lifecycle AS (
 SELECT q.module_key,q.board_id,q.entity_id,
        count(*) FILTER(WHERE e.event_type='item.created') AS created_events,
        count(*) FILTER(WHERE e.event_type='item.cell_updated') AS updated_events,
        count(*) FILTER(WHERE e.event_type='item.deleted') AS deleted_events,
        count(DISTINCT e.actor_id) AS actors,
        bool_and(e.actor_id=q.actor_id) AS same_actor,
        count(i.id) FILTER(WHERE e.event_type='item.created') AS residual_item_joins
 FROM qa_creates q
 JOIN public.work_board_events e
  ON e.board_id=q.board_id AND e.entity_id=q.entity_id
 LEFT JOIN public.work_board_items i
  ON i.board_id=q.board_id AND i.id=e.entity_id::uuid
 GROUP BY q.module_key,q.board_id,q.entity_id
)
SELECT e.module_key,e.board_name,
 count(DISTINCT br.board_id) AS active_board_count,
 count(DISTINCT br.workspace_id) AS workspace_count,
 coalesce(bool_and(br.description LIKE '[APSYNTRA:MODULE:'||e.module_key||':v1]%'),false) AS marker_matches,
 count(DISTINCT c.id) AS typed_columns,
 count(DISTINCT g.id) AS groups,
 count(DISTINCT m.user_id) AS memberships,
 count(DISTINCT i.id) AS remaining_items,
 (SELECT count(*) FROM qa_creates q WHERE q.module_key=e.module_key) AS qa_runs,
 (SELECT count(*) FROM qa_lifecycle l WHERE l.module_key=e.module_key
   AND l.created_events=1 AND l.updated_events=2 AND l.deleted_events=1
   AND l.actors=1 AND l.same_actor AND l.residual_item_joins=0) AS completed_cud_audit_cycles
FROM expected e
LEFT JOIN board_rows br ON br.module_key=e.module_key
LEFT JOIN public.work_board_columns c ON c.board_id=br.board_id
LEFT JOIN public.work_board_groups g ON g.board_id=br.board_id
LEFT JOIN public.work_board_members m ON m.board_id=br.board_id
LEFT JOIN public.work_board_items i ON i.board_id=br.board_id
GROUP BY e.module_key,e.board_name
ORDER BY e.module_key;
-- IMPORTANT: An audit ledger can independently corroborate create/update/delete,
-- but cannot demonstrate that a stale write was rejected. That negative assertion
-- requires a genuine signed-user acceptance report or independently executed denial.
