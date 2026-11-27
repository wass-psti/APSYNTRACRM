DO $assert$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND email='unrelated@example.com') <> 1
    OR (SELECT count(*) FROM public.profiles WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM public.workspaces WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND name='Unrelated Workspace') <> 1
    OR (SELECT count(*) FROM public.workspace_members WHERE workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND active) <> 1
    OR (SELECT count(*) FROM public.work_boards WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 1
    OR (SELECT count(*) FROM public.timetracker_ot_requests WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND reason='Unrelated record preservation fixture') <> 1
    OR (SELECT count(*) FROM public.timetracker_ot_audit WHERE event_id=64 AND request_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND details->>'ownerId'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM private.ws01_events WHERE id=34 AND actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM private.ws01_member_roles WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM private.ws02d_member_access WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM private.ws02_personal_workspaces WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND workspace_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 1
    OR (SELECT count(*) FROM private.ws02_provision_events WHERE id=6 AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM auth.sessions WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM auth.refresh_tokens WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM storage.objects WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
  THEN RAISE EXCEPTION 'Unrelated records were changed or removed'; END IF;
END; $assert$;
