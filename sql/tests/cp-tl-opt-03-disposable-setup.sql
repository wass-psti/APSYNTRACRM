-- Disposable PostgreSQL 17 fixture for CP-TL-OPT-03A; no production connection.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE auth.sessions (user_id uuid);
CREATE TABLE auth.refresh_tokens (user_id uuid);
CREATE TABLE storage.objects (owner_id uuid);
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.workspaces (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.workspace_members (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.work_boards (id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE);
CREATE TABLE public.timetracker_ot_requests (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, submission_source text NOT NULL,
  status text NOT NULL, reason text NOT NULL
);
CREATE TABLE public.timetracker_ot_audit (
  event_id integer PRIMARY KEY, request_id uuid NOT NULL, event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE private.ws01_events (
  id integer PRIMARY KEY, actor_id uuid NOT NULL, workspace_id uuid NOT NULL, action text NOT NULL
);
CREATE TABLE private.ws02_personal_workspaces (user_id uuid NOT NULL, workspace_id uuid NOT NULL);
CREATE TABLE private.ws01_member_roles (id bigserial PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE private.ws02d_member_access (id bigserial PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE private.ws02_provision_events (id integer PRIMARY KEY, user_id uuid NOT NULL, workspace_id uuid NOT NULL);
CREATE FUNCTION public.reject_immutable_audit_delete()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Immutable audit trigger was not disabled for the certified cleanup';
END;
$function$;
CREATE TRIGGER tt_ot_audit_immutable BEFORE DELETE ON public.timetracker_ot_audit
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_audit_delete();
