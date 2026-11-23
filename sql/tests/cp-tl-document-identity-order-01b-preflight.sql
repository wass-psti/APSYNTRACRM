-- Test-only Create New capability fixture for CP-TL-DOCUMENT-IDENTITY-AND-ORDER-01B.
-- This exists only in the disposable PostgreSQL database used by this test.
\set ON_ERROR_STOP on
CREATE FUNCTION private.tl03_can_create_draft(p_board_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT auth.uid()='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
  AND p_board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid;
$function$;
REVOKE ALL ON FUNCTION private.tl03_can_create_draft(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_create_draft(uuid) TO authenticated;

UPDATE auth.users
SET email=CASE id
 WHEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' THEN 'qa-reviewer-one@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' THEN 'qa-reviewer-two@example.test'
 ELSE email END,
 email_confirmed_at=clock_timestamp()
WHERE id IN ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
             'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
