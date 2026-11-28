-- CP-MS-CRM-05D.2B: candidate only; not applied to production.
-- Match existing operational Order Intake archive semantics without modifying records.
begin;
create or replace function private.mrh_procurement_client_source(w uuid,source_id uuid,kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and w=public.current_workspace_id(auth.uid())
 and coalesce(public.has_module_access('order-intake',auth.uid()),false)
 and exists(select 1 from public.order_intake_operational_registry r
 where r.workspace_id=w and r.id=source_id and r.record_kind=kind
 and ((r.record_kind='native' and r.archived is false)
   or (r.record_kind='legacy' and r.archived is not true)))
$$;
commit;
