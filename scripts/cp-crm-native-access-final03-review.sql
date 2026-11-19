-- CP-CRM-NATIVE-ACCESS-FINAL-03 — Charter intended-access review manifest.
-- Read only. Each row is a REVIEW CANDIDATE, never an authorization grant.
-- The legacy role 'Employee' is not equivalent to an approved scoped 'user'.
WITH historical AS (
 SELECT legacy.user_id,legacy.role AS legacy_role,
        legacy.created_at AS legacy_created_at,
        legacy.updated_at AS legacy_updated_at,
        public.current_workspace_id(legacy.user_id) AS workspace_id,
        p.status AS profile_status
 FROM public.module_role_assignments legacy
 JOIN public.profiles p ON p.id=legacy.user_id
 WHERE legacy.module_id='charter-navigator' AND legacy.enabled IS TRUE
), reconciled AS (
 SELECT h.*,
        scoped.role AS scoped_role,scoped.enabled AS scoped_enabled,
        scoped.updated_at AS scoped_updated_at,
        EXISTS(SELECT 1 FROM public.workspace_members wm
          WHERE wm.user_id=h.user_id AND wm.workspace_id=h.workspace_id
            AND wm.active IS TRUE) AS active_member,
        public.apsyntra_charter_current_role(h.user_id,h.workspace_id) AS effective_charter_role,
        public.has_module_access('charter-navigator',h.user_id) AS effective_access
 FROM historical h
 LEFT JOIN public.apsyntra_charter_workspace_roles scoped
  ON scoped.user_id=h.user_id AND scoped.workspace_id=h.workspace_id
)
SELECT substr(encode(sha256(convert_to(user_id::text,'UTF8')),'hex'),1,16) AS qa_user_key,
       legacy_role,scoped_role,scoped_enabled,profile_status,active_member,
       effective_charter_role,effective_access,
       CASE
        WHEN profile_status IS DISTINCT FROM 'active' OR active_member IS DISTINCT FROM TRUE
          THEN 'REVIEW_INACTIVE_OR_OUT_OF_SCOPE'
        WHEN scoped_role IS NOT NULL THEN 'EXISTING_SCOPED_DECISION'
        ELSE 'INTENT_NOT_CONFIRMED'
       END AS intent_review_state,
       NULL::text AS proposed_scoped_role,
       'NOT_APPROVED'::text AS production_role_change,
       legacy_created_at,legacy_updated_at,scoped_updated_at
FROM reconciled ORDER BY intent_review_state,qa_user_key;

-- Record provenance: historical and scoped events are different sources.
SELECT coalesce(detail->>'source','legacy_central_role') AS event_source,
       detail->>'resourceId' AS resource_id,
       count(*)::int AS events,
       min(recorded_at) AS first_event,
       max(recorded_at) AS last_event
FROM public.apsyntra_role_change_audit
WHERE detail->>'resourceId'='charter-navigator'
GROUP BY 1,2 ORDER BY event_source;

-- Authoritative expected acceptance inventory as JSON, directly consumable by
-- the offline aggregator. Store on authorized equipment; pseudonyms are stable
-- account correlation identifiers, not secret credentials.
WITH supported(module_id) AS (
 VALUES ('time-tracker'),('fueltrack-plus'),('tradelink'),
        ('toolbox-issues'),('fund-released-tracker'),('fueltrans'),
        ('order-intake'),('tool-traceability'),('material-request-hub'),
        ('aps-aims'),('employee-eval'),('charter-navigator')
), active_members AS (
 SELECT DISTINCT wm.user_id FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.active IS TRUE AND p.status='active'
  AND wm.workspace_id=public.current_workspace_id(wm.user_id)
), expected AS (
 SELECT substr(encode(sha256(convert_to(am.user_id::text,'UTF8')),'hex'),1,16) AS account_key,
        s.module_id
 FROM active_members am CROSS JOIN supported s
 WHERE public.module_role_for(s.module_id,am.user_id) IS NOT NULL
   AND public.has_module_access(s.module_id,am.user_id) IS TRUE
)
SELECT jsonb_build_object('assignments',coalesce(jsonb_agg(jsonb_build_object(
 'accountKey',account_key,'moduleId',module_id)
 ORDER BY account_key,module_id),'[]'::jsonb)) AS expected_acceptance_matrix
FROM expected;
