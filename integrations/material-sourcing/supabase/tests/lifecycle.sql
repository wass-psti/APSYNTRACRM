\set ON_ERROR_STOP on
begin;
do $$
begin
  begin
    update material_sourcing.fx_snapshots set usd=65 where id='demo-rates';
    raise exception 'snapshot mutation accepted';
  exception when check_violation then null;
  end;
  if (select total_landed from material_sourcing.material_costs where id='demo-0') <> 36184.80 then
    raise exception 'historical rate stamp changed';
  end if;
  raise notice 'PASS immutable FX snapshot';
end $$;
insert into material_sourcing.fx_snapshots(id,usd,eur,observed_at,provider,is_demo)
values ('qa-new-rate',65,71,now(),'test',true);
update material_sourcing.materials set fx_snapshot_id='qa-new-rate' where id='demo-0';
do $$
begin
  if (select total_landed from material_sourcing.material_costs where id='demo-0') <> 36493.60 then
    raise exception 'explicit rate restamp failed';
  end if;
  if (select usd from material_sourcing.fx_snapshots where id='demo-rates') <> 64.45 then
    raise exception 'original snapshot mutated';
  end if;
  raise notice 'PASS explicit material FX restamp';
end $$;
do $$
begin
  begin
    insert into material_sourcing.activity(id,material_id,kind,body,parent_id)
    values ('cycle-a','demo-0','comment','A','cycle-b'),('cycle-b','demo-0','comment','B','cycle-a');
    raise exception 'circular thread accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS circular comment thread rejected';
end $$;
insert into material_sourcing.activity(id,material_id,kind,body,parent_id)
values ('qa-thread-root','demo-0','comment','Root',null),
       ('qa-thread-child','demo-0','comment','Child','qa-thread-root');
update material_sourcing.activity set body='Edited',edited_at=now() where id='qa-thread-child';
do $$
begin
  begin
    update material_sourcing.activity set parent_id='qa-thread-child' where id='qa-thread-root';
    raise exception 'reparenting accepted';
  exception when check_violation then null;
  end;
  if not exists(select 1 from material_sourcing.activity where id='qa-thread-child' and body='Edited' and edited_at is not null and parent_id='qa-thread-root') then
    raise exception 'normal comment edit failed';
  end if;
  raise notice 'PASS valid replies and edits; structural reparenting rejected';
end $$;
rollback;
