-- Local integration candidate only. Does not replace any active RPC.
-- Capture only newly inserted immutable revisions; never backfill existing records.
CREATE FUNCTION private.tl03_gm_approval_policy(
 p_board_id uuid,p_creator uuid,p_document_type text,p_content jsonb
) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $policy$
 SELECT CASE WHEN p_creator=auth.uid()
  AND p_board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND p_document_type IN ('quotation','po')
  AND private.tl03_review_assignee(p_document_type,p_content,'primary')=
   'aacsenagan@watchdogautomation.com.ph'
  AND private.tl03_review_assignee(p_document_type,p_content,'secondary')<>''
  AND private.tl03_review_assignee(p_document_type,p_content,'secondary')<>
   'aacsenagan@watchdogautomation.com.ph'
  AND EXISTS(
   SELECT 1 FROM auth.users u
   JOIN public.profiles p ON p.id=u.id
   JOIN public.work_boards b ON b.id=p_board_id
   JOIN public.workspace_members wm ON wm.workspace_id=b.workspace_id
     AND wm.user_id=u.id AND wm.active
   WHERE u.id=p_creator AND lower(btrim(u.email))='asenagan@watchdogautomation.com.ph'
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.module_role_for('tradelink',u.id)='General Manager'
    AND public.current_workspace_id(u.id)=b.workspace_id
  ) THEN 'gm-sales-supervisor-exempt-v1' ELSE 'standard-dual-v1' END
$policy$;
REVOKE ALL ON FUNCTION private.tl03_gm_approval_policy(uuid,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;

-- Sparse revision policy: absence retains legacy dual-review semantics.
CREATE TABLE private.tradelink_revision_approval_exemptions(
 document_id uuid NOT NULL,
 revision bigint NOT NULL,
 policy text NOT NULL CHECK(policy='gm-sales-supervisor-exempt-v1'),
 recorded_by uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(document_id,revision),
 FOREIGN KEY(document_id,revision)
  REFERENCES private.tradelink_document_revision_snapshots(document_id,revision)
);
ALTER TABLE private.tradelink_revision_approval_exemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tradelink_revision_approval_exemptions FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_revision_approval_exemptions_append_only
 BEFORE UPDATE OR DELETE ON private.tradelink_revision_approval_exemptions
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_revision_snapshot_change();

CREATE FUNCTION private.tl03_capture_revision_approval_exemption()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $capture$
BEGIN
 IF NEW.updated_by=auth.uid() AND
    private.tl03_gm_approval_policy(NEW.board_id,NEW.created_by,NEW.document_type,NEW.content)
      ='gm-sales-supervisor-exempt-v1' THEN
  INSERT INTO private.tradelink_revision_approval_exemptions(document_id,revision,policy,recorded_by)
  VALUES(NEW.document_id,NEW.revision,'gm-sales-supervisor-exempt-v1',NEW.updated_by);
 END IF;
 RETURN NEW;
END $capture$;
REVOKE ALL ON FUNCTION private.tl03_capture_revision_approval_exemption() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_capture_revision_approval_exemption
 AFTER INSERT ON private.tradelink_document_revision_snapshots
 FOR EACH ROW EXECUTE FUNCTION private.tl03_capture_revision_approval_exemption();

CREATE FUNCTION private.tl03_revision_approval_policy(p_document_id uuid,p_revision bigint)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $lookup$
 SELECT coalesce((SELECT e.policy FROM private.tradelink_revision_approval_exemptions e
  WHERE e.document_id=p_document_id AND e.revision=p_revision),'standard-dual-v1')
$lookup$;
REVOKE ALL ON FUNCTION private.tl03_revision_approval_policy(uuid,bigint)
 FROM PUBLIC,anon,authenticated;

-- Review evidence is bound to the immutable snapshot and explicit stored policy.
-- A missing policy never implies exemption; historic records use standard dual.
CREATE FUNCTION private.tl03_approval_evidence_complete(
 p_document_id uuid,p_revision bigint
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $evidence$
 SELECT coalesce((
  SELECT CASE
    WHEN private.tl03_revision_approval_policy(p_document_id,p_revision)='gm-sales-supervisor-exempt-v1' THEN
      s.document_type IN ('quotation','po')
      AND private.tl03_review_assignee(s.document_type,s.content,'primary')=
       'aacsenagan@watchdogautomation.com.ph'
      AND count(*) FILTER(WHERE r.stage='primary')=0
      AND count(*) FILTER(WHERE r.stage='secondary')=1
      AND count(DISTINCT r.actor_id)=1
    WHEN private.tl03_revision_approval_policy(p_document_id,p_revision)='standard-dual-v1' THEN
      count(*) FILTER(WHERE r.stage='primary')=1
      AND count(*) FILTER(WHERE r.stage='secondary')=1
      AND count(DISTINCT r.actor_id)=2
    ELSE false END
   AND coalesce(bool_and(lower(r.assigned_email)=lower(u.email)
    AND r.assigned_email=private.tl03_review_assignee(s.document_type,s.content,r.stage)),false)
  FROM private.tradelink_document_revision_snapshots s
  JOIN private.tradelink_document_reviews r ON r.document_id=s.document_id
   AND r.document_revision=s.revision
  LEFT JOIN auth.users u ON u.id=r.actor_id
  WHERE s.document_id=p_document_id AND s.revision=p_revision
  GROUP BY s.document_type,s.content
 ),false)
$evidence$;
REVOKE ALL ON FUNCTION private.tl03_approval_evidence_complete(uuid,bigint)
 FROM PUBLIC,anon,authenticated;
