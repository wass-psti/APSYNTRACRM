-- Development-only rollback: explicitly remove this checkpoint's objects.
-- Destructive if records exist. Never execute against production or user data.
begin;
drop view material_sourcing.material_costs;
drop table material_sourcing.user_preferences;
drop table material_sourcing.saved_views;
drop table material_sourcing.starred_materials;
drop table material_sourcing.activity;
drop table material_sourcing.tasks;
drop table material_sourcing.materials;
drop table material_sourcing.fx_snapshots;
drop table material_sourcing.material_groups;
drop schema material_sourcing;
commit;
