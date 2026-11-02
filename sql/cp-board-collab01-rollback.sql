-- CP-BOARD-COL01 — guarded, data-preserving rollback candidate.
-- NOT FOR EXECUTION until production activation is independently approved.
-- Baseline is pg_get_functiondef from the signed read-only 2026-11-03 preflight,
-- fingerprint 0dde086a58def1dd5437b32264c0697a.
-- Does not delete or modify board memberships or their activity history.
BEGIN;
DO $guard$
DECLARE f text;
BEGIN
 IF to_regprocedure('public.wm_add_board_member(uuid,text,text)') IS NULL
 THEN RAISE EXCEPTION 'Board membership writer missing; rollback stopped'; END IF;
 SELECT pg_get_functiondef('public.wm_add_board_member(uuid,text,text)'::regprocedure) INTO f;
 IF position('Active member of this workspace required' in f)=0 OR
    position('Board owner role cannot be reassigned' in f)=0 THEN
   RAISE EXCEPTION 'Unexpected deployed writer; cannot safely restore baseline';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='wm_board_invitable_users') THEN
   RAISE EXCEPTION 'Candidate not fully installed; abort rollback';
 END IF;
END $guard$;

-- Exact original production function definition recovered through read-only
-- pg_get_functiondef, preserving current API parameter defaults and result.
CREATE OR REPLACE FUNCTION public.wm_add_board_member(p_board_id uuid, p_email text, p_role text DEFAULT 'viewer'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare target uuid;
begin
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  if p_role not in ('editor','viewer') then raise exception 'Select Editor or Viewer'; end if;
  select id into target from public.profiles where lower(email)=lower(btrim(p_email)) and status='active';
  if target is null then raise exception 'No active Work Management account was found for that email'; end if;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(p_board_id,target,p_role,auth.uid())
  on conflict(board_id,user_id) do update set role=excluded.role,updated_at=now();
  perform public.work_board_log(p_board_id,'member.updated','Board membership updated','member',target::text,jsonb_build_object('role',p_role));
end $function$;
REVOKE ALL ON FUNCTION public.wm_add_board_member(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_add_board_member(uuid,text,text) TO authenticated;

-- Drop only additive candidate APIs, not shared board tables or Storage.
DROP FUNCTION public.wm_board_invitable_users(uuid,text);
DROP FUNCTION public.wm_list_board_item_updates(uuid,integer);
DROP FUNCTION public.wm_list_board_item_files(uuid,integer);
DROP FUNCTION public.wm_list_board_events_page(uuid,bigint,integer);

-- Verify original source and that new APIs are gone before committing.
DO $verify$
BEGIN
 IF md5(pg_get_functiondef('public.wm_add_board_member(uuid,text,text)'::regprocedure))
    <> '0dde086a58def1dd5437b32264c0697a' THEN
   RAISE EXCEPTION 'Original membership function does not match baseline';
 END IF;
 IF to_regprocedure('public.wm_board_invitable_users(uuid,text)') IS NOT NULL OR
    to_regprocedure('public.wm_list_board_item_updates(uuid,integer)') IS NOT NULL OR
    to_regprocedure('public.wm_list_board_item_files(uuid,integer)') IS NOT NULL OR
    to_regprocedure('public.wm_list_board_events_page(uuid,bigint,integer)') IS NOT NULL THEN
   RAISE EXCEPTION 'One or more candidate functions remain deployed';
 END IF;
 IF NOT has_function_privilege('authenticated',
     'public.wm_add_board_member(uuid,text,text)','EXECUTE')
 OR has_function_privilege('anon','public.wm_add_board_member(uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Membership function grants mismatch'; END IF;
END $verify$;
COMMIT;