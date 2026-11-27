-- CP-MS-BACKEND-01: isolated Material Sourcing schema. No API exposure or grants.
begin;
create schema material_sourcing;

create table material_sourcing.material_groups (
  id text primary key,
  name text not null unique,
  position integer not null unique check (position >= 0)
);
insert into material_sourcing.material_groups values
  ('new_group','Engineering Services',0),('topics','Items for Quotation',1);

create table material_sourcing.fx_snapshots (
  id text primary key default gen_random_uuid()::text,
  usd numeric(20,8) not null check (usd > 0 and usd < 'Infinity'::numeric),
  eur numeric(20,8) not null check (eur > 0 and eur < 'Infinity'::numeric),
  observed_at timestamptz not null,
  provider text not null,
  is_demo boolean not null default false
);

create table material_sourcing.materials (
  id text primary key default gen_random_uuid()::text,
  group_id text not null references material_sourcing.material_groups(id),
  part_number text not null check (btrim(part_number) <> ''),
  source_type text not null check (source_type in ('Local','Import','Unknown')),
  description text not null default '',
  brand text not null default '',
  quantity numeric(20,6) not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  buying_price numeric(20,6) not null check (buying_price >= 0 and buying_price < 'Infinity'::numeric),
  currency text not null check (currency in ('PHP','USD','EUR')),
  shipping_cost numeric(20,6) not null default 0 check (shipping_cost >= 0 and shipping_cost < 'Infinity'::numeric),
  shipping_currency text not null default 'PHP' check (shipping_currency in ('PHP','USD','EUR')),
  fx_snapshot_id text not null references material_sourcing.fx_snapshots(id),
  lead_weeks numeric(16,6) check (lead_weeks > '-Infinity'::numeric and lead_weeks < 'Infinity'::numeric),
  required_date date,
  vendor text not null default '',
  rfq_ref text not null default '',
  account_ref text not null default '',
  supplier_po_ref text not null default '',
  requestor text not null default '',
  created_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  legacy_source text,
  legacy_id text,
  legacy_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(legacy_payload) = 'object'),
  unique (legacy_source, legacy_id),
  check ((legacy_source is null) = (legacy_id is null))
);
-- Part numbers are intentionally not unique: duplication and repeated RFQs are valid.
-- Negative historical lead times are representable; new-input validation remains in the app contract.
create table material_sourcing.tasks (
  id text primary key default gen_random_uuid()::text,
  material_id text not null references material_sourcing.materials(id),
  title text not null check (btrim(title) <> ''),
  status text not null default 'Working on it' check (status in ('Working on it','Done','Stuck')),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create table material_sourcing.activity (
  id text primary key default gen_random_uuid()::text,
  material_id text not null references material_sourcing.materials(id),
  kind text not null default 'event' check (kind in ('event','comment')),
  body text not null,
  author_ref text,
  occurred_at timestamptz not null default now(),
  parent_id text,
  parent_kind text generated always as (case when parent_id is not null then 'comment'::text end) stored,
  edited_at timestamptz,
  mentions text[] not null default '{}',
  deleted boolean not null default false,
  unique (material_id,id,kind),
  foreign key (material_id,parent_id,parent_kind) references material_sourcing.activity(material_id,id,kind),
  check (parent_id is null or (kind = 'comment' and parent_id <> id)),
  check (kind = 'comment' or (edited_at is null and not deleted and cardinality(mentions) = 0))
);

-- These are application actor references, not authentication identities or permission grants.
create table material_sourcing.starred_materials (
  actor_ref text not null check (btrim(actor_ref) <> ''),
  material_id text not null references material_sourcing.materials(id),
  created_at timestamptz not null default now(),
  primary key (actor_ref,material_id)
);
create table material_sourcing.saved_views (
  actor_ref text not null check (btrim(actor_ref) <> ''),
  name text not null check (btrim(name) <> ''),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (actor_ref,name)
);
create table material_sourcing.user_preferences (
  actor_ref text primary key check (btrim(actor_ref) <> ''),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

create index materials_group_recent_idx on material_sourcing.materials(group_id,created_date desc,created_at desc,id) where archived_at is null;
create index materials_source_idx on material_sourcing.materials(source_type) where archived_at is null;
create index materials_due_idx on material_sourcing.materials(required_date) where archived_at is null and required_date is not null;
create index materials_part_number_idx on material_sourcing.materials(lower(part_number));
create index materials_fx_idx on material_sourcing.materials(fx_snapshot_id);
create index fx_observed_idx on material_sourcing.fx_snapshots(observed_at desc,id);
create index tasks_material_position_idx on material_sourcing.tasks(material_id,position,id);
create index activity_material_time_idx on material_sourcing.activity(material_id,occurred_at desc,id);
create index activity_parent_idx on material_sourcing.activity(material_id,parent_id,parent_kind);
create index starred_material_idx on material_sourcing.starred_materials(material_id);

-- Exact decimal arithmetic. Unknown sources have no assumed selling markup.
create view material_sourcing.material_costs with (security_invoker=true) as
select m.*,g.name as group_name,f.usd,f.eur,
       p.php_equivalent,p.shipping_php,l.landed,
       round(l.landed*m.quantity,2) as total_landed,
       s.selling,round(s.selling*m.quantity*1.12,2) as vat_in
from material_sourcing.materials m
join material_sourcing.material_groups g on g.id=m.group_id
join material_sourcing.fx_snapshots f on f.id=m.fx_snapshot_id
cross join lateral (select
  round(m.buying_price * case m.currency when 'USD' then f.usd when 'EUR' then f.eur else 1 end,2) as php_equivalent,
  round(m.shipping_cost * case m.shipping_currency when 'USD' then f.usd when 'EUR' then f.eur else 1 end,2) as shipping_php
) p
cross join lateral (select p.php_equivalent+p.shipping_php as landed) l
cross join lateral (select round(l.landed * case m.source_type when 'Import' then 1.69 when 'Local' then 1.30 else null end,2) as selling) s;

-- Private schema: no browser API exposure, policies or grants are added here.
commit;
