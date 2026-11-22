-- Seed a completed legacy OJT record between the PIN-era migrations and
-- the dropdown-only forward migration. This proves the forward migration
-- preserves attendance and snapshots the historical display name.
INSERT INTO private.tt_ojt_shared_accounts(
 workspace_id,board_id,shared_user_id,enabled,updated_by)
VALUES(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'd613280d-907b-418f-b872-c0f6dd53e580',true,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO private.tt_ojt_interns(
 id,workspace_id,board_id,shared_user_id,display_name,pin_hash,
 active,created_by)
VALUES(
 '11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'd613280d-907b-418f-b872-c0f6dd53e580',
 'Legacy Intern','legacy-test-hash-not-a-credential',false,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO private.tt_ojt_attendance(
 id,workspace_id,board_id,shared_user_id,intern_id,
 clock_in_at,clock_out_at,location,work_note,
 clock_in_geo,clock_out_geo,clock_in_actor,clock_out_actor)
VALUES(
 '22222222-2222-4222-8222-222222222222',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
 'd613280d-907b-418f-b872-c0f6dd53e580',
 '11111111-1111-4111-8111-111111111111',
 '2026-11-22T08:00:00Z','2026-11-22T17:00:00Z',
 'Office-Base Duty',NULL,
 '{"status":"captured","latitude":25.2,"longitude":55.3,"accuracy":5,"capturedAt":"2026-11-22T08:00:00Z"}'::jsonb,
 '{"status":"captured","latitude":25.2,"longitude":55.3,"accuracy":5,"capturedAt":"2026-11-22T17:00:00Z"}'::jsonb,
 'd613280d-907b-418f-b872-c0f6dd53e580',
 'd613280d-907b-418f-b872-c0f6dd53e580'
);
