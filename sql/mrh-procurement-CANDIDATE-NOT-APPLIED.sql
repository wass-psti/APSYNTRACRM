-- CP-MS-CRM-05D: additive candidate. NOT a production migration.
-- One immutable aggregate revision per accepted RFQ command. Existing material
-- and pricing tables are never updated here; history is retained on archive.
begin;
create table private.mrh_procurement_revisions (
 rfq_id uuid not null,
 revision bigint not null check(revision>0),
 workspace_id uuid not null references public.workspaces(id),
 item_id uuid not null references public.work_board_items(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 operation_id uuid not null unique,
 command text not null check(command in ('create','add_quote','amend_quote','select_quote','link_po','cancel','reopen')),
 request jsonb not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(rfq_id,revision)
);
create index mrh_procurement_item_history on private.mrh_procurement_revisions(workspace_id,item_id,rfq_id,revision desc);
alter table private.mrh_procurement_revisions enable row level security;
revoke all on private.mrh_procurement_revisions from public,anon,authenticated;

-- Reuse the existing viewer's exact membership/active Main group contract.
create function private.mrh_procurement_scope(p_item uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare w uuid;
begin
 perform public.mrh_sourcing_board_viewer_read('617c4c0f-e343-4b3b-8456-50d47dcbaf99',p_item);
 select workspace_id into strict w from public.work_boards where id='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 return w;
end $$;

create function private.mrh_procurement_text(p jsonb,k text,max_len integer) returns text
language plpgsql immutable set search_path='' as $$
declare v text;
begin
 if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'Invalid procurement text: %',k using errcode='22023'; end if;
 v:=btrim(p->>k);
 if length(v) not between 1 and max_len then raise exception 'Invalid procurement text: %',k using errcode='22023'; end if;
 return v;
end $$;
create function private.mrh_procurement_number(p jsonb,k text,min_value numeric) returns numeric
language plpgsql immutable set search_path='' as $$
declare v numeric;
begin
 if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'Invalid procurement amount: %',k using errcode='22023'; end if;
 v:=(p->>k)::numeric;
 if v<min_value or v>1000000000 or v<>round(v,4) then raise exception 'Invalid procurement amount: %',k using errcode='22023'; end if;
 return v;
end $$;
create function private.mrh_procurement_date(p jsonb,k text) returns date
language plpgsql immutable set search_path='' as $$
declare v text:=private.mrh_procurement_text(p,k,10);
begin
 if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid procurement date: %',k using errcode='22023'; end if;
 return v::date;
end $$;

-- Existing source board permission is independent of material permission.
-- The supplied source UUID must be active, same workspace, and match the
-- entered supplier name. Never infer identity from fuzzy name matching.
create function private.mrh_procurement_supplier_source(w uuid,source_id uuid,supplier text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.work_board_access('aa0d8acb-5f0e-4628-b0b4-76ef369b9f51','view'),false)
 and exists(select 1 from public.work_board_items i
 join public.work_boards b on b.id=i.board_id
 join public.work_board_columns c on c.board_id=b.id and c.name='Supplier Name'
 join public.work_board_item_values v on v.item_id=i.id and v.column_id=c.id
 where b.id='aa0d8acb-5f0e-4628-b0b4-76ef369b9f51' and b.workspace_id=w
 and b.name='Supplier PO Procurement' and b.status='active' and i.id=source_id and i.archived_at is null
 and jsonb_typeof(v.value)='string' and lower(btrim(v.value#>>'{}'))=lower(btrim(supplier)))
$$;
-- Replicate only the existing Order Intake SELECT policy predicate; the
-- security-invoker registry does not enforce caller RLS inside a definer.
create function private.mrh_procurement_client_source(w uuid,source_id uuid,kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and w=public.current_workspace_id(auth.uid())
 and coalesce(public.has_module_access('order-intake',auth.uid()),false)
 and exists(select 1 from public.order_intake_registry r where r.workspace_id=w and r.id=source_id
 and r.record_kind=kind and r.archived is false)
$$;

create function private.mrh_procurement_quote(p jsonb,w uuid,qid uuid,qrev bigint) returns jsonb
language plpgsql stable set search_path='' as $$
declare supplier text; currency text; ship_currency text; basis text; issued date; expires date; source_id uuid;
begin
 if jsonb_typeof(p) is distinct from 'object' or
 (p - array['quote_id','supplier','supplier_source_id','reference','issued_on','valid_until','quantity','unit_price','currency','shipping_total','shipping_currency','tax_basis','lead_weeks','notes'])<>'{}'::jsonb
 then raise exception 'Unsupported quotation fields' using errcode='22023'; end if;
 supplier:=private.mrh_procurement_text(p,'supplier',240);
 currency:=private.mrh_procurement_text(p,'currency',3);
 ship_currency:=private.mrh_procurement_text(p,'shipping_currency',3);
 basis:=private.mrh_procurement_text(p,'tax_basis',16);
 if currency not in ('PHP','USD','EUR') or ship_currency not in ('PHP','USD','EUR') or basis not in ('tax_exclusive','tax_inclusive','unspecified')
 then raise exception 'Invalid currency or tax basis' using errcode='22023'; end if;
 issued:=private.mrh_procurement_date(p,'issued_on');
 expires:=private.mrh_procurement_date(p,'valid_until');
 if expires<issued then raise exception 'Quotation expiry precedes issue date' using errcode='22023'; end if;
 if p->>'supplier_source_id' is not null then
  source_id:=(p->>'supplier_source_id')::uuid;
  if not private.mrh_procurement_supplier_source(w,source_id,supplier) then raise exception 'Supplier source unavailable or mismatched' using errcode='42501'; end if;
 end if;
 if p ? 'notes' and (jsonb_typeof(p->'notes') is distinct from 'string' or length(p->>'notes')>2000) then raise exception 'Invalid quotation notes' using errcode='22023'; end if;
 return jsonb_build_object('id',qid,'revision',qrev,'supplier',supplier,'supplier_source_id',source_id,
  'reference',private.mrh_procurement_text(p,'reference',240),'issued_on',issued,'valid_until',expires,
  'quantity',private.mrh_procurement_number(p,'quantity',0.0001)::text,'unit_price',private.mrh_procurement_number(p,'unit_price',0)::text,
  'currency',currency,'shipping_total',private.mrh_procurement_number(p,'shipping_total',0)::text,'shipping_currency',ship_currency,
  'tax_basis',basis,'lead_weeks',private.mrh_procurement_number(p,'lead_weeks',0)::text,'notes',coalesce(p->>'notes',''));
end $$;

create function public.mrh_procurement_apply(p_item uuid,p_rfq uuid,p_operation uuid,p_expected_revision bigint,p_command text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid; old private.mrh_procurement_revisions%rowtype; receipt private.mrh_procurement_revisions%rowtype;
 s jsonb; quotes jsonb; q jsonb; qid uuid; qrev bigint; supplier_id uuid; client_id uuid; client_kind text;
 command_request jsonb; next_rev bigint; state text; issued date; due date;
begin
 w:=private.mrh_procurement_scope(p_item);
 if not coalesce(public.work_board_access('617c4c0f-e343-4b3b-8456-50d47dcbaf99','edit'),false)
 or private.material_request_hub_current_role(w) is distinct from 'ADMIN' then raise exception 'Procurement write denied' using errcode='42501'; end if;
 if p_rfq is null or p_operation is null or p_expected_revision is null or p_expected_revision<0 or
 p_command is null or p_command not in ('create','add_quote','amend_quote','select_quote','link_po','cancel','reopen') or
 jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000
 then raise exception 'Invalid procurement command' using errcode='22023'; end if;
 -- Lock material first, serialize concurrent RFQ transitions and archive.
 perform 1 from public.work_board_items where id=p_item for update;
 w:=private.mrh_procurement_scope(p_item);
 command_request:=jsonb_build_object('expected_revision',p_expected_revision,'payload',p_payload);
 select * into receipt from private.mrh_procurement_revisions where operation_id=p_operation;
 if found then
  if receipt.actor_id is distinct from auth.uid() or receipt.workspace_id<>w or receipt.item_id<>p_item
  or receipt.rfq_id<>p_rfq or receipt.command<>p_command or receipt.request<>command_request
  then raise exception 'Operation identifier conflict' using errcode='PT409'; end if;
  return jsonb_build_object('rfq_id',p_rfq,'revision',receipt.revision,'operation_id',p_operation,'replayed',true);
 end if;
 select * into old from private.mrh_procurement_revisions where rfq_id=p_rfq order by revision desc limit 1;
 if found and (old.workspace_id<>w or old.item_id<>p_item) then raise exception 'RFQ unavailable' using errcode='42501'; end if;
 if coalesce(old.revision,0)<>p_expected_revision then raise exception 'RFQ revision conflict' using errcode='PT409'; end if;
 next_rev:=p_expected_revision+1;
 if p_command='create' then
  if old.revision is not null or (p_payload-array['reference','issued_on','due_on'])<>'{}'::jsonb then raise exception 'Invalid RFQ creation' using errcode='22023'; end if;
  issued:=private.mrh_procurement_date(p_payload,'issued_on'); due:=private.mrh_procurement_date(p_payload,'due_on');
  if due<issued then raise exception 'RFQ due date precedes issue date' using errcode='22023'; end if;
  s:=jsonb_build_object('reference',private.mrh_procurement_text(p_payload,'reference',240),'issued_on',issued,'due_on',due,
    'status','open','quotes','[]'::jsonb,'selection',null,'supplier_po_id',null,'client_po_id',null,'client_po_kind',null);
 else
  if old.revision is null then raise exception 'RFQ unavailable' using errcode='PT409'; end if;
  s:=old.snapshot; state:=s->>'status'; quotes:=s->'quotes';
  if p_command in ('add_quote','amend_quote') then
   if state<>'open' then raise exception 'Reopen RFQ before changing quotations' using errcode='PT409'; end if;
   qid:=(p_payload->>'quote_id')::uuid;
   if qid is null then raise exception 'Quotation ID required' using errcode='22023'; end if;
   select value into q from jsonb_array_elements(quotes) where value->>'id'=qid::text;
   if p_command='add_quote' then
    if q is not null then raise exception 'Quotation already exists' using errcode='PT409'; end if;
    if jsonb_array_length(quotes)>=50 then raise exception 'RFQ quotation limit reached' using errcode='22023'; end if;
    quotes:=quotes||jsonb_build_array(private.mrh_procurement_quote(p_payload,w,qid,1));
   else
    if q is null then raise exception 'Quotation unavailable' using errcode='PT409'; end if;
    qrev:=(q->>'revision')::bigint+1;
    select jsonb_agg(case when value->>'id'=qid::text then private.mrh_procurement_quote(p_payload,w,qid,qrev) else value end order by ordinality)
    into quotes from jsonb_array_elements(quotes) with ordinality;
   end if;
   s:=jsonb_set(s,'{quotes}',quotes);
  elsif p_command='select_quote' then
   if state<>'open' or (p_payload-array['quote_id','reason'])<>'{}'::jsonb then raise exception 'Invalid selection state' using errcode='PT409'; end if;
   qid:=(p_payload->>'quote_id')::uuid;
   select value into q from jsonb_array_elements(quotes) where value->>'id'=qid::text;
   if q is null then raise exception 'Quotation unavailable' using errcode='PT409'; end if;
   s:=s||jsonb_build_object('status','selected','selection',jsonb_build_object('quote_id',qid,'quote_revision',(q->>'revision')::bigint,'reason',private.mrh_procurement_text(p_payload,'reason',2000)));
  elsif p_command='link_po' then
   if state not in ('selected','po_linked') or (p_payload-array['supplier_po_id','client_po_id','client_po_kind'])<>'{}'::jsonb then raise exception 'Select a quotation before linking a PO' using errcode='PT409'; end if;
   supplier_id:=(p_payload->>'supplier_po_id')::uuid;
   client_id:=(p_payload->>'client_po_id')::uuid; client_kind:=p_payload->>'client_po_kind';
   select value into q from jsonb_array_elements(quotes) where value->>'id'=(s#>>'{selection,quote_id}');
   if supplier_id is null or q is null or not private.mrh_procurement_supplier_source(w,supplier_id,q->>'supplier') then raise exception 'Supplier PO unavailable or mismatched' using errcode='42501'; end if;
   if (client_id is null)<>(client_kind is null) or (client_id is not null and (client_kind not in ('native','legacy') or not private.mrh_procurement_client_source(w,client_id,client_kind))) then raise exception 'Client PO unavailable' using errcode='42501'; end if;
   s:=s||jsonb_build_object('status','po_linked','supplier_po_id',supplier_id,'client_po_id',client_id,'client_po_kind',client_kind);
  elsif p_command='cancel' then
   if state not in ('open','selected') or p_payload<>'{}'::jsonb then raise exception 'Invalid cancellation state' using errcode='PT409'; end if;
   s:=s||jsonb_build_object('status','cancelled','selection',null);
  elsif p_command='reopen' then
   if state not in ('selected','po_linked','cancelled') or p_payload<>'{}'::jsonb then raise exception 'Invalid reopen state' using errcode='PT409'; end if;
   s:=s||jsonb_build_object('status','open','selection',null,'supplier_po_id',null,'client_po_id',null,'client_po_kind',null);
  end if;
 end if;
 insert into private.mrh_procurement_revisions(rfq_id,revision,workspace_id,item_id,actor_id,operation_id,command,request,snapshot)
 values(p_rfq,next_rev,w,p_item,auth.uid(),p_operation,p_command,command_request,s);
 perform public.work_board_log('617c4c0f-e343-4b3b-8456-50d47dcbaf99','sourcing.procurement_changed','Material procurement workflow changed','item',p_item::text,
 jsonb_build_object('rfq_id',p_rfq,'revision',next_rev,'command',p_command));
 return jsonb_build_object('rfq_id',p_rfq,'revision',next_rev,'operation_id',p_operation,'replayed',false);
end $$;

-- Hide external record IDs when source access is revoked; entered quotation
-- terms remain readable under the existing material commercial VIEW contract.
create function private.mrh_procurement_visible_snapshot(s jsonb,w uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare quotes jsonb; result jsonb:=s;
begin
 if not coalesce(public.work_board_access('aa0d8acb-5f0e-4628-b0b4-76ef369b9f51','view'),false) then
  select coalesce(jsonb_agg(value-'supplier_source_id' order by ordinality),'[]'::jsonb) into quotes from jsonb_array_elements(s->'quotes') with ordinality;
  result:=jsonb_set(result,'{quotes}',quotes)-'supplier_po_id';
 end if;
 if not coalesce(public.has_module_access('order-intake',auth.uid()),false) then result:=result-array['client_po_id','client_po_kind']; end if;
 return result;
end $$;
create function public.mrh_procurement_read(p_item uuid,p_rfq uuid default null,p_before_revision bigint default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w uuid; rows jsonb;
begin
 w:=private.mrh_procurement_scope(p_item);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or
 (p_before_revision is not null and (p_rfq is null or p_before_revision<1)) then raise exception 'Invalid procurement page' using errcode='22023'; end if;
 if p_rfq is null then
  select coalesce(jsonb_agg(jsonb_build_object('rfq_id',r.rfq_id,'revision',r.revision,'created_at',r.created_at,'command',r.command,'snapshot',private.mrh_procurement_visible_snapshot(r.snapshot,w)) order by r.rfq_id),'[]'::jsonb)
  into rows from (select distinct on(rfq_id) * from private.mrh_procurement_revisions where workspace_id=w and item_id=p_item order by rfq_id,revision desc limit p_limit+1 offset p_offset) r;
 else
  select coalesce(jsonb_agg(jsonb_build_object('rfq_id',r.rfq_id,'revision',r.revision,'created_at',r.created_at,'command',r.command,'snapshot',private.mrh_procurement_visible_snapshot(r.snapshot,w)) order by r.revision desc),'[]'::jsonb)
  into rows from (select * from private.mrh_procurement_revisions where workspace_id=w and item_id=p_item and rfq_id=p_rfq and (p_before_revision is null or revision<p_before_revision) order by revision desc limit p_limit+1 offset p_offset) r;
 end if;
 return jsonb_build_object('item_id',p_item,'rows',case when jsonb_array_length(rows)>p_limit then rows-p_limit else rows end,'has_more',jsonb_array_length(rows)>p_limit);
end $$;

revoke all on function private.mrh_procurement_scope(uuid),private.mrh_procurement_text(jsonb,text,integer),private.mrh_procurement_number(jsonb,text,numeric),private.mrh_procurement_date(jsonb,text),private.mrh_procurement_supplier_source(uuid,uuid,text),private.mrh_procurement_client_source(uuid,uuid,text),private.mrh_procurement_quote(jsonb,uuid,uuid,bigint),private.mrh_procurement_visible_snapshot(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.mrh_procurement_apply(uuid,uuid,uuid,bigint,text,jsonb),public.mrh_procurement_read(uuid,uuid,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.mrh_procurement_apply(uuid,uuid,uuid,bigint,text,jsonb),public.mrh_procurement_read(uuid,uuid,bigint,integer,integer) to authenticated;
commit;
