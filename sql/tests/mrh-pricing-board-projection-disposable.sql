-- Extend the existing disposable pricing interface fixture, never production.
create table public.work_board_groups(id uuid primary key,board_id uuid,title text);
create table public.workspace_members(workspace_id uuid,user_id uuid,active boolean);
create table public.profiles(id uuid primary key,status text);
insert into public.work_board_groups values ('21566a87-b287-4a61-b521-bb233956e09e','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Main group');
insert into public.workspace_members values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','99999999-9999-4999-8999-999999999999',true);
insert into public.profiles values ('99999999-9999-4999-8999-999999999999','active');
\i /tmp/mrh-pricing-board-projection.sql
select set_config('mrh.fixture_actor','99999999-9999-4999-8999-999999999999',false);
do $$
declare
 b constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 g constant uuid:='21566a87-b287-4a61-b521-bb233956e09e';
 w constant uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 i constant uuid:='77777777-7777-4777-8777-777777777777';
 j constant uuid:='88888888-8888-4888-8888-888888888888';
 k constant uuid:='abababab-abab-4bab-8bab-abababababab';
 q constant uuid:='10000000-0000-4000-8000-000000000001';
 s constant uuid:='10000000-0000-4000-8000-000000000002';
 fx uuid; r jsonb; row_result jsonb; version_count bigint;
begin
 -- Isolate this fixture from earlier cases; preserve historical rows.
 update public.work_board_items set archived_at=now() where board_id=b;
 insert into public.work_board_items values(i,b,g,null),(j,b,g,null),(k,b,g,null);
 insert into public.work_board_item_values(item_id,column_id,value) values(i,q,'3'),(i,s,'"Local"'),(k,q,'1'),(k,s,'"Unknown"');
 insert into private.mrh_sourcing_sensitive_cells values
 (b,w,i,'Buying Price','0.10',1),(b,w,i,'Currency','"PHP"',1),
 (b,w,i,'Shipping Cost','0.20',1),(b,w,i,'Shipping Cost Currency','"PHP"',1),
 (b,w,k,'Buying Price','0',1),(b,w,k,'Currency','"PHP"',1),
 (b,w,k,'Shipping Cost','0',1),(b,w,k,'Shipping Cost Currency','"PHP"',1);
 fx:=private.mrh_fx_capture_provider(i,'64','71','Synthetic provider','05a-1','2026-01-01','2026-01-02');
 perform private.mrh_pricing_persist(i,fx,private.mrh_pricing_input_state(i,fx));
 update private.mrh_sourcing_sensitive_cells set value='0.30',revision=2 where item_id=i and field_name='Buying Price';
 perform private.mrh_pricing_persist(i,fx,private.mrh_pricing_input_state(i,fx));
 fx:=private.mrh_fx_capture_provider(k,'65','72','Synthetic provider','05a-2','2026-01-02','2026-01-03');
 perform private.mrh_pricing_persist(k,fx,private.mrh_pricing_input_state(k,fx));
 version_count:=(select count(*) from private.mrh_pricing_versions);
 r:=public.mrh_pricing_board_projection(b);
 if r->'coverage' is distinct from '{"total":3,"current":1,"missing":1,"stale":0,"partial":1,"incomplete":0,"unavailable":0}'::jsonb
 or r->'totals' is distinct from '{"buying":"0.90","shipping":"0.60","landed":"1.50","sellingVatIn":"2.18"}'::jsonb
 or r->'latestFx'->>'observationRef'<>'05a-2' then raise exception 'projection coverage/totals %',r;end if;
 select x into row_result from jsonb_array_elements(r->'rows') x where x->>'itemId'=k::text;
 if row_result->'costs'->>'php'<>'0.00' or row_result->'costs'->'selling'<>'null'::jsonb then raise exception 'partial zero lost';end if;
 update public.work_board_item_values set value='4',updated_at=clock_timestamp() where item_id=i and column_id=q;
 r:=public.mrh_pricing_board_projection(b);
 if r->'coverage'->>'stale'<>'1' or r->'totals'->'buying'<>'null'::jsonb then raise exception 'stale counted %',r;end if;
 if (select count(*) from private.mrh_pricing_versions)<>version_count then raise exception 'read mutated history';end if;
 update public.workspace_members set active=false;
 begin perform public.mrh_pricing_board_projection(b);raise exception 'inactive member exposed';exception when insufficient_privilege then null;end;
 update public.workspace_members set active=true;
 update public.profiles set status='inactive';
 begin perform public.mrh_pricing_board_projection(b);raise exception 'inactive actor exposed';exception when insufficient_privilege then null;end;
 update public.profiles set status='active';
 begin perform public.mrh_pricing_board_projection('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');raise exception 'foreign board exposed';exception when insufficient_privilege then null;end;
 perform set_config('mrh.fixture_actor','',true);
 begin perform public.mrh_pricing_board_projection(b);raise exception 'anonymous exposed';exception when insufficient_privilege then null;end;
 raise notice 'CP_MS_CRM_05A_BOARD_PROJECTION_PASS';
end $$;
