-- CP-FRT-SEC10-CI04. Existing production FRT DDL/SELECT RLS metadata snapshot (2026-10-31).
-- DISPOSABLE CI ONLY. No production data is included. Never apply to production.

CREATE TABLE public.frt_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  fund_request_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  object_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  category text DEFAULT 'supporting_document'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.frt_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  fund_request_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.frt_memberships (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  department text,
  display_name text,
  email text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.frt_attachments ADD CONSTRAINT frt_attachments_file_size_check CHECK ((file_size >= 0));
ALTER TABLE public.frt_attachments ADD CONSTRAINT frt_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.frt_attachments ADD CONSTRAINT frt_attachments_object_path_key UNIQUE (object_path);
ALTER TABLE public.frt_comments ADD CONSTRAINT frt_comments_body_check CHECK (((length(body) >= 1) AND (length(body) <= 4000)));
ALTER TABLE public.frt_comments ADD CONSTRAINT frt_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.frt_memberships ADD CONSTRAINT frt_memberships_role_check CHECK ((role = ANY (ARRAY['REQUESTOR'::text, 'FINANCE_MANAGER'::text, 'FINANCE_APPROVER'::text, 'GENERAL_MANAGER'::text])));
ALTER TABLE public.frt_memberships ADD CONSTRAINT frt_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])));
ALTER TABLE public.frt_memberships ADD CONSTRAINT frt_memberships_pkey PRIMARY KEY (workspace_id, user_id);
ALTER TABLE public.frt_attachments ADD CONSTRAINT frt_attachments_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES frt_requests(id) ON DELETE CASCADE;
ALTER TABLE public.frt_attachments ADD CONSTRAINT frt_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.frt_attachments ADD CONSTRAINT frt_attachments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.frt_comments ADD CONSTRAINT frt_comments_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES frt_requests(id) ON DELETE CASCADE;
ALTER TABLE public.frt_comments ADD CONSTRAINT frt_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.frt_comments ADD CONSTRAINT frt_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.frt_memberships ADD CONSTRAINT frt_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.frt_memberships ADD CONSTRAINT frt_memberships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.frt_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.frt_attachments FROM PUBLIC,anon,authenticated;
CREATE POLICY frt_member_select ON public.frt_attachments FOR SELECT TO authenticated USING (private.frt_has_membership(workspace_id));
ALTER TABLE public.frt_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.frt_comments FROM PUBLIC,anon,authenticated;
CREATE POLICY frt_member_select ON public.frt_comments FOR SELECT TO authenticated USING (private.frt_has_membership(workspace_id));
ALTER TABLE public.frt_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.frt_memberships FROM PUBLIC,anon,authenticated;
CREATE POLICY frt_membership_self_or_gm_select ON public.frt_memberships FOR SELECT TO authenticated USING ((private.frt_has_membership(workspace_id) AND ((user_id = auth.uid()) OR private.frt_has_role(workspace_id, VARIADIC ARRAY['GENERAL_MANAGER'::text]))));
-- Diagnostic SELECT grants, when used, are granted temporarily by CI04 and then revoked.
