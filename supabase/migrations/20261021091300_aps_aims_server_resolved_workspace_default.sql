ALTER TABLE public.aps_aims_entities ALTER COLUMN workspace_id SET DEFAULT public.current_workspace_id(auth.uid());;
