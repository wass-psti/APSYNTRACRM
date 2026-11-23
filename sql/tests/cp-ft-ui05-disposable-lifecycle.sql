-- CP-FT-UI-05: Persisted RLS acceptance using the exact checked-in FuelTrans migration.
-- ALL identities, workspaces, and tickets here exist ONLY in a disposable local container.
insert into public.workspaces (id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('99999999-9999-4999-8999-999999999999');

insert into public.profiles (id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), -- UNIOIL reporter
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), -- independent L1
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), -- independent L2
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'), -- ARAMCO client
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'); -- other workspace

insert into public.fueltrans_memberships
 (workspace_id,user_id,role,client_code,enabled) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unioil','UNIOIL',true),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','global_l1_support',null,true),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','local_l2_support',null,true),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','aramco','ARAMCO',true),
 ('99999999-9999-4999-8999-999999999999','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','admin',null,true);

-- Seed both comparison tickets as their genuine disposable identities through RLS.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
insert into public.fueltrans_tickets
 (workspace_id,id,ticket_number,client_code,created_by,status,payload,created_at,updated_at)
 values ('11111111-1111-4111-8111-111111111111','fixture-aramco','ARA-TEST-001',
 'ARAMCO','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Open',
 '{"stationId":"1071B"}'::jsonb,'2026-11-23T03:00:00Z','2026-11-23T03:00:00Z');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
insert into public.fueltrans_tickets
 (workspace_id,id,ticket_number,client_code,created_by,status,payload,created_at,updated_at)
 values ('99999999-9999-4999-8999-999999999999','fixture-other-workspace',
 'OTHER-TEST-001','UNIOIL','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Open',
 '{"stationId":"OTHER"}'::jsonb,'2026-11-23T03:00:00Z','2026-11-23T03:00:00Z');
commit;

-- Real RLS INSERT as independent reporter; check client and workspace row isolation.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
insert into public.fueltrans_tickets
 (workspace_id,id,ticket_number,client_code,created_by,status,payload,created_at,updated_at)
 values ('11111111-1111-4111-8111-111111111111','fixture-lifecycle',
 'UNI-TEST-001','UNIOIL','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Open',
 '{"stationId":"1013C","stationName":"DISPOSABLE TEST STATION","ticketStatus":"Open"}',
 '2026-11-23T03:01:00Z','2026-11-23T03:01:00Z');
do $$
begin
 if (select count(*) from public.fueltrans_tickets)<>1 then
  raise exception 'Reporter RLS returned another client or workspace';
 end if;
 if not exists (select 1 from public.fueltrans_tickets where id='fixture-lifecycle' and status='Open') then
  raise exception 'Reporter CREATE readback failed';
 end if;
 raise notice 'REPORTER_INSERT_AND_CLIENT_WORKSPACE_ISOLATION PASS';
end $$;
commit;

-- ARAMCO user cannot view/modify the UNIOIL ticket, but can view their own.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
do $$
declare affected integer;
begin
 if (select count(*) from public.fueltrans_tickets)<>1 then
  raise exception 'Other client read scope incorrect';
 end if;
 update public.fueltrans_tickets set status='Resolved'
 where workspace_id='11111111-1111-4111-8111-111111111111' and id='fixture-lifecycle';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Cross-client update accepted'; end if;
 raise notice 'CROSS_CLIENT_READ_WRITE_DENIAL PASS';
end $$;
commit;

-- L1 role makes the first persisted assignment, without disabling native policies.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$
declare affected integer;
begin
 if (select count(*) from public.fueltrans_tickets where id='fixture-lifecycle')<>1 then
  raise exception 'L1 cannot read ticket';
 end if;
 if (select count(*) from public.fueltrans_tickets where id='fixture-other-workspace')<>0 then
  raise exception 'L1 read escaped workspace boundary';
 end if;
 update public.fueltrans_tickets set status='Under L1 Review',
  assigned_l1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  payload=payload||'{"ticketStatus":"Under L1 Review","claimedL1At":"2026-11-23T03:02:00Z"}'::jsonb,
  updated_at='2026-11-23T03:02:00Z'
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and id='fixture-lifecycle' and updated_at='2026-11-23T03:01:00Z';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'L1 claim did not persist'; end if;
 if (select status from public.fueltrans_tickets where id='fixture-lifecycle')<>'Under L1 Review' then
  raise exception 'L1 claim readback mismatch';
 end if;
 raise notice 'L1_CLAIM_PERSISTENCE PASS';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$
declare affected integer;
begin
 update public.fueltrans_tickets set status='Escalated to L2',
  payload=payload||'{"ticketStatus":"Escalated to L2","l2EscalationDate":"2026-11-23T03:03:00Z"}'::jsonb,
  updated_at='2026-11-23T03:03:00Z'
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and id='fixture-lifecycle' and updated_at='2026-11-23T03:02:00Z';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'L1 escalation did not persist'; end if;
 raise notice 'L1_ESCALATION_PERSISTENCE PASS';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$
declare affected integer;
begin
 update public.fueltrans_tickets set status='Under L2 Review',
  assigned_l2='cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  payload=payload||'{"ticketStatus":"Under L2 Review","claimedL2At":"2026-11-23T03:04:00Z"}'::jsonb,
  updated_at='2026-11-23T03:04:00Z'
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and id='fixture-lifecycle' and updated_at='2026-11-23T03:03:00Z';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'L2 claim did not persist'; end if;
 raise notice 'L2_CLAIM_PERSISTENCE PASS';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$
declare affected integer;
begin
 update public.fueltrans_tickets set status='Resolved',
  payload=payload||'{"ticketStatus":"Resolved","closureDate":"2026-11-23T03:05:00Z"}'::jsonb,
  updated_at='2026-11-23T03:05:00Z'
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and id='fixture-lifecycle' and updated_at='2026-11-23T03:04:00Z';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'L2 resolution did not persist'; end if;
 -- Verify stale CAS from same role: its old timestamp is no longer valid.
 update public.fueltrans_tickets set status='Under L2 Review'
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and id='fixture-lifecycle' and updated_at='2026-11-23T03:04:00Z';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale mutation accepted'; end if;
 if (select status from public.fueltrans_tickets where id='fixture-lifecycle')<>'Resolved' then
  raise exception 'Resolution readback mismatch';
 end if;
 raise notice 'L2_RESOLUTION_AND_STALE_WRITE_DENIAL PASS';
end $$;
commit;

-- Disabling only disposable L2 membership should hide the ticket in authenticated view.
update public.fueltrans_memberships set enabled=false
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$
begin
 if (select count(*) from public.fueltrans_tickets)<>0 then
  raise exception 'Revoked L2 account still reads tickets';
 end if;
 raise notice 'LOCAL_MEMBERSHIP_REVOCATION_DENIAL PASS';
end $$;
commit;

-- No anonymous read, and full isolated database readback remains durable.
begin;
set local role anon;
do $$
begin
 begin
  perform count(*) from public.fueltrans_tickets;
  raise exception 'Anonymous ticket read unexpectedly permitted';
 exception when insufficient_privilege then null;
 end;
 raise notice 'ANON_PERMISSION_DENIAL PASS';
end $$;
commit;

do $$
declare t record;
begin
 select status,assigned_l1,assigned_l2,payload,updated_at into t
 from public.fueltrans_tickets
 where workspace_id='11111111-1111-4111-8111-111111111111'
 and id='fixture-lifecycle';
 if t.status<>'Resolved'
   or t.assigned_l1<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   or t.assigned_l2<>'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
   or t.payload->>'closureDate'<>'2026-11-23T03:05:00Z'
 then raise exception 'Final persisted record state mismatch'; end if;
 raise notice 'REAL_POSTGRES_PERSISTENCE_TWO_ACCOUNT_RLS_CLOSEOUT PASS';
end $$;
