DO $assert$ BEGIN
 IF (SELECT count(*) FROM public.timetracker_ot_requests WHERE id='69f17f9e-80c6-4297-930d-672f8e4986b6')<>1
 THEN RAISE EXCEPTION 'Partial QA fixture was unexpectedly changed'; END IF;
END; $assert$;