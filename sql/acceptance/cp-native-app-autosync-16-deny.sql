-- Clone-only negative path: zero signed or simulated JWT claims in this connection.
DO $tests$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  RAISE EXCEPTION 'No actor must be signed in for denial check';
 END IF;
 BEGIN
  PERFORM public.wm_admin_set_application_role(
   'a1500000-0000-4000-8000-000000000003',
   'time-tracker','Employee',true);
  RAISE EXCEPTION 'Unsigned caller unexpectedly granted role';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.wm_application_role_audit SET action='change';
  RAISE EXCEPTION 'Append-only audit unexpectedly mutable';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $tests$;
