-- WS03: read-only catalog preflight for a proposed main-branch authorization
-- release. This query does not read employee rows, account emails, board data,
-- key material, policy expressions, function bodies, or private flag values.
WITH signatures(name,signature) AS(
 VALUES
 ('workspace_list','public.wm_ws01_list()'),
 ('workspace_create','public.wm_ws01_create(text,text,uuid)'),
 ('workspace_select','public.wm_ws01_select(uuid,uuid)'),
 ('workspace_resolver','public.current_workspace_id(uuid)'),
 ('signed_session','private.ws01_signed_actor_session()'),
 ('workspace_creator_authority','public.wm_ws03_creator_eligibility()'),
 ('workspace_owner_transfer',
  'public.wm_ws03_transfer_ownership(uuid,text,uuid,uuid,uuid,uuid)'),
 ('owner_transfer_candidates','public.wm_ws03_transfer_candidates(uuid)'),
 ('owner_transfer_verify','public.wm_ws03_verify_transfer(uuid,uuid)'),
 ('board_get','public.wm_get_board(uuid)'),
 ('board_list','public.wm_list_boards()')
),fn AS (
 SELECT name,signature,to_regprocedure(signature) IS NOT NULL AS installed
 FROM signatures
),tables(name) AS(
 VALUES('private.ws01_member_roles'),
 ('private.ws01_lifecycle_flags'),
 ('private.ws03_creator_authorities'),
 ('private.ws03_creator_flags'),
 ('private.ws03_owner_transfer_requests'),
 ('private.bs09_groups'),
 ('private.bs09_group_board_grants'),
 ('public.workspace_members'),
 ('public.work_boards'),
 ('public.work_board_members')
),tb AS (
 SELECT name,to_regclass(name) IS NOT NULL AS installed FROM tables
)
SELECT jsonb_pretty(jsonb_build_object(
 'report','WS03_READ_ONLY_CATALOG',
 'functions',(SELECT jsonb_object_agg(name,installed) FROM fn),
 'tables',(SELECT jsonb_object_agg(name,installed) FROM tb),
 'note','This inventory cannot prove that role checks, session scope, Auth triggers, workspace selection, RLS or SMTP are secure. Do not use it as deployment approval.'
)) AS readiness_report;
