-- CP-FRT-SEC08 original live production resolvers captured 2026-10-31.
-- Emergency permission-semantics rollback only. Leaves user, role and finance data intact.
-- Review separately before restoring original functions.
BEGIN;
CREATE OR REPLACE FUNCTION private.frt_current_role(p_workspace_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN p.platform_role='admin_general_manager' THEN 'GENERAL_MANAGER'
              ELSE a.role END
  FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id AND wm.workspace_id=p_workspace_id AND wm.active=true
  LEFT JOIN public.module_role_assignments a ON a.user_id=p.id AND a.module_id='fund-released-tracker' AND a.enabled=true
  WHERE p.id=(SELECT auth.uid()) AND p.status='active'
    AND (p.platform_role='admin_general_manager' OR a.role IN ('GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'))
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_user_id is not null
    and public.current_workspace_id(p_user_id) is not null
    and exists(select 1 from public.profiles p where p.id=p_user_id and p.status='active')
    and (
      public.is_platform_admin(p_user_id)
      or exists (
        select 1 from public.module_role_assignments m
        where m.user_id=p_user_id and m.module_id=p_module_id and m.enabled=true
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.is_platform_admin(p_user_id) then
    case p_module_id when 'time-tracker' then 'System Admin' when 'fueltrack-plus' then 'Admin' when 'tradelink' then 'General Manager' else 'Admin' end
  else (select m.role from public.module_role_assignments m where m.user_id=p_user_id and m.module_id=p_module_id and m.enabled=true)
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.work_board_access(p_board_id uuid, p_required text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); member_role text; ws uuid; board_ws uuid;
begin
  if caller is null then return false; end if;
  if not exists(select 1 from public.profiles p where p.id=caller and p.status='active') then return false; end if;
  select workspace_id into board_ws from public.work_boards where id=p_board_id;
  if board_ws is null then return false; end if;
  ws:=public.current_workspace_id(caller);
  if ws is null or ws<>board_ws then return false; end if;
  if public.is_platform_admin(caller) then return true; end if;
  select role into member_role from public.work_board_members where board_id=p_board_id and user_id=caller;
  if p_required='manage' then return coalesce(member_role='owner',false); end if;
  if p_required='edit' then return coalesce(member_role in ('owner','editor'),false); end if;
  if p_required='view' then return coalesce(member_role in ('owner','editor','viewer'),false); end if;
  return false;
end $function$
;
DO $$ BEGIN
 IF to_regprocedure('public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)') IS NOT NULL THEN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz) FROM authenticated';
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
