-- CP-MS-CRM-04B.3 synthetic fixture extends the B.2 disposable database.
-- Model the live non-deferrable material FKs and public-cell timestamps.
alter table private.mrh_sourcing_sensitive_cells add foreign key(item_id)
 references public.work_board_items(id) on delete cascade;
create table public.work_board_columns(id uuid primary key,board_id uuid not null references public.work_boards(id),
 name text not null,data_type text not null,column_key text not null,system_key text,visible boolean not null);
create table public.work_board_item_values(item_id uuid not null references public.work_board_items(id) on delete cascade,
 column_id uuid not null references public.work_board_columns(id) on delete cascade,
 value jsonb,updated_at timestamptz not null default clock_timestamp(),primary key(item_id,column_id));
insert into public.work_board_columns values
 ('10000000-0000-4000-8000-000000000001','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Quantity','number','col_quantity',null,true),
 ('10000000-0000-4000-8000-000000000002','617c4c0f-e343-4b3b-8456-50d47dcbaf99','Source Type','dropdown','custom:source',null,true);
insert into public.work_board_items values
 ('44444444-4444-4444-8444-444444444444','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null),
 ('55555555-5555-4555-8555-555555555555','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null);
\i /tmp/mrh-pricing-persistence.sql
do $$
declare
 b constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 w constant uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 i constant uuid:='44444444-4444-4444-8444-444444444444';
 j constant uuid:='55555555-5555-4555-8555-555555555555';
 q constant uuid:='10000000-0000-4000-8000-000000000001';
 s constant uuid:='10000000-0000-4000-8000-000000000002';
 state jsonb; current_state jsonb; old_quote jsonb; receipt jsonb; old_source jsonb; fx uuid; fx2 uuid; provider uuid;
 n int; nf int;
begin
 state:=private.mrh_pricing_input_state(i,null);
 receipt:=private.mrh_pricing_persist(i,null,state);
 if receipt->'calculation'->>'status'<>'incomplete' or receipt->'calculation'->'costs'<>'null'::jsonb
  or private.mrh_pricing_persist(i,null,state) is distinct from receipt then raise exception 'empty/replay contract';end if;
 insert into public.work_board_item_values(item_id,column_id,value) values(i,q,'4'),(i,s,'"Import"');
 insert into private.mrh_sourcing_sensitive_cells values
 (b,w,i,'Buying Price','120.360000000',9007199254740993),(b,w,i,'Currency','"USD"',1),
 (b,w,i,'Shipping Cost','20',1),(b,w,i,'Shipping Cost Currency','"USD"',1),
 (b,w,i,'Ex. Rate USD','64.450000000',9007199254740993),(b,w,i,'Ex. Rate EUR','71',1),
 (b,w,i,'Selling Price (VAT-EX)','123.45',1);
 fx:=(private.mrh_fx_capture_legacy(i)->>'snapshotId')::uuid;
 state:=private.mrh_pricing_input_state(i,fx);
 select jsonb_agg(to_jsonb(v) order by field_name) into old_source from private.mrh_sourcing_sensitive_cells v where item_id=i;
 old_quote:=private.mrh_pricing_persist(i,fx,state);
 if old_quote->'calculation'->'costs'->>'vatIn'<>'68490.60'
  or old_quote->'calculation'->>'status'<>'complete'
  or old_quote->'inputState'->'private'->'buyingPrice'->>'revision'<>'9007199254740993'
  or old_quote->'pricingInputs'->>'buyingPrice'<>'120.36'
  or old_quote->'pricingInputs'->>'usd'<>'64.45000000'
  or private.mrh_pricing_persist(i,fx,state) is distinct from old_quote then raise exception 'exact calculation/replay %',old_quote;end if;
 if (select jsonb_agg(to_jsonb(v) order by field_name) from private.mrh_sourcing_sensitive_cells v where item_id=i) is distinct from old_source
  then raise exception 'source was rewritten';end if;
 insert into private.mrh_sourcing_sensitive_cells values(b,w,i,'Vendor Details','"Synthetic vendor"',1);
 update private.mrh_sourcing_sensitive_cells set value='999',revision=revision+1 where item_id=i and field_name='Selling Price (VAT-EX)';
 if private.mrh_pricing_input_state(i,fx) is distinct from state
  or private.mrh_pricing_persist(i,fx,state) is distinct from old_quote then raise exception 'unrelated edit repriced';end if;
 update private.mrh_sourcing_sensitive_cells set value='121',revision=revision+1 where item_id=i and field_name='Buying Price';
 begin perform private.mrh_pricing_persist(i,fx,state);raise exception 'stale commercial token accepted';
 exception when sqlstate 'PT409' then null;end;
 receipt:=private.mrh_pricing_persist(i,fx,private.mrh_pricing_input_state(i,fx));
 if receipt->>'pricingVersionId'=old_quote->>'pricingVersionId' or receipt->'calculation' is not distinct from old_quote->'calculation'
  then raise exception 'new commercial version missing';end if;
 state:=private.mrh_pricing_input_state(i,fx);
 update public.work_board_item_values set value='5',updated_at=clock_timestamp() where item_id=i and column_id=q;
 begin perform private.mrh_pricing_persist(i,fx,state);raise exception 'stale quantity accepted';
 exception when sqlstate 'PT409' then null;end;
 update private.mrh_sourcing_sensitive_cells set value='65',revision=revision+1 where item_id=i and field_name='Ex. Rate USD';
 begin perform private.mrh_pricing_persist(i,fx,private.mrh_pricing_input_state(i,fx));raise exception 'stale legacy FX accepted';
 exception when sqlstate 'PT409' then null;end;
 fx2:=(private.mrh_fx_capture_legacy(i)->>'snapshotId')::uuid;
 receipt:=private.mrh_pricing_persist(i,fx2,private.mrh_pricing_input_state(i,fx2));
 if receipt->'pricingInputs'->>'usd'<>'65.00000000' or receipt->>'fxSnapshotId'<>fx2::text then raise exception 'new FX missing';end if;
 provider:=private.mrh_fx_capture_provider(i,'66','72','Synthetic provider','pricing-1','2026-01-01','2026-01-02');
 state:=private.mrh_pricing_input_state(i,provider);
 receipt:=private.mrh_pricing_persist(i,provider,state);
 update private.mrh_sourcing_sensitive_cells set value='67',revision=revision+1 where item_id=i and field_name='Ex. Rate USD';
 if private.mrh_pricing_persist(i,provider,private.mrh_pricing_input_state(i,provider)) is distinct from receipt
  then raise exception 'legacy rate changed provider quote';end if;
 if private.mrh_pricing_input_state(j,provider) is not null or private.mrh_pricing_read(w,j,(old_quote->>'pricingVersionId')::uuid) is not null
  then raise exception 'foreign item quote or FX accepted';end if;
 begin perform private.mrh_pricing_persist(j,provider,state);raise exception 'cross-item persist accepted';
 exception when sqlstate 'PT409' then null;end;
 update private.mrh_sourcing_sensitive_cells set value='"121"',revision=revision+1 where item_id=i and field_name='Buying Price';
 receipt:=private.mrh_pricing_persist(i,provider,private.mrh_pricing_input_state(i,provider));
 if receipt->'calculation'->>'status'<>'invalid' or receipt->'calculation'->'costs'<>'null'::jsonb then raise exception 'numeric string coerced';end if;
 update private.mrh_sourcing_sensitive_cells set value='121',revision=revision+1 where item_id=i and field_name='Buying Price';
 update public.work_board_item_values set value='"Unknown"',updated_at=clock_timestamp() where item_id=i and column_id=s;
 update private.mrh_sourcing_sensitive_cells set value='0',revision=revision+1 where item_id=i and field_name='Shipping Cost';
 receipt:=private.mrh_pricing_persist(i,provider,private.mrh_pricing_input_state(i,provider));
 if receipt->'calculation'->>'status'<>'partial' or receipt->'calculation'->'costs'->>'shipPhp'<>'0.00'
  or receipt->'calculation'->'costs'->'selling'<>'null'::jsonb then raise exception 'unknown vs zero';end if;
 receipt:=private.mrh_pricing_persist(i,null,private.mrh_pricing_input_state(i,null));
 if receipt->'calculation'->>'status'<>'incomplete' or receipt->'calculation'->'costs'<>'null'::jsonb then raise exception 'missing FX fabricated';end if;
 select count(*) into n from private.mrh_pricing_versions;
 select count(*) into nf from private.mrh_fx_snapshots;
 begin
  update public.work_board_item_values set value='6',updated_at=clock_timestamp() where item_id=i and column_id=q;
  fx2:=private.mrh_fx_capture_provider(i,'68','74','Synthetic provider','pricing-rollback','2026-01-01','2026-01-02');
  perform private.mrh_pricing_persist(i,fx2,private.mrh_pricing_input_state(i,fx2));
  raise exception using errcode='P0002',message='synthetic rollback';
 exception when sqlstate 'P0002' then null;end;
 if (select count(*) from private.mrh_pricing_versions)<>n or (select count(*) from private.mrh_fx_snapshots)<>nf
  or (select value from public.work_board_item_values where item_id=i and column_id=q)<>'5'::jsonb
  then raise exception 'partial transaction leaked';end if;
 begin update private.mrh_pricing_versions set calculation='{}';raise exception 'mutable pricing';
 exception when check_violation then null;end;
 begin delete from private.mrh_pricing_versions;raise exception 'deletable pricing';
 exception when check_violation then null;end;
 begin truncate private.mrh_pricing_versions;raise exception 'truncatable pricing';
 exception when check_violation then null;end;
 update public.work_board_columns set visible=false where id=q;
 if private.mrh_pricing_input_state(i,provider) is not null then raise exception 'column drift accepted';end if;
 update public.work_board_columns set visible=true where id=q;
 update public.work_board_items set archived_at=now() where id=i;
 begin perform private.mrh_pricing_persist(i,provider,state);raise exception 'archived pricing accepted';
 exception when sqlstate 'PT409' then null;end;
 delete from public.work_board_items where id=i;
 if private.mrh_pricing_read(w,i,(old_quote->>'pricingVersionId')::uuid) is distinct from old_quote
  then raise exception 'historical quote lost';end if;
 raise notice 'CP_MS_CRM_04B3_ATOMIC_PRICING_PERSISTENCE_PASS';
end $$;
-- Independent-session fixtures. The second material has a complete provider
-- quote; a third has no quantity to test missing-cell insert serialization.
insert into public.work_board_items values
 ('66666666-6666-4666-8666-666666666666','617c4c0f-e343-4b3b-8456-50d47dcbaf99','21566a87-b287-4a61-b521-bb233956e09e',null);
insert into public.work_board_item_values(item_id,column_id,value) values
 ('55555555-5555-4555-8555-555555555555','10000000-0000-4000-8000-000000000001','4'),
 ('55555555-5555-4555-8555-555555555555','10000000-0000-4000-8000-000000000002','"Import"');
insert into private.mrh_sourcing_sensitive_cells values
 ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','Buying Price','120.36',1),
 ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','Currency','"USD"',1),
 ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','Shipping Cost','20',1),
 ('617c4c0f-e343-4b3b-8456-50d47dcbaf99','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','Shipping Cost Currency','"USD"',1);
select private.mrh_fx_capture_provider('55555555-5555-4555-8555-555555555555','64.45','71','Synthetic provider','pricing-concurrent','2026-01-01','2026-01-02');
