-- Disposable PostgreSQL 17 fixture for CP-BOARD-IMPORT-SYNC-01.
-- Contains synthetic rows only; never connects to the Supabase project.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.test_board_access (
  board_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (board_id, user_id)
);
CREATE OR REPLACE FUNCTION public.work_board_access(p_board_id uuid, p_required text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_required = 'view' AND EXISTS (
    SELECT 1 FROM public.test_board_access a
    WHERE a.board_id = p_board_id AND a.user_id = auth.uid()
  )
$$;

CREATE TABLE public.work_board_columns (
  id uuid PRIMARY KEY,
  board_id uuid NOT NULL
);
CREATE TABLE public.work_board_item_values (
  item_id uuid NOT NULL,
  column_id uuid NOT NULL,
  value jsonb,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, column_id)
);
CREATE TABLE public.work_board_items (
  id uuid PRIMARY KEY,
  board_id uuid NOT NULL,
  group_id uuid NOT NULL,
  title text NOT NULL,
  status text,
  assignee_id uuid,
  due_date date,
  notes text NOT NULL DEFAULT '',
  position integer NOT NULL,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_board_items_board_position_id_idx
  ON public.work_board_items (board_id, position, id);

INSERT INTO public.test_board_access(board_id,user_id) VALUES
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
INSERT INTO public.work_board_columns(id,board_id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333');
INSERT INTO public.work_board_items(
 id,board_id,group_id,title,position,archived_at,created_by,updated_by
) VALUES
 ('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','Active 1',1,NULL,'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('10000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','Active 2',2,NULL,'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('10000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','Archived 1',3,now(),'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('10000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555','Active 3',4,NULL,'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('20000000-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','Foreign 1',1,NULL,'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('20000000-0000-4000-8000-000000000002','33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','Foreign 2',2,NULL,'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');
INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by) VALUES
 ('10000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','"cell-1"','11111111-1111-4111-8111-111111111111'),
 ('10000000-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','"cell-4"','11111111-1111-4111-8111-111111111111'),
 ('20000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','"foreign"','11111111-1111-4111-8111-111111111111');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
-- Seed the existing RPC contract and grants before applying CREATE OR REPLACE.
-- The migration must retain the established authenticated-only execute grant.
CREATE OR REPLACE FUNCTION public.wm_get_board_items_page(
  p_board_id uuid,
  p_after_position integer DEFAULT NULL::integer,
  p_after_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 200
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'Disposable pre-migration function stub.';
END;
$$;
REVOKE ALL ON FUNCTION public.wm_get_board_items_page(uuid,integer,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wm_get_board_items_page(uuid,integer,uuid,integer) TO authenticated;
