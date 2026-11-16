\set ON_ERROR_STOP on

ALTER TABLE public.profiles
  ADD COLUMN email text,
  ADD COLUMN display_name text,
  ADD COLUMN status text NOT NULL DEFAULT 'active';

UPDATE public.profiles
SET email='fm1-operator@example.invalid',display_name='FM1 Operator',status='active'
WHERE id='00000000-0000-4000-8000-000000000002';

INSERT INTO public.profiles(id,email,display_name,status)
VALUES
 ('00000000-0000-4000-8000-000000000003','fm1-assignee@example.invalid','FM1 Assignee','active'),
 ('00000000-0000-4000-8000-000000000004','fm1-nonmember@example.invalid','FM1 Nonmember','active');

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,user_id)
);

INSERT INTO public.workspace_members(workspace_id,user_id,active)
VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',true);
