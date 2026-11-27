-- Domain integrity only: rate stamps and comment thread identity.
begin;
create function material_sourcing.prevent_fx_snapshot_changes()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new is distinct from old then
    raise exception using errcode='23514', message='FX snapshots are immutable; create a new snapshot instead.';
  end if;
  return new;
end;
$$;
create trigger fx_snapshot_immutable
before update on material_sourcing.fx_snapshots
for each row execute function material_sourcing.prevent_fx_snapshot_changes();

create function material_sourcing.validate_activity_thread()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op='UPDATE' then
    if (new.id,new.material_id,new.kind,new.parent_id) is distinct from
       (old.id,old.material_id,old.kind,old.parent_id) then
      raise exception using errcode='23514', message='Activity identity and reply linkage are immutable.';
    end if;
    return new;
  end if;
  if new.parent_id is not null and exists (
    with recursive ancestors(id,parent_id) as (
      select a.id,a.parent_id from material_sourcing.activity a
      where a.id=new.parent_id and a.material_id=new.material_id
      union
      select a.id,a.parent_id from material_sourcing.activity a
      join ancestors p on a.id=p.parent_id
      where a.material_id=new.material_id
    )
    select 1 from ancestors where id=new.id
  ) then
    raise exception using errcode='23514', message='Comment replies cannot form a circular thread.';
  end if;
  return new;
end;
$$;
create trigger activity_identity_immutable
before update on material_sourcing.activity
for each row execute function material_sourcing.validate_activity_thread();
create trigger activity_thread_acyclic
after insert on material_sourcing.activity
for each row execute function material_sourcing.validate_activity_thread();
commit;
