do $cleanup$
declare
  v_user uuid := '1b2674da-e106-40d9-ab1d-1ecfeb3d76e9';
  v_main_workspace uuid := '034b97b8-aff8-4348-b994-e816e1d5bc1a';
  v_ot_request uuid := '69f17f9e-80c6-4297-930d-672f8e4986b6';
  v_rows integer;
begin
  if (select count(*) from auth.users where id=v_user and lower(email)='apsyntra-timetracker-qa@example.com') <> 1 then raise exception 'Target QA auth account did not match the verified identity'; end if;
  if (select count(*) from public.timetracker_ot_requests where id=v_ot_request and owner_id=v_user and submission_source='manual_admin' and status='Submitted' and reason='QA test - CP-TT-MANUAL-OT-INVESTIGATION-03B-R6C employee readback') <> 1 then raise exception 'The exact QA-only manual OT test request changed; cleanup aborted'; end if;
  if (select count(*) from public.timetracker_ot_audit where event_id=63 and request_id=v_ot_request and event='submitted' and details->>'ownerId'=v_user::text) <> 1 then raise exception 'The exact linked QA audit event changed; cleanup aborted'; end if;
  if (select count(*) from private.ws01_events where id=33 and actor_id=v_user and workspace_id='00000000-0000-4000-8000-000000000001' and action='workspace.selected') <> 1 then raise exception 'The exact QA workspace-selection event changed; cleanup aborted'; end if;
  if (select count(*) from private.ws02_personal_workspaces pw join public.workspaces w on w.id=pw.workspace_id where pw.user_id=v_user and pw.workspace_id=v_main_workspace and w.name='Main Workspace' and (select count(*) from public.work_boards b where b.workspace_id=w.id)=0 and (select count(*) from public.workspace_members m where m.workspace_id=w.id)=1 and exists(select 1 from public.workspace_members m where m.workspace_id=w.id and m.user_id=v_user and m.active)) <> 1 then raise exception 'The QA account personal workspace is not the verified empty single-member workspace; cleanup aborted'; end if;
  if (select count(*) from private.ws01_member_roles where user_id=v_user) <> 2 then raise exception 'Unexpected QA workspace role mappings; cleanup aborted'; end if;
  if (select count(*) from private.ws02d_member_access where user_id=v_user) <> 1 then raise exception 'Unexpected QA workspace access mappings; cleanup aborted'; end if;
  if (select count(*) from private.ws02_provision_events where id=5 and user_id=v_user and workspace_id=v_main_workspace) <> 1 then raise exception 'The QA workspace provisioning event changed; cleanup aborted'; end if;
  if exists(select 1 from auth.sessions where user_id::text=v_user::text) or exists(select 1 from auth.refresh_tokens where user_id::text=v_user::text) or exists(select 1 from storage.objects where owner_id::text=v_user::text) then raise exception 'Unexpected live session or owned storage object; cleanup aborted'; end if;

  alter table public.timetracker_ot_audit disable trigger tt_ot_audit_immutable;
  delete from public.timetracker_ot_audit where event_id=63 and request_id=v_ot_request and event='submitted' and details->>'ownerId'=v_user::text;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one QA OT audit event; removed %', v_rows; end if;
  alter table public.timetracker_ot_audit enable trigger tt_ot_audit_immutable;

  delete from public.timetracker_ot_requests where id=v_ot_request and owner_id=v_user and submission_source='manual_admin' and reason='QA test - CP-TT-MANUAL-OT-INVESTIGATION-03B-R6C employee readback';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one QA OT request; removed %', v_rows; end if;
  delete from private.ws01_events where id=33 and actor_id=v_user and workspace_id='00000000-0000-4000-8000-000000000001' and action='workspace.selected';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one QA workspace-selection event; removed %', v_rows; end if;
  delete from private.ws01_member_roles where user_id=v_user;
  get diagnostics v_rows = row_count;
  if v_rows <> 2 then raise exception 'Expected to remove exactly two QA workspace role mappings; removed %', v_rows; end if;
  delete from private.ws02d_member_access where user_id=v_user;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one QA workspace access mapping; removed %', v_rows; end if;
  delete from private.ws02_personal_workspaces where user_id=v_user and workspace_id=v_main_workspace;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one QA personal workspace mapping; removed %', v_rows; end if;
  delete from private.ws02_provision_events where id=5 and user_id=v_user and workspace_id=v_main_workspace;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one QA workspace provisioning event; removed %', v_rows; end if;
  delete from public.workspaces where id=v_main_workspace and name='Main Workspace';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to remove exactly one empty QA personal workspace; removed %', v_rows; end if;
  delete from auth.users where id=v_user and lower(email)='apsyntra-timetracker-qa@example.com';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Expected to permanently delete exactly one QA auth account; removed %', v_rows; end if;
  if exists(select 1 from auth.users where id=v_user) or exists(select 1 from public.profiles where id=v_user) then raise exception 'QA account or profile remains after deletion'; end if;
end;
$cleanup$;