-- Local development batch acknowledgement receipts, committed atomically with writes.
begin;
create table material_sourcing.bulk_operation_receipts (
  operation_id uuid primary key,
  payload_hash text not null check (length(payload_hash)=64),
  material_ids text[] not null,
  archived jsonb not null default '[]'::jsonb check (jsonb_typeof(archived)='array'),
  committed_at timestamptz not null default clock_timestamp()
);
commit;
