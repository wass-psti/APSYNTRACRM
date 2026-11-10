-- Disposable PostgreSQL only: run after fixture, core migration, link migration.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$
declare b uuid:='7af78b3f-67bf-4600-9aa1-9006d19d486e';
 r jsonb; rr jsonb; rid uuid; iid uuid; prior integer; denied boolean:=false;
begin
 if not public.work_board_access(b,'view') or public.work_board_access(b,'edit') then
  raise exception 'USER_BOARD_VIEW_ONLY_FIXTURE_INVALID';
 end if;
 select count(*) into prior from public.work_board_items;
 r:=public.fueltrack_v3_submit(b,'88888888-8888-4888-8888-888888888888',
 'vehicle','{"plate":"GBA 8424","owner":"Person B","origin":"Office","destination":"Depot","purpose":"Required transport fuel"}'::jsonb);
 rid:=(r->>'id')::uuid;iid:=(r->>'boardItemId')::uuid;
 if iid is null or not exists(select 1 from public.work_board_items
  where id=iid and board_id=b and notes='FuelTrack v3 request: '||rid::text||E'\nState: submitted')
 then raise exception 'BOARD_LINK_NOT_CREATED';end if;
 rr:=public.fueltrack_v3_submit(b,'88888888-8888-4888-8888-888888888888',
 'vehicle','{"plate":"GBA 8424","owner":"Person B","origin":"Office","destination":"Depot","purpose":"Required transport fuel"}'::jsonb);
 if rr->>'boardItemId'<>iid::text or rr->>'idempotent'<>'true'
  or (select count(*) from public.work_board_items)<>prior+1
 then raise exception 'BOARD_DUPLICATE_ON_RETRY';end if;
 begin
  perform public.fueltrack_v3_attach_receipt(b,rid,b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000000.jpg',
   'receipt.jpg','image/jpeg',512);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'USER_RECEIPT_REGISTRATION_ALLOWED';end if;
 rr:=public.fueltrack_v3_receipt_read(b,rid);
 if rr->>'status'<>'NO_RECEIPT' then raise exception 'USER_READ_UNEXPECTED';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$
declare b uuid:='7af78b3f-67bf-4600-9aa1-9006d19d486e';
 r jsonb; rid uuid; iid uuid; path text; rr jsonb; denied boolean; v_deleted integer;
begin
 if not public.work_board_access(b,'view') or public.work_board_access(b,'edit') then
  raise exception 'ADMIN_BOARD_VIEW_ONLY_FIXTURE_INVALID';
 end if;
 denied:=false;
 begin
  perform public.wm_add_board_item(b,'dddddddd-dddd-4ddd-8ddd-eeeeeeeeeeee','Generic item');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ADMIN_GENERIC_BOARD_EDIT_ALLOWED';end if;
 r:=public.fueltrack_v3_read(b,200);
 select (row->>'id')::uuid,(row->>'board_item_id')::uuid into rid,iid
 from jsonb_array_elements(r->'rows') as row
 where row->'details'->>'plate'='GBA 8424' limit 1;
 -- The existing read projection is extended below; fallback direct test if needed.
 if rid is null then raise exception 'REQUEST_ID_MISSING';end if;
 if iid is null then
  -- Read identity comes from guarded prepare, not direct database access.
  iid:=null;
 end if;
 r:=public.fueltrack_v3_decide(b,rid,1,'approved');
 if r->>'state'<>'approved' then raise exception 'APPROVAL_FAILED';end if;
 -- No Storage prepare before actual physical refueling.
 denied:=false;
 begin perform public.fueltrack_v3_receipt_prepare(b,rid);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'PREMATURE_RECEIPT_PREPARE_ALLOWED';end if;
 r:=public.fueltrack_v3_mark_refueled(b,rid,2);
 if r->>'state'<>'refueling_done' then raise exception 'MARK_REFUEL_FAILED';end if;
 rr:=public.fueltrack_v3_receipt_prepare(b,rid);
 iid:=(rr->>'boardItemId')::uuid;
 if rr->>'status'<>'VERIFIED_RECEIPT_PREPARE' or iid is null then
  raise exception 'RECEIPT_PREPARE_FAILED';end if;
 if not public.fueltrack_v3_receipt_storage_upload_allowed(
  b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000001.jpg',
  '{"mimetype":"image/jpeg","size":512}'::jsonb
 ) then raise exception 'ADMIN_VIEWER_RECEIPT_UPLOAD_NOT_AUTHORIZED';end if;
 if public.fueltrack_v3_receipt_storage_upload_allowed(
  b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000003.jpg',
  '{"mimetype":"image/jpeg","size":5242881}'::jsonb
 ) or public.fueltrack_v3_receipt_storage_upload_allowed(
  b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000004.jpg',
  '{"mimetype":"image/png","size":512}'::jsonb
 ) then raise exception 'INVALID_RECEIPT_STORAGE_METADATA_ALLOWED';end if;
 insert into storage.objects(bucket_id,name,owner_id,metadata) values
  ('work-board-files',b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000001.jpg',
   auth.uid()::text,'{"mimetype":"image/jpeg","size":512}'::jsonb);
 if not public.fueltrack_v3_receipt_storage_upload_allowed(
  b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000001.jpg',
  '{"mimetype":"image/jpeg","size":512}'::jsonb
 ) then raise exception 'ORPHAN_PREDICATE_FALSE_AFTER_INSERT';end if;
 delete from storage.objects where bucket_id='work-board-files'
  and name=b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000001.jpg';
 get diagnostics v_deleted=row_count;
 if v_deleted<>1 then raise exception 'FUELTRACK_ORPHAN_CLEANUP_FAILED';end if;
 if not exists
  (select 1 from public.work_board_items where id=iid and
   notes='FuelTrack v3 request: '||rid::text||E'\nState: refueling_done')
 then raise exception 'BOARD_REFUEL_SYNC_FAILED';end if;
 path:=b::text||'/'||iid::text||'/f0000000-0000-4000-8000-000000000000.jpg';
 denied:=false;
 begin perform public.fueltrack_v3_attach_receipt(b,rid,path,'receipt.jpg','image/jpeg',512);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'MISSING_STORAGE_OBJECT_ALLOWED';end if;
 insert into storage.objects(bucket_id,name,owner_id,metadata) values
  ('work-board-files',path,auth.uid()::text,'{"mimetype":"image/jpeg","size":512}'::jsonb);
 denied:=false;
 begin perform public.fueltrack_v3_register_board_item_file(
  b,iid,path,'receipt.jpg','image/jpeg',512);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FUELTRACK_FILE_HELPER_EXPOSED';end if;
 denied:=false;
 begin perform public.wm_register_board_item_file(iid,path,'receipt.jpg','image/jpeg',512);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ADMIN_GENERIC_BOARD_FILE_EDIT_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_attach_receipt(b,rid,path,'receipt.jpg','image/png',512);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'MIME_MISMATCH_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_attach_receipt(b,rid,path,'receipt.jpg','image/jpeg',1024);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'SIZE_MISMATCH_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_attach_receipt(b,rid,path,
   'receipt.png','image/png',512);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'STORAGE_SUFFIX_MISMATCH_ALLOWED';end if;
 r:=public.fueltrack_v3_attach_receipt(b,rid,path,'receipt.jpg','image/jpeg',512);
 if r->>'status'<>'VERIFIED_RECEIPT' or
  not exists(select 1 from public.work_board_item_files where storage_path=path)
 then raise exception 'RECEIPT_ATTACH_FAILED';end if;
 delete from storage.objects where bucket_id='work-board-files' and name=path;
 get diagnostics v_deleted=row_count;
 if v_deleted<>0 then raise exception 'REGISTERED_RECEIPT_DELETION_BYPASSED';end if;
 rr:=public.fueltrack_v3_attach_receipt(b,rid,path,'receipt.jpg','image/jpeg',512);
 if rr->>'idempotent'<>'true' or rr->>'fileId'<>r->>'fileId' then
  raise exception 'RECEIPT_REPLAY_FAILED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_attach_receipt(b,rid,
  b::text||'/'||iid::text||'/f0000000-0000-4000-8000-111111111111.png',
  'another.png','image/png',512);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'SECOND_RECEIPT_ALLOWED';end if;
 rr:=public.fueltrack_v3_receipt_read(b,rid);
 if rr->>'storagePath'<>path then raise exception 'PRIVATE_RECEIPT_READ_FAILED';end if;
 r:=public.fueltrack_v3_complete(b,rid,3,500,10,'INV-003');
 if r->>'state'<>'completed' or
  not exists(select 1 from public.work_board_items where id=iid and
   notes='FuelTrack v3 request: '||rid::text||E'\nState: completed')
 then raise exception 'BOARD_COMPLETION_SYNC_FAILED';end if;
 denied:=false;
 begin
  update public.work_board_items set notes='Human-edited content' where id=iid;
  perform public.fueltrack_v3_decide(b,rid,4,'rejected','illegal state');
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'INVALID_STATE_ALLOWED';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
do $$
declare denied boolean:=false;
begin
 begin perform public.fueltrack_v3_receipt_read(
  '7af78b3f-67bf-4600-9aa1-9006d19d486e','88888888-8888-4888-8888-888888888888');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FOREIGN_WORKSPACE_RECEIPT_ALLOWED';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
do $$
declare denied boolean:=false;
begin
 begin perform public.fueltrack_v3_attach_receipt(
  '7af78b3f-67bf-4600-9aa1-9006d19d486e',
  '88888888-8888-4888-8888-888888888888',
  'invalid','invalid.jpg','image/jpeg',100);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ANONYMOUS_ATTACH_ALLOWED';end if;
end $$;
reset role;
select 'FT3_BOARD_STORAGE_ACCEPTANCE_PASS' as result;
