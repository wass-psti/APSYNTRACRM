-- BIMP-02 disposable-only extension of CP-BOARD-CONFIG01 fixture.
-- Requires collab01 setup, config01 setup, legacy functions and hardened config SQL.
\set ON_ERROR_STOP on

CREATE TABLE public.work_board_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 title text NOT NULL,
 position integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.work_board_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_board_groups FROM PUBLIC,anon,authenticated;

ALTER TABLE public.work_board_items
 ADD COLUMN group_id uuid REFERENCES public.work_board_groups(id),
 ADD COLUMN title text NOT NULL DEFAULT 'Fixture',
 ADD COLUMN position integer NOT NULL DEFAULT 0,
 ADD COLUMN created_by uuid,
 ADD COLUMN updated_by uuid,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

INSERT INTO public.work_boards(id,workspace_id,name,status,updated_by)
VALUES ('30000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000001','BIMP-02 Disposable Ordinary Board',
 'active','20000000-0000-4000-8000-000000000001');

INSERT INTO public.work_board_members(board_id,user_id,role)
VALUES
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','editor'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','viewer');

INSERT INTO public.work_board_groups(id,board_id,title)
VALUES ('60000000-0000-4000-8000-000000000001',
'30000000-0000-4000-8000-000000000003','Import test group');

INSERT INTO public.work_board_columns(id,board_id,column_key,name,data_type,
 position,created_by,updated_by)
VALUES ('65000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000003','custom:amount',
 'Amount','number',0,'20000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001');

-- Restore genuine write behavior in the disposable fixture. The config fixture's
-- original legacy column writer is intentionally a NULL stub for grants testing.
CREATE OR REPLACE FUNCTION public.wm_add_board_group(p_board_id uuid,p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE gid uuid:=gen_random_uuid();
BEGIN
 IF NOT public.work_board_access(p_board_id,'edit') THEN
   RAISE EXCEPTION 'Board edit denied' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.work_board_groups(id,board_id,title) VALUES(gid,p_board_id,p_title);
 RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.wm_add_board_column(
 p_board_id uuid,p_name text,p_data_type text,p_config jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE cid uuid:=gen_random_uuid();
BEGIN
 IF NOT private.wm_board_config_session_active()
   OR NOT public.work_board_access(p_board_id,'manage') THEN
   RAISE EXCEPTION 'Board manage denied' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.work_board_columns(
  id,board_id,column_key,name,data_type,config,created_by,updated_by)
 VALUES(cid,p_board_id,'custom:'||cid::text,p_name,p_data_type,p_config,
  auth.uid(),auth.uid());
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.wm_add_board_group(uuid,text),
 public.wm_add_board_column(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wm_set_board_cell(
 p_item_id uuid,p_column_id uuid,p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE bid uuid;ctype text;
BEGIN
 SELECT i.board_id,c.data_type INTO bid,ctype FROM public.work_board_items i
 JOIN public.work_board_columns c ON c.board_id=i.board_id AND c.id=p_column_id
 WHERE i.id=p_item_id;
 IF bid IS NULL OR NOT public.work_board_access(bid,'edit') THEN
   RAISE EXCEPTION 'Cell edit denied' USING ERRCODE='42501';
 END IF;
 IF (ctype='number' AND jsonb_typeof(p_value)<>'number')
 OR (ctype='checkbox' AND jsonb_typeof(p_value)<>'boolean') THEN
   RAISE EXCEPTION 'Incorrect cell type' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by)
 VALUES(p_item_id,p_column_id,p_value,auth.uid())
 ON CONFLICT(item_id,column_id) DO UPDATE SET value=excluded.value,
 updated_by=excluded.updated_by,updated_at=clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION public.wm_set_board_cell(uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;

-- Only the signed, guarded atomic RPC is visible through the simulated Data API.
GRANT EXECUTE ON FUNCTION
 public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb) TO authenticated;
