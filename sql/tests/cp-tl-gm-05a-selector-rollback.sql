-- Disposable recovery rehearsal only: restore eligibility selection, not historical evidence validation.
CREATE OR REPLACE FUNCTION private.tl03_gm_approval_policy(p_board_id uuid, p_creator uuid, p_document_type text, p_content jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;
