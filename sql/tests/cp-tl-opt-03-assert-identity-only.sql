DO $assert$ BEGIN
 IF (SELECT count(*) FROM auth.users WHERE id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9' AND email='apsyntra-timetracker-qa@example.com')<>1
 OR (SELECT count(*) FROM public.profiles WHERE id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9')<>1
 THEN RAISE EXCEPTION 'Incomplete exact-identity fixture was unexpectedly changed'; END IF;
END; $assert$;