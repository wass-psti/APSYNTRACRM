drop policy if exists fueltrans_tickets_insert on public.fueltrans_tickets;
create policy fueltrans_tickets_insert on public.fueltrans_tickets for insert to authenticated with check (created_by = (select auth.uid()) and (private.fueltrans_current_role(workspace_id) in ('admin','call_center_specialist') or (private.fueltrans_current_role(workspace_id) in ('unioil','aramco','rephil','petron') and upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),''))));

drop policy if exists fueltrans_tickets_update on public.fueltrans_tickets;
create policy fueltrans_tickets_update on public.fueltrans_tickets for update to authenticated using (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans','global_l1_support','local_l2_support','call_center_specialist') or (private.fueltrans_current_role(workspace_id) in ('unioil','aramco','rephil','petron') and upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),'') and created_by = (select auth.uid()))) with check (private.fueltrans_current_role(workspace_id) in ('admin','fueltrans','global_l1_support','local_l2_support','call_center_specialist') or (private.fueltrans_current_role(workspace_id) in ('unioil','aramco','rephil','petron') and upper(coalesce(client_code,'')) = coalesce(private.fueltrans_current_client(workspace_id),'') and created_by = (select auth.uid())));

create or replace function private.fueltrans_guard_ticket_mutation() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_assigned_l1 jsonb; v_assigned_l2 jsonb; v_reported_by jsonb;
begin
  v_role := private.fueltrans_current_role(new.workspace_id);
  if v_role is null then raise exception 'Active FuelTrans membership is required'; end if;
  if tg_op = 'UPDATE' and v_role in ('unioil','aramco','rephil','petron') then
    if new.client_code is distinct from old.client_code or new.created_by is distinct from old.created_by or new.assigned_l1 is distinct from old.assigned_l1 or new.assigned_l2 is distinct from old.assigned_l2 or new.status is distinct from old.status or new.archived is distinct from old.archived then raise exception 'FuelTrans client accounts cannot modify workflow authority fields'; end if;
  end if;
  if tg_op = 'UPDATE' and v_role in ('fueltrans','watchdog_employee','call_center_specialist') then
    if new.client_code is distinct from old.client_code or new.created_by is distinct from old.created_by or new.assigned_l1 is distinct from old.assigned_l1 or new.assigned_l2 is distinct from old.assigned_l2 or new.status is distinct from old.status or new.archived is distinct from old.archived then raise exception 'FuelTrans role is not permitted to modify workflow authority fields'; end if;
  end if;
  new.payload := coalesce(new.payload, '{}'::jsonb);
  new.payload := jsonb_set(new.payload, '{id}', to_jsonb(new.id), true);
  new.payload := jsonb_set(new.payload, '{ticketStatus}', to_jsonb(new.status), true);
  new.payload := jsonb_set(new.payload, '{archived}', to_jsonb(new.archived), true);
  new.payload := jsonb_set(new.payload, '{client}', case when new.client_code is null then 'null'::jsonb else to_jsonb(new.client_code) end, true);
  v_reported_by := case when jsonb_typeof(new.payload->'reportedBy') = 'object' then new.payload->'reportedBy' else '{}'::jsonb end;
  if new.created_by is not null then v_reported_by := v_reported_by || jsonb_build_object('id', new.created_by::text); new.payload := jsonb_set(new.payload, '{reportedBy}', v_reported_by, true); end if;
  if new.assigned_l1 is null then new.payload := jsonb_set(new.payload, '{assignedL1}', 'null'::jsonb, true); else v_assigned_l1 := case when jsonb_typeof(new.payload->'assignedL1') = 'object' then new.payload->'assignedL1' else '{}'::jsonb end; new.payload := jsonb_set(new.payload, '{assignedL1}', v_assigned_l1 || jsonb_build_object('id', new.assigned_l1::text), true); end if;
  if new.assigned_l2 is null then new.payload := jsonb_set(new.payload, '{assignedL2}', 'null'::jsonb, true); else v_assigned_l2 := case when jsonb_typeof(new.payload->'assignedL2') = 'object' then new.payload->'assignedL2' else '{}'::jsonb end; new.payload := jsonb_set(new.payload, '{assignedL2}', v_assigned_l2 || jsonb_build_object('id', new.assigned_l2::text), true); end if;
  return new;
end;
$$;
revoke all on function private.fueltrans_guard_ticket_mutation() from public;
drop trigger if exists fueltrans_guard_ticket_mutation on public.fueltrans_tickets;
create trigger fueltrans_guard_ticket_mutation before insert or update on public.fueltrans_tickets for each row execute function private.fueltrans_guard_ticket_mutation();

drop policy if exists fueltrans_notifications_select on public.fueltrans_notifications;
create policy fueltrans_notifications_select on public.fueltrans_notifications for select to authenticated using (private.fueltrans_current_role(workspace_id) is not null and (recipient_user_id = (select auth.uid()) or recipient_scope = 'all' or private.fueltrans_current_role(workspace_id) = 'admin'));
drop policy if exists fueltrans_notifications_update on public.fueltrans_notifications;
create policy fueltrans_notifications_update on public.fueltrans_notifications for update to authenticated using (private.fueltrans_current_role(workspace_id) is not null and recipient_user_id = (select auth.uid())) with check (private.fueltrans_current_role(workspace_id) is not null and recipient_user_id = (select auth.uid()));;
