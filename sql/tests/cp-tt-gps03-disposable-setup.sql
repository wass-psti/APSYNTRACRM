-- Disposable-only attendance writer stand-in for testing the GPS-03 RPC wrapper.
-- This function deliberately never writes a record.
CREATE FUNCTION public.commit_timetracker_attendance_action(
  p_action text, p_record_id text, p_location text, p_department text,
  p_geo jsonb, p_work_note text, p_attendance_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_record jsonb;
BEGIN
  v_record := pg_catalog.jsonb_build_object(
    'id','synthetic','ownerId','cloud:' || auth.uid()::text,
    'clockIn',pg_catalog.jsonb_build_object(
      'timestamp','2026-11-02T08:00:00+08:00','location',p_location,'geo',p_geo),
    'clockOut',NULL);
  RETURN pg_catalog.jsonb_build_object(
    'state_key','timetracker.attendance.v1','action',p_action,
    'revision',12,'committed_at','2026-11-02T08:00:00+08:00',
    'record',v_record,
    'value',pg_catalog.jsonb_build_object('version',1,'records',
      pg_catalog.jsonb_build_array(v_record))::text);
END;
$$;
REVOKE ALL ON FUNCTION public.commit_timetracker_attendance_action(
  text,text,text,text,jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_timetracker_attendance_action(
  text,text,text,text,jsonb,text,jsonb) TO authenticated;
