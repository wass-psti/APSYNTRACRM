INSERT INTO auth.users (id,email) VALUES
('1b2674da-e106-40d9-ab1d-1ecfeb3d76e9','apsyntra-timetracker-qa@example.com');
INSERT INTO public.profiles (id) VALUES ('1b2674da-e106-40d9-ab1d-1ecfeb3d76e9');
INSERT INTO public.workspaces (id,name) VALUES ('034b97b8-aff8-4348-b994-e816e1d5bc1a','Main Workspace');
INSERT INTO public.workspace_members (workspace_id,user_id,active) VALUES ('034b97b8-aff8-4348-b994-e816e1d5bc1a','1b2674da-e106-40d9-ab1d-1ecfeb3d76e9',true);
INSERT INTO private.ws02_personal_workspaces (user_id,workspace_id) VALUES ('1b2674da-e106-40d9-ab1d-1ecfeb3d76e9','034b97b8-aff8-4348-b994-e816e1d5bc1a');
INSERT INTO public.timetracker_ot_requests (id,owner_id,submission_source,status,reason) VALUES
('69f17f9e-80c6-4297-930d-672f8e4986b6','1b2674da-e106-40d9-ab1d-1ecfeb3d76e9','manual_admin','Submitted','QA test - CP-TT-MANUAL-OT-INVESTIGATION-03B-R6C employee readback');
INSERT INTO public.timetracker_ot_audit (event_id,request_id,event,details) VALUES
(63,'69f17f9e-80c6-4297-930d-672f8e4986b6','submitted','{"ownerId":"1b2674da-e106-40d9-ab1d-1ecfeb3d76e9"}'::jsonb);
INSERT INTO private.ws01_events (id,actor_id,workspace_id,action) VALUES
(33,'1b2674da-e106-40d9-ab1d-1ecfeb3d76e9','00000000-0000-4000-8000-000000000001','workspace.selected');
INSERT INTO private.ws01_member_roles (user_id) VALUES
('1b2674da-e106-40d9-ab1d-1ecfeb3d76e9'),('1b2674da-e106-40d9-ab1d-1ecfeb3d76e9');
INSERT INTO private.ws02d_member_access (user_id) VALUES ('1b2674da-e106-40d9-ab1d-1ecfeb3d76e9');
INSERT INTO private.ws02_provision_events (id,user_id,workspace_id) VALUES
(5,'1b2674da-e106-40d9-ab1d-1ecfeb3d76e9','034b97b8-aff8-4348-b994-e816e1d5bc1a');
