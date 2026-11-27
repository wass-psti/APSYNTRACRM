-- Synthetic fixture only, same canonical board/group and live rate-cell shape.
create schema if not exists private;
create table public.work_boards(id uuid primary key,workspace_id uuid not null,name text,status text);
create table public.work_board_items(id uuid primary key,board_id uuid,group_id uuid,archived_at timestamptz);
create table private.mrh_sourcing_sensitive_cells(board_id uuid,workspace_id uuid,item_id uuid,field_name text,value jsonb,revision bigint,primary key(board_id,item_id,field_name));
insert into public.work_boards values ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Material Request Hub','active'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other','active');
insert into public.work_board_items values
 ('11111111-1111-4111-8111-111111111111','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null),
 ('22222222-2222-4222-8222-222222222222','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null),
 ('33333333-3333-4333-8333-333333333333','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','21566a87-b287-4a61-b521-bb233956e09e',null);
\i /tmp/mrh-pricing-v1.sql
\i /tmp/mrh-fx-snapshots.sql
do $$
declare
 w constant uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 i constant uuid:='11111111-1111-4111-8111-111111111111';
 j constant uuid:='22222222-2222-4222-8222-222222222222';
 foreign_item constant uuid:='33333333-3333-4333-8333-333333333333';
 a uuid; a2 uuid; l uuid; l2 uuid; receipt jsonb; old_receipt jsonb; quote jsonb; p record;
 original jsonb; n int;
 base constant jsonb:='{"quantity":"4","buyingPrice":"120.36","currency":"USD","shipping":"20","shipCurrency":"USD","source":"Import"}';
begin
 receipt:=private.mrh_fx_capture_legacy(i);
 if receipt->>'status'<>'incomplete' or receipt->'missing'<>'["usd","eur"]'::jsonb or receipt->'snapshotId'<>'null'::jsonb then raise exception 'missing legacy pair';end if;
 insert into private.mrh_sourcing_sensitive_cells values(b,w,i,'Ex. Rate USD','64.450000000'::jsonb,9007199254740993);
 receipt:=private.mrh_fx_capture_legacy(i);
 if receipt->>'status'<>'incomplete' or receipt->'missing'<>'["eur"]'::jsonb then raise exception 'partial pair';end if;
 insert into private.mrh_sourcing_sensitive_cells values(b,w,i,'Ex. Rate EUR','0'::jsonb,1);
 if private.mrh_fx_capture_legacy(i)->>'status'<>'invalid' then raise exception 'zero legacy rate';end if;
 update private.mrh_sourcing_sensitive_cells set value='71.123456789' where item_id=i and field_name='Ex. Rate EUR';
 if private.mrh_fx_capture_legacy(i)->>'status'<>'invalid' then raise exception 'legacy precision rounded';end if;
 update private.mrh_sourcing_sensitive_cells set value='"71"' where item_id=i and field_name='Ex. Rate EUR';
 if private.mrh_fx_capture_legacy(i)->>'status'<>'invalid' then raise exception 'legacy string accepted';end if;
 update private.mrh_sourcing_sensitive_cells set value='71.00000000' where item_id=i and field_name='Ex. Rate EUR';
 select jsonb_agg(to_jsonb(c) order by field_name) into original from private.mrh_sourcing_sensitive_cells c;
 l:=(private.mrh_fx_capture_legacy(i)->>'snapshotId')::uuid;
 if l is null or (private.mrh_fx_capture_legacy(i)->>'snapshotId')::uuid is distinct from l then raise exception 'legacy replay';end if;
 receipt:=private.mrh_fx_read(w,i,l);
 if receipt->>'usd'<>'64.45000000' or receipt->>'eur'<>'71.00000000'
 or receipt->>'usdRevision'<>'9007199254740993' or receipt->>'eurRevision'<>'1'
 or receipt->>'provenance'<>'legacy_unverified' or receipt->'observedAt'<>'null'::jsonb
 or receipt->'retrievedAt'<>'null'::jsonb or receipt->'provider'<>'null'::jsonb then raise exception 'legacy provenance %',receipt;end if;
 if (select jsonb_agg(to_jsonb(c) order by field_name) from private.mrh_sourcing_sensitive_cells c) is distinct from original then raise exception 'legacy values rewritten';end if;
 if private.mrh_fx_read(w,j,l) is not null or private.mrh_fx_read('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',i,l) is not null then raise exception 'scope mismatch';end if;
 update private.mrh_sourcing_sensitive_cells set value='65',revision=revision+1 where item_id=i and field_name='Ex. Rate USD';
 l2:=(private.mrh_fx_capture_legacy(i)->>'snapshotId')::uuid;
 if l2 is null or l2=l or private.mrh_fx_read(w,i,l) is distinct from receipt then raise exception 'legacy version history';end if;
 a:=private.mrh_fx_capture_provider(i,'64.45000000','71','Synthetic provider','obs-1','2026-01-01T00:00:00Z','2026-01-01T01:00:00Z');
 old_receipt:=private.mrh_fx_read(w,i,a);
 a2:=private.mrh_fx_capture_provider(i,'64.45','71.00000000','Synthetic provider','obs-1','2026-01-01T08:00:00+08','2026-01-02T01:00:00Z');
 if a2 is distinct from a or private.mrh_fx_read(w,i,a) is distinct from old_receipt then raise exception 'provider replay changed snapshot';end if;
 if old_receipt->>'provenance'<>'provider_reported' or old_receipt->>'provider'<>'Synthetic provider'
 or old_receipt->>'observationRef'<>'obs-1' or (old_receipt->>'retrievedAt')::timestamptz<>'2026-01-01T01:00:00Z'::timestamptz
 or old_receipt->'usdRevision'<>'null'::jsonb then raise exception 'provider receipt';end if;
 quote:=private.mrh_calculate_pricing_v1(base||jsonb_build_object('usd',old_receipt->>'usd','eur',old_receipt->>'eur'));
 if quote->'costs'->>'vatIn'<>'68490.60' then raise exception 'pricing composition';end if;
 a2:=private.mrh_fx_capture_provider(i,'66.12345678','72.98765432','Synthetic provider','obs-2','2026-01-02T00:00:00Z','2026-01-02T01:00:00Z');
 if a2=a or private.mrh_fx_read(w,i,a) is distinct from old_receipt
 or private.mrh_calculate_pricing_v1(base||jsonb_build_object('usd',private.mrh_fx_read(w,i,a)->>'usd','eur',private.mrh_fx_read(w,i,a)->>'eur')) is distinct from quote then raise exception 'new FX altered old quote';end if;
 if private.mrh_fx_capture_provider(j,'64.45','71','Synthetic provider','obs-1','2026-01-01T00:00:00Z','2026-01-01T01:00:00Z')=a then raise exception 'cross-item identity';end if;
 for p in select * from (values ('0'),('-1'),('NaN'),('Infinity'),('1e2'),('1.123456789'),('1000000000000'),(' 64'),(''),(null)) x(rate) loop
  begin
   perform private.mrh_fx_capture_provider(i,p.rate,'71','Synthetic provider','bad','2026-01-01','2026-01-02');
   raise exception 'bad rate accepted %',p.rate;
  exception when sqlstate '22023' then null;end;
 end loop;
 for p in select * from (values
  (null::text,'ref','2026-01-01'::timestamptz,'2026-01-02'::timestamptz),
  ('','ref','2026-01-01','2026-01-02'),('p',null,'2026-01-01','2026-01-02'),
  ('p','ref',null,'2026-01-02'),('p','ref','2026-01-01',null),
  ('p','ref','2026-01-02','2026-01-01'),('p','ref','2026-01-01','infinity'),
  ('p','ref','2026-01-01','2999-01-01')
 ) x(provider,ref,observed,retrieved) loop
  begin
   perform private.mrh_fx_capture_provider(i,'64','71',p.provider,p.ref,p.observed,p.retrieved);
   raise exception 'bad provenance accepted';
  exception when sqlstate '22023' then null;end;
 end loop;
 begin
  perform private.mrh_fx_capture_legacy(foreign_item);raise exception 'foreign item accepted';
 exception when sqlstate 'PT409' then null;end;
 update public.work_board_items set archived_at=now() where id=i;
 begin
  perform private.mrh_fx_capture_legacy(i);raise exception 'archived capture accepted';
 exception when sqlstate 'PT409' then null;end;
 if private.mrh_fx_read(w,i,a) is distinct from old_receipt then raise exception 'archived history changed';end if;
 update public.work_board_items set archived_at=null where id=i;
 begin update private.mrh_fx_snapshots set usd=1 where id=a;raise exception 'update accepted';
 exception when check_violation then null;end;
 begin delete from private.mrh_fx_snapshots where id=a;raise exception 'delete accepted';
 exception when check_violation then null;end;
 begin truncate private.mrh_fx_snapshots;raise exception 'truncate accepted';
 exception when check_violation then null;end;
 select count(*) into n from private.mrh_fx_snapshots;
 if n<>5 then raise exception 'unexpected history count %',n;end if;
 begin
  perform private.mrh_fx_capture_provider(i,'65','72','Synthetic provider','rollback','2026-01-01','2026-01-02');
  raise exception using errcode='P0002',message='synthetic rollback';
 exception when sqlstate 'P0002' then null;end;
 if (select count(*) from private.mrh_fx_snapshots)<>n then raise exception 'rollback leaked';end if;
 -- Existing material deletion must not be blocked by the historical ledger.
 delete from public.work_board_items where id=j;
 if (select count(*) from private.mrh_fx_snapshots where item_id=j)<>1 then raise exception 'historical identity lost';end if;
 raise notice 'CP_MS_CRM_04B2_PROVENANCE_REPLAY_IMMUTABILITY_PASS';
end $$;
