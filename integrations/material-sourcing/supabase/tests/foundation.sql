\set ON_ERROR_STOP on
begin;
do $$
declare c record;
begin
  if (select count(*) from material_sourcing.materials) <> 7 then raise exception 'seed count'; end if;
  if (select count(*) from material_sourcing.material_groups) <> 2 then raise exception 'group count'; end if;
  select * into strict c from material_sourcing.material_costs where id='demo-0';
  if (c.php_equivalent,c.shipping_php,c.landed,c.total_landed,c.selling,c.vat_in)
       is distinct from (7757.20::numeric,1289.00::numeric,9046.20::numeric,36184.80::numeric,15288.08::numeric,68490.60::numeric)
  then raise exception 'reference calculation mismatch: %',row(c.php_equivalent,c.shipping_php,c.landed,c.total_landed,c.selling,c.vat_in); end if;
  select * into strict c from material_sourcing.material_costs where id='demo-local';
  if (c.landed,c.total_landed,c.selling,c.vat_in) is distinct from (265::numeric,2650::numeric,344.50::numeric,3858.40::numeric)
  then raise exception 'local calculation mismatch'; end if;
  raise notice 'PASS seed, groups, reference and local pricing';
end $$;

do $$
begin
  begin
    update material_sourcing.materials set group_id='invalid' where id='demo-0';
    raise exception 'invalid group accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    update material_sourcing.materials set fx_snapshot_id='invalid' where id='demo-0';
    raise exception 'invalid FX reference accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    update material_sourcing.materials set quantity=0 where id='demo-0';
    raise exception 'invalid quantity accepted';
  exception when check_violation then null;
  end;
  begin
    update material_sourcing.materials set buying_price=-1 where id='demo-0';
    raise exception 'invalid price accepted';
  exception when check_violation then null;
  end;
  begin
    update material_sourcing.materials set currency='GBP' where id='demo-0';
    raise exception 'invalid currency accepted';
  exception when check_violation then null;
  end;
  begin
    update material_sourcing.fx_snapshots set usd=0 where id='demo-rates';
    raise exception 'invalid FX accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS relational and numeric constraints';
end $$;

update material_sourcing.materials set source_type='Unknown', lead_weeks=-25,
  legacy_source='reference-fixture',legacy_id='historical-1',
  legacy_payload='{"unmapped_column":{"value":"preserve"}}' where id='demo-0';
do $$
begin
  if not exists(select 1 from material_sourcing.material_costs where id='demo-0' and selling is null and vat_in is null and landed=9046.20 and lead_weeks=-25 and legacy_payload#>>'{unmapped_column,value}'='preserve')
    then raise exception 'unknown source or historical payload lost'; end if;
  begin
    update material_sourcing.materials set legacy_source='reference-fixture',legacy_id='historical-1' where id='demo-1';
    raise exception 'duplicate legacy identity accepted';
  exception when unique_violation then null;
  end;
  raise notice 'PASS historical unknown source, negative lead and unique external identity';
end $$;

insert into material_sourcing.tasks(id,material_id,title,status) values ('qa-task','demo-0','Check RFQ','Done');
insert into material_sourcing.activity(id,material_id,kind,body,mentions)
values ('qa-root','demo-0','comment','Check RFQ',array['Procurement team']);
insert into material_sourcing.activity(id,material_id,kind,body,parent_id)
values ('qa-reply','demo-0','comment','Reply','qa-root');
insert into material_sourcing.activity(id,material_id,body) values ('qa-event','demo-0','Created');
do $$
begin
  begin
    insert into material_sourcing.activity(id,material_id,kind,body,parent_id)
    values ('qa-wrong','demo-1','comment','Wrong material','qa-root');
    raise exception 'cross-material reply accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into material_sourcing.activity(id,material_id,kind,body,parent_id)
    values ('qa-wrong-kind','demo-0','comment','Wrong parent','qa-event');
    raise exception 'reply to non-comment accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into material_sourcing.tasks(id,material_id,title,status) values ('qa-orphan','missing','Orphan','Done');
    raise exception 'orphan task accepted';
  exception when foreign_key_violation then null;
  end;
  update material_sourcing.activity set deleted=true,body='Comment removed',mentions='{}' where id='qa-root';
  if not exists(select 1 from material_sourcing.activity where id='qa-reply' and parent_id='qa-root') then raise exception 'reply lost'; end if;
  raise notice 'PASS tasks, same-material comment threading and tombstone preservation';
end $$;

insert into material_sourcing.starred_materials(actor_ref,material_id) values ('qa-actor','demo-0');
insert into material_sourcing.saved_views(actor_ref,name,settings) values ('qa-actor','Imports','{"source":"Import","visible":["name","source"]}');
insert into material_sourcing.user_preferences(actor_ref,settings) values ('qa-actor','{"dark":true,"widths":{"name":230}}');
do $$
begin
  if not exists(select 1 from material_sourcing.saved_views where actor_ref='qa-actor' and settings->>'source'='Import') then raise exception 'view readback'; end if;
  if not exists(select 1 from material_sourcing.user_preferences where actor_ref='qa-actor' and settings#>>'{widths,name}'='230') then raise exception 'preference readback'; end if;
  if exists(select 1 from material_sourcing.starred_materials where actor_ref='other-actor') then raise exception 'unexpected actor star'; end if;
  if has_schema_privilege('anon','material_sourcing','USAGE') or has_schema_privilege('authenticated','material_sourcing','USAGE') then raise exception 'unexpected browser API privilege'; end if;
  raise notice 'PASS actor preferences and no accidental public schema access';
end $$;

rollback;
