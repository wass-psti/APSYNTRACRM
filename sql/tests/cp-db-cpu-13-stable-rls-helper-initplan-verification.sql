-- CP-DB-CPU-13 post-activation verification; read-only.
WITH expected(schemaname,tablename,policyname,expected_roles,expected_cmd,requires_using,requires_check) AS (
 VALUES
 ('huly_rewrite','documents','huly_documents_insert','{authenticated}','INSERT',false,true),
 ('huly_rewrite','documents','huly_documents_read','{authenticated}','SELECT',true,false),
 ('huly_rewrite','documents','huly_documents_update','{authenticated}','UPDATE',true,true),
 ('huly_rewrite','transaction_events','huly_sb06_events_insert','{authenticated}','INSERT',false,true),
 ('huly_rewrite','transaction_events','huly_sb06_events_read','{authenticated}','SELECT',true,false),
 ('public','aps_aims_entities','aps_aims_entities_create','{authenticated}','INSERT',false,true),
 ('public','aps_aims_entities','aps_aims_entities_read','{authenticated}','SELECT',true,false),
 ('public','aps_aims_entities','aps_aims_entities_update','{authenticated}','UPDATE',true,true),
 ('public','aps_aims_events','aps_aims_events_read','{authenticated}','SELECT',true,false),
 ('public','module_role_assignments','assignments_self_or_admin_select','{authenticated}','SELECT',true,false),
 ('public','profiles','profiles_self_or_admin_select','{authenticated}','SELECT',true,false),
 ('public','order_intake_activity','order_intake_activity_select','{authenticated}','SELECT',true,false),
 ('public','order_intake_orders','order_intake_orders_select','{authenticated}','SELECT',true,false)
), actual AS (
 SELECT e.*,p.permissive,p.roles,p.cmd,p.qual,p.with_check,
   coalesce(p.qual,'')||coalesce(p.with_check,'') AS expression
 FROM expected e
 LEFT JOIN pg_policies p USING(schemaname,tablename,policyname)
), checked AS (
 SELECT *,
   CASE WHEN policyname IS NULL THEN false
     WHEN permissive<>'PERMISSIVE' OR roles::text<>expected_roles OR cmd<>expected_cmd THEN false
     WHEN requires_using AND qual IS NULL THEN false
     WHEN NOT requires_using AND qual IS NOT NULL THEN false
     WHEN requires_check AND with_check IS NULL THEN false
     WHEN NOT requires_check AND with_check IS NOT NULL THEN false
     WHEN position('( SELECT current_workspace_id(' IN expression)=0
       AND policyname IN ('huly_documents_insert','huly_documents_read','huly_documents_update','huly_sb06_events_insert','huly_sb06_events_read','aps_aims_entities_create','aps_aims_entities_read','aps_aims_entities_update','aps_aims_events_read','order_intake_activity_select','order_intake_orders_select') THEN false
     WHEN position('( SELECT has_module_access(' IN expression)=0
       AND policyname IN ('aps_aims_entities_create','aps_aims_entities_read','aps_aims_entities_update','aps_aims_events_read','order_intake_activity_select','order_intake_orders_select') THEN false
     WHEN position('( SELECT is_platform_admin(' IN expression)=0
       AND policyname IN ('aps_aims_entities_create','aps_aims_entities_update','aps_aims_events_read','assignments_self_or_admin_select','profiles_self_or_admin_select') THEN false
     ELSE true END AS passes
 FROM actual
)
SELECT count(*) AS expected_policy_count,
       count(*) FILTER(WHERE passes) AS passing_policy_count,
       count(*) FILTER(WHERE NOT passes) AS mismatch_count,
       CASE WHEN count(*)=13 AND count(*) FILTER(WHERE passes)=13 THEN 'PASS' ELSE 'FAIL' END AS status
FROM checked;

WITH expected(schemaname,tablename,policyname) AS (
 VALUES
 ('huly_rewrite','documents','huly_documents_insert'),('huly_rewrite','documents','huly_documents_read'),('huly_rewrite','documents','huly_documents_update'),
 ('huly_rewrite','transaction_events','huly_sb06_events_insert'),('huly_rewrite','transaction_events','huly_sb06_events_read'),
 ('public','aps_aims_entities','aps_aims_entities_create'),('public','aps_aims_entities','aps_aims_entities_read'),('public','aps_aims_entities','aps_aims_entities_update'),
 ('public','aps_aims_events','aps_aims_events_read'),('public','module_role_assignments','assignments_self_or_admin_select'),
 ('public','profiles','profiles_self_or_admin_select'),('public','order_intake_activity','order_intake_activity_select'),('public','order_intake_orders','order_intake_orders_select')
), expressions AS (
 SELECT coalesce(p.qual,'')||coalesce(p.with_check,'') AS expression
 FROM expected e JOIN pg_policies p USING(schemaname,tablename,policyname)
)
SELECT
 sum((length(expression)-length(replace(expression,'( SELECT current_workspace_id(','')))/length('( SELECT current_workspace_id('))::integer AS current_workspace_wrappers,
 sum((length(expression)-length(replace(expression,'( SELECT has_module_access(','')))/length('( SELECT has_module_access('))::integer AS module_access_wrappers,
 sum((length(expression)-length(replace(expression,'( SELECT is_platform_admin(','')))/length('( SELECT is_platform_admin('))::integer AS platform_admin_wrappers
FROM expressions;
