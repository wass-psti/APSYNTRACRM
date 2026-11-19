-- CP-CRM-NATIVE-ACCESS-FINAL-04 — read-only eight Board-linked native modules.
-- This is an expected inventory, not evidence of successful browser access.
-- Export the JSON only to the authorized operator's protected QA machine.
WITH modules(module_id,board_name) AS (
 VALUES ('fueltrans','FuelTrans Standalone'),
        ('tool-traceability','Tool Traceability'),
        ('toolbox-issues','Toolbox Issues'),
        ('material-request-hub','Material Request Hub'),
        ('employee-eval','Employee Evaluation'),
        ('charter-navigator','Charter Navigator'),
        ('order-intake','Order Intake'),
        ('aps-aims','APS AIMS')
), eligible AS (
 SELECT DISTINCT wm.user_id,wm.workspace_id
 FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.active IS TRUE AND p.status='active'
  AND public.current_workspace_id(wm.user_id)=wm.workspace_id
), entitled AS (
 SELECT e.user_id,e.workspace_id,m.module_id,m.board_name
 FROM eligible e CROSS JOIN modules m
 WHERE public.module_role_for(m.module_id,e.user_id) IS NOT NULL
  AND public.has_module_access(m.module_id,e.user_id) IS TRUE
), inventory AS (
 SELECT substr(encode(sha256(convert_to(e.user_id::text,'UTF8')),'hex'),1,16) AS account_key,
        e.module_id,b.id AS board_id,e.board_name
 FROM entitled e LEFT JOIN public.work_boards b
 ON b.workspace_id=e.workspace_id AND b.name=e.board_name
  AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL
)
SELECT account_key,
       jsonb_build_object('assignments',jsonb_agg(jsonb_build_object(
        'moduleId',module_id,'boardId',board_id)
        ORDER BY module_id)) AS assigned_boards,
       count(*) FILTER (WHERE board_id IS NULL)::int AS missing_canonical_boards,
       count(*)::int AS effective_board_module_assignments
FROM inventory
GROUP BY account_key ORDER BY account_key;
