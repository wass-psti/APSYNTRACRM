DO $assert$ BEGIN
 IF (SELECT count(*) FROM auth.users WHERE id='1b2674da-e106-40d9-ab1d-1ecfeb3d76e9' AND email='not-the-qa-account@example.com')<>1
 THEN RAISE EXCEPTION 'Mismatched QA identity was unexpectedly changed'; END IF;
END; $assert$;