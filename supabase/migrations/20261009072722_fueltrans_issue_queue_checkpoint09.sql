
CREATE TABLE IF NOT EXISTS public.fueltrans_issue_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 source_draft_id uuid NOT NULL,
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 160),
 description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 6000),
 steps text NOT NULL DEFAULT '' CHECK (char_length(steps) <= 4000),
 severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
 status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Investigating','Under Fix','Resolved')),
 triage_note text NOT NULL DEFAULT '' CHECK (char_length(triage_note) <= 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workspace_id,created_by,source_draft_id)
);
CREATE INDEX IF NOT EXISTS fueltrans_issue_reports_workspace_recent_idx ON public.fueltrans_issue_reports (workspace_id,created_at DESC);
ALTER TABLE public.fueltrans_issue_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fueltrans_issue_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fueltrans_issue_reports TO authenticated;
GRANT INSERT (workspace_id,created_by,source_draft_id,title,description,steps,severity) ON public.fueltrans_issue_reports TO authenticated;
GRANT UPDATE (status,triage_note) ON public.fueltrans_issue_reports TO authenticated;
CREATE OR REPLACE FUNCTION private.fueltrans_issue_timestamp_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $function$
BEGIN
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.fueltrans_issue_timestamp_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS fueltrans_issue_timestamp_v2_before ON public.fueltrans_issue_reports;
CREATE TRIGGER fueltrans_issue_timestamp_v2_before BEFORE UPDATE ON public.fueltrans_issue_reports
 FOR EACH ROW EXECUTE FUNCTION private.fueltrans_issue_timestamp_v2();
DROP POLICY IF EXISTS fueltrans_issue_reports_select ON public.fueltrans_issue_reports;
CREATE POLICY fueltrans_issue_reports_select ON public.fueltrans_issue_reports FOR SELECT TO authenticated
 USING ((created_by = (SELECT auth.uid()) AND private.fueltrans_current_role(workspace_id) IS NOT NULL)
 OR private.fueltrans_current_role(workspace_id) = 'admin');
DROP POLICY IF EXISTS fueltrans_issue_reports_insert ON public.fueltrans_issue_reports;
CREATE POLICY fueltrans_issue_reports_insert ON public.fueltrans_issue_reports FOR INSERT TO authenticated
 WITH CHECK (created_by = (SELECT auth.uid()) AND private.fueltrans_current_role(workspace_id) IS NOT NULL
 AND status = 'New' AND triage_note = '');
DROP POLICY IF EXISTS fueltrans_issue_reports_update ON public.fueltrans_issue_reports;
CREATE POLICY fueltrans_issue_reports_update ON public.fueltrans_issue_reports FOR UPDATE TO authenticated
 USING (private.fueltrans_current_role(workspace_id) = 'admin')
 WITH CHECK (private.fueltrans_current_role(workspace_id) = 'admin');
NOTIFY pgrst, 'reload schema';
;
