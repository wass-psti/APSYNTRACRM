begin;
drop trigger activity_thread_acyclic on material_sourcing.activity;
drop trigger activity_identity_immutable on material_sourcing.activity;
drop function material_sourcing.validate_activity_thread();
drop trigger fx_snapshot_immutable on material_sourcing.fx_snapshots;
drop function material_sourcing.prevent_fx_snapshot_changes();
commit;
