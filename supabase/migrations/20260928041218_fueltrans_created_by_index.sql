create index if not exists fueltrans_tickets_created_by_fk_idx on public.fueltrans_tickets(created_by) where created_by is not null;;
