-- CP-BOARD-CONFIG01: extend only the disposable COL01 fixture (not production).
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS private;
ALTER TABLE public.work_boards
 ADD COLUMN status text NOT NULL DEFAULT 'active',
 ADD COLUMN name text NOT NULL DEFAULT 'Demo Board',
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 ADD COLUMN updated_by uuid;
UPDATE public.work_boards SET
 name=CASE WHEN id='30000000-0000-4000-8000-000000000001' THEN
   'TimeTracker Attendance' ELSE 'Foreign Board' END,
 updated_by='20000000-0000-4000-8000-000000000001';

CREATE TABLE public.work_board_columns(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 column_key text NOT NULL,
 name text NOT NULL,
 data_type text NOT NULL,
 system_key text,
 position integer NOT NULL DEFAULT 0,
 visible boolean NOT NULL DEFAULT true,
 required boolean NOT NULL DEFAULT false,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(board_id,column_key)
);
ALTER TABLE public.work_board_items
 ADD COLUMN status text;
CREATE TABLE public.work_board_item_values(
 item_id uuid NOT NULL REFERENCES public.work_board_items(id),
 column_id uuid NOT NULL REFERENCES public.work_board_columns(id) ON DELETE CASCADE,
 value jsonb,
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,column_id)
);
ALTER TABLE public.work_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_item_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_board_columns,public.work_board_item_values FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.work_board_normalize_column_config(
 p_type text,p_config jsonb
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $$
BEGIN
 IF p_type NOT IN ('text','long_text','number','status','dropdown','date','people',
   'checkbox','url','email','timeline') THEN
  RAISE EXCEPTION 'Unsupported column type' USING ERRCODE='22023';
 END IF;
 IF p_type='status' THEN
  RETURN pg_catalog.jsonb_build_object('labels',
   coalesce(p_config->'labels','[]'::jsonb),
   'default_label_id',p_config->'default_label_id');
 END IF;
 IF p_type='dropdown' THEN
  IF p_config IS NULL OR jsonb_typeof(p_config->'options')<>'array' THEN
   RETURN '{"options":["Option 1","Option 2"]}'::jsonb;
  END IF;
  RETURN jsonb_build_object('options',p_config->'options');
 END IF;
 RETURN '{}'::jsonb;
END $$;

INSERT INTO public.work_board_columns
(board_id,column_key,name,data_type,system_key,position,created_by,updated_by)
VALUES
('30000000-0000-4000-8000-000000000001','col_seeded','Attendance Ref','text',NULL,0,
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000001','title','Primary', 'text','title',1,
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');

-- Minimal legacy mutation signatures to exercise privilege retirement.
CREATE FUNCTION public.wm_add_board_column(uuid,text,text,jsonb) RETURNS uuid
 LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.wm_add_board_column_at(uuid,text,text,jsonb,integer) RETURNS uuid
 LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.wm_change_board_column_type(uuid,text,jsonb,boolean) RETURNS void
 LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.wm_delete_board_column(uuid) RETURNS void
 LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.wm_duplicate_board_column(uuid,boolean) RETURNS uuid
 LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.wm_move_board_column(uuid,integer) RETURNS void
 LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.wm_update_board_column(uuid,text,jsonb,boolean) RETURNS void
 LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON FUNCTION public.wm_add_board_column(uuid,text,text,jsonb),
 public.wm_add_board_column_at(uuid,text,text,jsonb,integer),
 public.wm_change_board_column_type(uuid,text,jsonb,boolean),
 public.wm_delete_board_column(uuid),
 public.wm_duplicate_board_column(uuid,boolean),
 public.wm_move_board_column(uuid,integer),
 public.wm_update_board_column(uuid,text,jsonb,boolean) TO authenticated;
-- PostgreSQL functions have PUBLIC EXECUTE by default; the production baseline
-- already revokes it. Make the disposable baseline match that contract.
REVOKE EXECUTE ON FUNCTION public.wm_add_board_column(uuid,text,text,jsonb),
 public.wm_add_board_column_at(uuid,text,text,jsonb,integer),
 public.wm_change_board_column_type(uuid,text,jsonb,boolean),
 public.wm_delete_board_column(uuid),
 public.wm_duplicate_board_column(uuid,boolean),
 public.wm_move_board_column(uuid,integer),
 public.wm_update_board_column(uuid,text,jsonb,boolean) FROM PUBLIC;

-- Fixture for destructive-status-label rejection and allowed non-destructive rename.
INSERT INTO public.work_board_columns(
 board_id,column_key,name,data_type,position,config,created_by,updated_by)
VALUES ('30000000-0000-4000-8000-000000000001','custom:fixture-status','Recorded status',
 'status',2,'{"labels":[{"id":"alpha","label":"Alpha"}]}'::jsonb,
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by)
SELECT '40000000-0000-4000-8000-000000000001',id,'"alpha"'::jsonb,
 '20000000-0000-4000-8000-000000000001'
 FROM public.work_board_columns WHERE column_key='custom:fixture-status';
