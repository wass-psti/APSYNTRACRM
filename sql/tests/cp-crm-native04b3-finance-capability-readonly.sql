-- CP-CRM-NATIVE-04B3: read-only effective-capability inventory for FRT.
-- Match the deployed frt_request_action and frt_restricted_request_detail
-- finance-role predicates. Zero identifiers or business record data returned.
-- Role membership is not independent QA designation, live session validation,
-- transaction lifecycle eligibility, or permission to execute business writes.
WITH eligible AS (
 SELECT fm.user_id,fm.role
 FROM public.frt_memberships fm
 JOIN public.profiles p ON p.id=fm.user_id AND p.status='active'
 JOIN public.workspace_members wm ON wm.workspace_id=fm.workspace_id
  AND wm.user_id=fm.user_id AND wm.active
 WHERE fm.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
   AND fm.status='active' AND fm.enabled
),
role_capabilities AS (
 SELECT user_id,role,
  role='REQUESTOR' AS may_request,
  role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AS may_approve,
  role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AS may_approve_liquidation,
  role IN ('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') AS may_close,
  role='GENERAL_MANAGER' AS may_confirm_transfer
 FROM eligible
),
gates(gate,candidates) AS (
 VALUES
 ('frt_requestors',(SELECT count(DISTINCT user_id) FROM role_capabilities WHERE may_request)),
 ('frt_approval_capable',(SELECT count(DISTINCT user_id) FROM role_capabilities WHERE may_approve)),
 ('frt_liquidation_approval_capable',(SELECT count(DISTINCT user_id) FROM role_capabilities WHERE may_approve_liquidation)),
 ('frt_closure_capable',(SELECT count(DISTINCT user_id) FROM role_capabilities WHERE may_close)),
 ('frt_transfer_confirmation_capable',(SELECT count(DISTINCT user_id) FROM role_capabilities WHERE may_confirm_transfer)),
 ('frt_distinct_requestor_and_approver_pairs',
  (SELECT count(*) FROM role_capabilities requester
   JOIN role_capabilities approver ON requester.user_id<>approver.user_id
   WHERE requester.may_request AND approver.may_approve)),
 ('frt_distinct_approver_and_transfer_actor_pairs',
  (SELECT count(*) FROM role_capabilities approver
   JOIN role_capabilities transfer_actor ON approver.user_id<>transfer_actor.user_id
   WHERE approver.may_approve AND transfer_actor.may_confirm_transfer)),
 ('frt_distinct_three_actor_workflow_sets',
  (SELECT count(*) FROM role_capabilities requester
   JOIN role_capabilities approver ON requester.user_id<>approver.user_id
   JOIN role_capabilities transfer_actor
     ON transfer_actor.user_id<>requester.user_id
    AND transfer_actor.user_id<>approver.user_id
   WHERE requester.may_request AND approver.may_approve
     AND transfer_actor.may_confirm_transfer))
)
SELECT gate,candidates AS existing_capability_candidates,
 CASE WHEN candidates>0 THEN 'POTENTIAL_CAPABILITY_NOT_QA_APPROVED'
 ELSE 'NO_EXISTING_ROLE_CANDIDATE' END AS status
FROM gates ORDER BY gate;
