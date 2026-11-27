-- Independent non-QA data used to prove both skip and exact cleanup preserve unrelated rows.
INSERT INTO auth.users (id,email) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unrelated@example.com');
INSERT INTO public.profiles (id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.workspaces (id,name) VALUES
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Unrelated Workspace');
INSERT INTO public.workspace_members (workspace_id,user_id,active) VALUES
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO public.work_boards (id,workspace_id) VALUES
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.timetracker_ot_requests (id,owner_id,submission_source,status,reason) VALUES
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'manual_admin','Submitted','Unrelated record preservation fixture');
INSERT INTO public.timetracker_ot_audit (event_id,request_id,event,details) VALUES
(64,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','submitted',
'{"ownerId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb);
INSERT INTO private.ws01_events (id,actor_id,workspace_id,action) VALUES
(34,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'00000000-0000-4000-8000-000000000002','workspace.selected');
INSERT INTO private.ws01_member_roles (user_id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO private.ws02d_member_access (user_id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO private.ws02_personal_workspaces (user_id,workspace_id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO private.ws02_provision_events (id,user_id,workspace_id) VALUES
(6,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO auth.sessions (user_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO auth.refresh_tokens (user_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO storage.objects (owner_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
