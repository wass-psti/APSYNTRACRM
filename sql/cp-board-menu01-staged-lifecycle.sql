-- CP-BOARD-MENU01 — STAGED. Requires separate production schema / permission approval.
-- Existing board records are NOT edited or deleted by this migration.
-- Re-uses the current central Auth, board RBAC, workspace isolation and event audit.
BEGIN;
DO $preflight$
BEGIN
 IF to_regnamespace('private') IS NULL OR
   to_regprocedure('private.wm_board_config_session_active()') IS NULL OR
   to_regclass('private.wm_board_protected_ids') IS NOT NULL OR
   to_regprocedure('public.wm_board_card_mutate(uuid,timestamp with time zone,text,text,text,text)') IS NOT NULL OR
   (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='wm_update_board') IS DISTINCT FROM '8a10c3d1bf40df5eb13a9ba6d529ca32' OR
   (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='wm_set_board_status') IS DISTINCT FROM 'cecef8dcd3030b1df59d57d4f48bc46f' OR
   (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='wm_delete_board_permanently') IS DISTINCT FROM 'a7524f9b9844b1f54ebb387061979670'
 THEN RAISE EXCEPTION 'CP-BOARD-MENU01 production source drift or partial deployment' USING ERRCODE='42501'; END IF;
END $preflight$;

CREATE TABLE private.wm_board_protected_ids(
 board_id uuid PRIMARY KEY REFERENCES public.work_boards(id) ON DELETE RESTRICT,
 reason text NOT NULL,
 protected_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.wm_board_protected_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.wm_board_protected_ids FROM PUBLIC,anon,authenticated;
INSERT INTO private.wm_board_protected_ids(board_id,reason)
SELECT b.id,CASE WHEN b.description LIKE '[APSYNTRA:MODULE:%' THEN 'application_contract'
 ELSE 'platform_quality_assurance' END
FROM public.work_boards b WHERE b.description LIKE '[APSYNTRA:MODULE:%'
 OR b.name='APSYNTRA QA';

CREATE FUNCTION private.wm_board_is_protected(p_board_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $guard$
 SELECT EXISTS(SELECT 1 FROM private.wm_board_protected_ids p WHERE p.board_id=p_board_id)
 OR EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
   AND (b.description LIKE '[APSYNTRA:MODULE:%' OR b.name='APSYNTRA QA'));
$guard$;
REVOKE ALL ON FUNCTION private.wm_board_is_protected(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wm_board_card_mutate(
 p_board_id uuid,p_expected_updated_at timestamptz,p_action text,
 p_name text DEFAULT NULL,p_description text DEFAULT NULL,
 p_confirm_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $board$
DECLARE b public.work_boards%rowtype; nm text:=pg_catalog.btrim(coalesce(p_name,''));
 v_at timestamptz; v_action text:=pg_catalog.btrim(coalesce(p_action,''));
BEGIN
 IF NOT private.wm_board_config_session_active()
   OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'Signed board manager permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF b.id IS NULL OR private.wm_board_is_protected(b.id) THEN
  RAISE EXCEPTION 'Application or system board lifecycle is protected' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR b.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Board changed; refresh before editing' USING ERRCODE='40001'; END IF;
 IF v_action='edit' THEN
  IF b.status NOT IN ('active','archived') OR pg_catalog.char_length(nm) NOT BETWEEN 1 AND 120
    OR p_description IS NULL OR pg_catalog.char_length(p_description)>1200 THEN
   RAISE EXCEPTION 'Invalid board name, description or lifecycle state' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.work_boards x WHERE x.workspace_id=b.workspace_id
    AND x.id<>b.id AND x.status<>'trashed'
    AND pg_catalog.lower(x.name)=pg_catalog.lower(nm)) THEN
   RAISE EXCEPTION 'Another active or archived board already has this name' USING ERRCODE='23505'; END IF;
  UPDATE public.work_boards SET name=nm,description=p_description,
   updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
   WHERE id=b.id RETURNING updated_at INTO v_at;
  PERFORM public.work_board_log(b.id,'board.updated','Board details updated',
    'board',b.id::text,pg_catalog.jsonb_build_object('name',nm));
 ELSIF v_action='trash' THEN
  IF b.status NOT IN ('active','archived') OR
    p_confirm_name IS DISTINCT FROM b.name THEN
   RAISE EXCEPTION 'Confirm the exact board name before moving to trash' USING ERRCODE='22023'; END IF;
  UPDATE public.work_boards SET status='trashed',archived_at=NULL,
    trashed_at=pg_catalog.clock_timestamp(),updated_by=auth.uid(),
    updated_at=pg_catalog.clock_timestamp()
   WHERE id=b.id RETURNING updated_at INTO v_at;
  PERFORM public.work_board_log(b.id,'board.trashed',
    'Board moved to recoverable trash','board',b.id::text,
    pg_catalog.jsonb_build_object('name',b.name,'reversible',true));
 ELSIF v_action='restore' THEN
  IF b.status NOT IN ('trashed','archived') THEN
   RAISE EXCEPTION 'Only trashed or archived boards can be restored' USING ERRCODE='22023'; END IF;
  UPDATE public.work_boards SET status='active',archived_at=NULL,trashed_at=NULL,
    updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
   WHERE id=b.id RETURNING updated_at INTO v_at;
  PERFORM public.work_board_log(b.id,'board.restored',
    'Board restored to active','board',b.id::text,
    pg_catalog.jsonb_build_object('from_status',b.status));
 ELSE
  RAISE EXCEPTION 'Unsupported board card action' USING ERRCODE='22023';
 END IF;
 RETURN pg_catalog.jsonb_build_object('boardId',b.id::text,'action',v_action,
  'status',CASE WHEN v_action='trash' THEN 'trashed'
    WHEN v_action='restore' THEN 'active' ELSE b.status END,
  'updatedAt',v_at);
END $board$;
REVOKE ALL ON FUNCTION public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)
 TO authenticated;

-- Tighten older APIs: they may not rename/trash protected boards or let editors
-- bypass the manager role. Old signatures stay compatible for existing consumers.

CREATE OR REPLACE FUNCTION public.wm_update_board(p_board_id uuid, p_name text, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.work_boards%rowtype;
begin
  if not private.wm_board_config_session_active() or not public.work_board_access(p_board_id,'manage')
   then raise exception 'Signed board management required' using errcode='42501'; end if;
  select * into b from public.work_boards where id=p_board_id for update;
  if b.id is null or private.wm_board_is_protected(b.id) or b.status='trashed'
    then raise exception 'Protected or trashed board cannot be renamed' using errcode='42501'; end if;
  if exists(select 1 from public.work_boards x
    where x.workspace_id=b.workspace_id and x.id<>b.id and x.status<>'trashed'
     and lower(x.name)=lower(btrim(coalesce(p_name,'')))) then
    raise exception 'Another board already uses this name' using errcode='23505'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  update public.work_boards set name=btrim(p_name),description=left(coalesce(p_description,''),1200),updated_by=auth.uid(),updated_at=now() where id=p_board_id;
  perform public.work_board_log(p_board_id,'board.updated','Board details updated','board',p_board_id::text,'{}');
end $function$;

CREATE OR REPLACE FUNCTION public.wm_set_board_status(p_board_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.work_boards%rowtype;
begin
  if not private.wm_board_config_session_active() or not public.work_board_access(p_board_id,'manage')
   then raise exception 'Signed board management required' using errcode='42501'; end if;
  select * into b from public.work_boards where id=p_board_id for update;
  if b.id is null or private.wm_board_is_protected(b.id) then
   raise exception 'Protected board lifecycle change denied' using errcode='42501'; end if;
  if p_status not in ('active','archived','trashed') then raise exception 'Unsupported board status'; end if;
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  update public.work_boards set status=p_status,archived_at=case when p_status='archived' then now() else null end,trashed_at=case when p_status='trashed' then now() else null end,updated_by=auth.uid(),updated_at=now() where id=p_board_id;
  perform public.work_board_log(p_board_id,'board.'||p_status,case p_status when 'active' then 'Board restored' when 'archived' then 'Board archived' else 'Board moved to trash' end,'board',p_board_id::text,'{}');
end $function$;

REVOKE ALL ON FUNCTION public.wm_update_board(uuid,text,text),
 public.wm_set_board_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_update_board(uuid,text,text),
 public.wm_set_board_status(uuid,text) TO authenticated;

-- Permanent deletion is not part of board-card management; prevent any
-- signed client from calling the old irreversible delete endpoint.
REVOKE ALL ON FUNCTION public.wm_delete_board_permanently(uuid)
 FROM PUBLIC,anon,authenticated;
DO $post$
BEGIN
 IF has_function_privilege('authenticated','public.wm_delete_board_permanently(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
   'public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)','EXECUTE')
 OR has_function_privilege('anon',
   'public.wm_board_card_mutate(uuid,timestamptz,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Board-card permission contract mismatch' USING ERRCODE='42501'; END IF;
END $post$;
COMMIT;
