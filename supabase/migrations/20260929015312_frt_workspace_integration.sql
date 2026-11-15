create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.frt_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('REQUESTOR','FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER')),
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active','disabled')),
  department text,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.frt_companies (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null check (code in ('WAO','WASS','PSTI')), name text not null, display_order int not null,
  created_at timestamptz not null default now(), unique(workspace_id,code), unique(workspace_id,display_order)
);

create table if not exists public.frt_voucher_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.frt_companies(id) on delete cascade,
  voucher_year int not null, last_number int not null default 0 check(last_number>=0),
  primary key(workspace_id,company_id,voucher_year)
);

create table if not exists public.frt_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.frt_companies(id), requestor_id uuid not null references auth.users(id), voucher_no text not null,
  title text not null, department text not null, fund_source text not null, recipient_name text, recipient_bank text, recipient_account text,
  date_needed date not null, description text not null, order_intake_no text, check_no text, total_amount numeric(14,2) not null check(total_amount>=0),
  status text not null default 'PENDING_APPROVAL' check(status in ('PENDING_APPROVAL','IN_PROGRESS','DONE','BLOCKED','CLOSED','REJECTED')),
  liquidation_status text not null default 'NOT_SUBMITTED' check(liquidation_status in ('NOT_SUBMITTED','SUBMITTED','UNDER_REVIEW','APPROVED','RETURNED')),
  finance_approved_by uuid references auth.users(id), finance_approved_at timestamptz,
  transfer_confirmed_by uuid references auth.users(id), transfer_confirmed_at timestamptz, transfer_reference text,
  closed_by uuid references auth.users(id), closed_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,company_id,voucher_no)
);
create index if not exists frt_requests_workspace_company_status_idx on public.frt_requests(workspace_id,company_id,status,created_at desc);
create index if not exists frt_requests_requestor_idx on public.frt_requests(workspace_id,requestor_id,created_at desc);

create table if not exists public.frt_request_items (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fund_request_id uuid not null references public.frt_requests(id) on delete cascade, category text not null,
  amount numeric(14,2) not null check(amount>=0), notes text, created_at timestamptz not null default now()
);
create table if not exists public.frt_liquidations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fund_request_id uuid not null references public.frt_requests(id) on delete cascade,
  submitted_by uuid references auth.users(id), submitted_at timestamptz, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  notes text, total_spent numeric(14,2) not null default 0, excess_or_deficit numeric(14,2) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,fund_request_id)
);
create table if not exists public.frt_liquidation_items (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  liquidation_id uuid not null references public.frt_liquidations(id) on delete cascade, description text not null, vendor text, or_invoice_no text,
  amount numeric(14,2) not null check(amount>=0), created_at timestamptz not null default now()
);
create table if not exists public.frt_attachments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fund_request_id uuid not null references public.frt_requests(id) on delete cascade, uploaded_by uuid not null references auth.users(id),
  object_path text not null unique, file_name text not null, mime_type text not null, file_size bigint not null check(file_size>=0),
  category text not null default 'supporting_document', created_at timestamptz not null default now()
);
create table if not exists public.frt_comments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fund_request_id uuid not null references public.frt_requests(id) on delete cascade, user_id uuid not null references auth.users(id),
  body text not null check(length(body) between 1 and 4000), created_at timestamptz not null default now()
);
create table if not exists public.frt_audit_logs (
  id bigserial primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fund_request_id uuid references public.frt_requests(id) on delete cascade, user_id uuid references auth.users(id),
  action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists frt_audit_request_idx on public.frt_audit_logs(workspace_id,fund_request_id,created_at desc);

create or replace function private.frt_current_role(p_workspace_id uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
  select m.role from public.frt_memberships m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.enabled=true and m.status='active' limit 1;
$$;
create or replace function private.frt_has_membership(p_workspace_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists(select 1 from public.frt_memberships m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.enabled=true and m.status='active');
$$;
create or replace function private.frt_has_role(p_workspace_id uuid, variadic p_roles text[]) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(private.frt_current_role(p_workspace_id)=any(p_roles),false);
$$;
revoke all on function private.frt_current_role(uuid) from public,anon;
revoke all on function private.frt_has_membership(uuid) from public,anon;
revoke all on function private.frt_has_role(uuid,text[]) from public,anon;
grant execute on function private.frt_current_role(uuid) to authenticated;
grant execute on function private.frt_has_membership(uuid) to authenticated;
grant execute on function private.frt_has_role(uuid,text[]) to authenticated;

insert into public.frt_memberships(workspace_id,user_id,role,display_name,email)
select wm.workspace_id, wm.user_id,
       case when p.platform_role='admin_general_manager' then 'GENERAL_MANAGER' else 'REQUESTOR' end,
       p.display_name,p.email
from public.workspace_members wm join public.profiles p on p.id=wm.user_id
where wm.active=true
on conflict(workspace_id,user_id) do nothing;

insert into public.frt_companies(workspace_id,code,name,display_order)
select w.id,v.code,v.name,v.ord from public.workspaces w cross join (values
 ('WAO','Watchdog Automation OPC',1),('WASS','Watchdog Automation Sales & Services',2),('PSTI','Process Solutions Technology Inc.',3)
) as v(code,name,ord)
on conflict(workspace_id,code) do update set name=excluded.name,display_order=excluded.display_order;

alter table public.frt_memberships enable row level security;
alter table public.frt_companies enable row level security;
alter table public.frt_requests enable row level security;
alter table public.frt_request_items enable row level security;
alter table public.frt_liquidations enable row level security;
alter table public.frt_liquidation_items enable row level security;
alter table public.frt_attachments enable row level security;
alter table public.frt_comments enable row level security;
alter table public.frt_audit_logs enable row level security;

do $$ declare t text; begin
  foreach t in array array['frt_memberships','frt_companies','frt_requests','frt_request_items','frt_liquidations','frt_liquidation_items','frt_attachments','frt_comments','frt_audit_logs'] loop
    execute format('drop policy if exists frt_member_select on public.%I',t);
    execute format('create policy frt_member_select on public.%I for select to authenticated using (private.frt_has_membership(workspace_id))',t);
  end loop;
end $$;
revoke insert,update,delete on public.frt_memberships,public.frt_companies,public.frt_requests,public.frt_request_items,public.frt_liquidations,public.frt_liquidation_items,public.frt_attachments,public.frt_comments,public.frt_audit_logs from authenticated;

create or replace function public.frt_bootstrap(p_workspace_id uuid) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare m public.frt_memberships; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into m from public.frt_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and enabled=true and status='active';
 if m.user_id is null then raise exception 'Active Fund Released Tracker membership is required'; end if;
 return jsonb_build_object('membership',to_jsonb(m),'companies',(select coalesce(jsonb_agg(to_jsonb(c) order by c.display_order),'[]'::jsonb) from public.frt_companies c where c.workspace_id=p_workspace_id));
end $$;

create or replace function public.frt_companies(p_workspace_id uuid) returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
 select case when private.frt_has_membership(p_workspace_id) then coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'display_order',display_order) order by display_order),'[]'::jsonb) else (select jsonb_agg(x) from (select null where false) x) end from public.frt_companies where workspace_id=p_workspace_id;
$$;

create or replace function public.frt_list_requests(p_workspace_id uuid,p_company text,p_search text default '') returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
 if not private.frt_has_membership(p_workspace_id) then raise exception 'Active Fund Released Tracker membership is required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
   select fr.id,fr.voucher_no,fr.title,fr.department,fr.fund_source,to_char(fr.date_needed,'YYYY-MM-DD') date_needed,fr.total_amount,fr.status,fr.liquidation_status,
   fr.finance_approved_at,fr.transfer_confirmed_at,fr.created_at,fr.requestor_id,coalesce(m.display_name,m.email,'Unknown user') requestor,c.code company_code,
   (select count(*)::int from public.frt_attachments a where a.workspace_id=p_workspace_id and a.fund_request_id=fr.id) attachment_count
   from public.frt_requests fr join public.frt_companies c on c.id=fr.company_id and c.workspace_id=fr.workspace_id
   left join public.frt_memberships m on m.workspace_id=fr.workspace_id and m.user_id=fr.requestor_id
   where fr.workspace_id=p_workspace_id and c.code=p_company and fr.archived_at is null and (coalesce(p_search,'')='' or fr.title ilike '%'||p_search||'%' or fr.voucher_no ilike '%'||p_search||'%' or coalesce(m.display_name,'') ilike '%'||p_search||'%' or fr.department ilike '%'||p_search||'%')
   limit 500
 ) x);
end $$;

create or replace function public.frt_get_request(p_workspace_id uuid,p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare result jsonb; begin
 if not private.frt_has_membership(p_workspace_id) then raise exception 'Active Fund Released Tracker membership is required'; end if;
 select to_jsonb(x) || jsonb_build_object(
   'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb) from public.frt_request_items i where i.workspace_id=p_workspace_id and i.fund_request_id=p_request_id),
   'attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'file_size',a.file_size,'category',a.category,'created_at',a.created_at) order by a.created_at desc),'[]'::jsonb) from public.frt_attachments a where a.workspace_id=p_workspace_id and a.fund_request_id=p_request_id),
   'comments',(select coalesce(jsonb_agg(to_jsonb(cmt) order by cmt.created_at desc),'[]'::jsonb) from (select c.*,coalesce(m.display_name,m.email,'Unknown user') full_name from public.frt_comments c left join public.frt_memberships m on m.workspace_id=c.workspace_id and m.user_id=c.user_id where c.workspace_id=p_workspace_id and c.fund_request_id=p_request_id) cmt),
   'audit',(select coalesce(jsonb_agg(to_jsonb(aud) order by aud.created_at desc),'[]'::jsonb) from (select a.*,coalesce(m.display_name,m.email) full_name from public.frt_audit_logs a left join public.frt_memberships m on m.workspace_id=a.workspace_id and m.user_id=a.user_id where a.workspace_id=p_workspace_id and a.fund_request_id=p_request_id) aud),
   'liquidation',(select case when l.id is null then null else to_jsonb(l)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(li) order by li.created_at),'[]'::jsonb) from public.frt_liquidation_items li where li.workspace_id=p_workspace_id and li.liquidation_id=l.id)) end from public.frt_liquidations l where l.workspace_id=p_workspace_id and l.fund_request_id=p_request_id)
 ) into result from (
   select fr.*,to_char(fr.date_needed,'YYYY-MM-DD') date_needed,c.code company_code,c.name company_name,coalesce(m.display_name,m.email,'Unknown user') requestor,m.email requestor_email
   from public.frt_requests fr join public.frt_companies c on c.id=fr.company_id and c.workspace_id=fr.workspace_id left join public.frt_memberships m on m.workspace_id=fr.workspace_id and m.user_id=fr.requestor_id
   where fr.workspace_id=p_workspace_id and fr.id=p_request_id and fr.archived_at is null
 ) x;
 if result is null then raise exception 'Request not found'; end if; return result;
end $$;

create or replace function public.frt_create_request(p_workspace_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare company public.frt_companies; seq int; yr int:=extract(year from now()); req public.frt_requests; item jsonb; total numeric:=0; begin
 if not private.frt_has_membership(p_workspace_id) then raise exception 'Active Fund Released Tracker membership is required'; end if;
 if length(trim(coalesce(p_payload->>'title','')))<3 or length(trim(coalesce(p_payload->>'department','')))<2 or length(trim(coalesce(p_payload->>'fundSource','')))<2 or length(trim(coalesce(p_payload->>'description','')))<3 then raise exception 'Invalid request data'; end if;
 select * into company from public.frt_companies where workspace_id=p_workspace_id and code=p_payload->>'company'; if company.id is null then raise exception 'Invalid company'; end if;
 if jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))<1 then raise exception 'At least one expense category is required'; end if;
 for item in select * from jsonb_array_elements(p_payload->'items') loop total:=total+(item->>'amount')::numeric; if (item->>'amount')::numeric<=0 then raise exception 'Expense amounts must be positive'; end if; end loop;
 insert into public.frt_voucher_counters(workspace_id,company_id,voucher_year,last_number) values(p_workspace_id,company.id,yr,1)
 on conflict(workspace_id,company_id,voucher_year) do update set last_number=public.frt_voucher_counters.last_number+1 returning last_number into seq;
 insert into public.frt_requests(workspace_id,company_id,requestor_id,voucher_no,title,department,fund_source,recipient_name,recipient_bank,recipient_account,date_needed,description,order_intake_no,check_no,total_amount)
 values(p_workspace_id,company.id,auth.uid(),format('DV-%s-%s-%s',company.code,yr,lpad(seq::text,3,'0')),trim(p_payload->>'title'),trim(p_payload->>'department'),trim(p_payload->>'fundSource'),nullif(p_payload->>'recipientName',''),nullif(p_payload->>'recipientBank',''),nullif(p_payload->>'recipientAccount',''),(p_payload->>'dateNeeded')::date,trim(p_payload->>'description'),nullif(p_payload->>'orderIntakeNo',''),nullif(p_payload->>'checkNo',''),total) returning * into req;
 for item in select * from jsonb_array_elements(p_payload->'items') loop insert into public.frt_request_items(workspace_id,fund_request_id,category,amount,notes) values(p_workspace_id,req.id,trim(item->>'category'),(item->>'amount')::numeric,nullif(item->>'notes','')); end loop;
 insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,req.id,auth.uid(),'REQUEST_CREATED',jsonb_build_object('voucher',req.voucher_no,'total',total,'company',company.code));
 return to_jsonb(req);
end $$;

create or replace function public.frt_update_request(p_workspace_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 if not private.frt_has_role(p_workspace_id,'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
 update public.frt_requests set title=coalesce(nullif(p_payload->>'title',''),title),department=coalesce(nullif(p_payload->>'department',''),department),fund_source=coalesce(nullif(p_payload->>'fundSource',''),fund_source),date_needed=coalesce(nullif(p_payload->>'dateNeeded','')::date,date_needed),description=coalesce(nullif(p_payload->>'description',''),description),recipient_name=case when p_payload ? 'recipientName' then nullif(p_payload->>'recipientName','') else recipient_name end,recipient_bank=case when p_payload ? 'recipientBank' then nullif(p_payload->>'recipientBank','') else recipient_bank end,recipient_account=case when p_payload ? 'recipientAccount' then nullif(p_payload->>'recipientAccount','') else recipient_account end,order_intake_no=case when p_payload ? 'orderIntakeNo' then nullif(p_payload->>'orderIntakeNo','') else order_intake_no end,check_no=case when p_payload ? 'checkNo' then nullif(p_payload->>'checkNo','') else check_no end,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id and archived_at is null;
 if not found then raise exception 'Request not found'; end if;
 insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'REQUEST_CORRECTED',p_payload); return jsonb_build_object('ok',true);
end $$;

create or replace function public.frt_request_action(p_workspace_id uuid,p_request_id uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.frt_requests; reason text; reference text; gm_cleared boolean:=false; begin
 select * into r from public.frt_requests where workspace_id=p_workspace_id and id=p_request_id and archived_at is null for update;
 if r.id is null then raise exception 'Request not found'; end if;
 if p_action='approve' then
   if not private.frt_has_role(p_workspace_id,'FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   if r.status<>'PENDING_APPROVAL' then raise exception 'Request is not eligible for approval'; end if;
   update public.frt_requests set status='DONE',finance_approved_by=auth.uid(),finance_approved_at=now(),updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action) values(p_workspace_id,p_request_id,auth.uid(),'FINANCE_APPROVED');
 elsif p_action='approve/revoke' then
   if not private.frt_has_role(p_workspace_id,'FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   reason:=trim(coalesce(p_payload->>'reason','')); if length(reason)<3 then raise exception 'Revocation reason is required'; end if;
   if r.finance_approved_at is null or r.status in ('CLOSED','REJECTED') then raise exception 'Request has no revocable Finance approval'; end if;
   if r.liquidation_status<>'NOT_SUBMITTED' then raise exception 'Finance approval cannot be revoked after liquidation has started'; end if;
   gm_cleared:=r.transfer_confirmed_at is not null;
   update public.frt_requests set status='PENDING_APPROVAL',finance_approved_by=null,finance_approved_at=null,transfer_confirmed_by=null,transfer_confirmed_at=null,transfer_reference=null,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'FINANCE_APPROVAL_REVOKED',jsonb_build_object('reason',reason,'previousFinanceApproverId',r.finance_approved_by,'gmVerificationCleared',gm_cleared));
   return jsonb_build_object('ok',true,'gmVerificationCleared',gm_cleared);
 elsif p_action='reject' then
   if not private.frt_has_role(p_workspace_id,'FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   reason:=trim(coalesce(p_payload->>'reason','')); if length(reason)<3 then raise exception 'Rejection reason is required'; end if;
   if r.status<>'PENDING_APPROVAL' then raise exception 'Request is not eligible for rejection'; end if;
   update public.frt_requests set status='REJECTED',updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'REQUEST_REJECTED',jsonb_build_object('reason',reason));
 elsif p_action='transfer' then
   if not private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   if r.finance_approved_at is null or r.transfer_confirmed_at is not null or r.status in ('CLOSED','REJECTED') then raise exception 'Request is not eligible for General Manager verification'; end if;
   reference:=nullif(trim(coalesce(p_payload->>'reference','')),'');
   update public.frt_requests set transfer_confirmed_by=auth.uid(),transfer_confirmed_at=now(),transfer_reference=reference,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'GM_VERIFIED',case when reference is null then '{}'::jsonb else jsonb_build_object('reference',reference) end);
 elsif p_action='transfer/revoke' then
   if not private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   reason:=trim(coalesce(p_payload->>'reason','')); if length(reason)<3 then raise exception 'Revocation reason is required'; end if;
   if r.transfer_confirmed_at is null or r.status in ('CLOSED','REJECTED') then raise exception 'Request has no revocable General Manager verification'; end if;
   update public.frt_requests set transfer_confirmed_by=null,transfer_confirmed_at=null,transfer_reference=null,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'GM_VERIFICATION_REVOKED',jsonb_build_object('reason',reason));
 elsif p_action='close' then
   if not private.frt_has_role(p_workspace_id,'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   if r.finance_approved_at is null or r.status in ('CLOSED','REJECTED') or r.liquidation_status<>'APPROVED' then raise exception 'Only finance-approved requests with approved liquidation can be closed'; end if;
   update public.frt_requests set status='CLOSED',closed_by=auth.uid(),closed_at=now(),updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action) values(p_workspace_id,p_request_id,auth.uid(),'REQUEST_CLOSED');
 elsif p_action='archive' then
   if not private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   update public.frt_requests set archived_at=now(),updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action) values(p_workspace_id,p_request_id,auth.uid(),'REQUEST_ARCHIVED');
 elsif p_action='liquidation/approve' then
   if not private.frt_has_role(p_workspace_id,'FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
   if r.finance_approved_at is null or r.status in ('CLOSED','REJECTED') or r.liquidation_status<>'SUBMITTED' then raise exception 'Request has no eligible submitted liquidation'; end if;
   update public.frt_requests set liquidation_status='APPROVED',updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
   update public.frt_liquidations set reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where workspace_id=p_workspace_id and fund_request_id=p_request_id and submitted_at is not null;
   if not found then raise exception 'Submitted liquidation record not found'; end if;
   insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action) values(p_workspace_id,p_request_id,auth.uid(),'LIQUIDATION_APPROVED');
 else raise exception 'Unsupported request action: %',p_action;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.frt_add_comment(p_workspace_id uuid,p_request_id uuid,p_body text) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 if not private.frt_has_membership(p_workspace_id) then raise exception 'Active Fund Released Tracker membership is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>4000 then raise exception 'Invalid comment'; end if;
 if not exists(select 1 from public.frt_requests where workspace_id=p_workspace_id and id=p_request_id and archived_at is null) then raise exception 'Request not found'; end if;
 insert into public.frt_comments(workspace_id,fund_request_id,user_id,body) values(p_workspace_id,p_request_id,auth.uid(),trim(p_body));
 insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action) values(p_workspace_id,p_request_id,auth.uid(),'COMMENT_ADDED');
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.frt_register_attachment(p_workspace_id uuid,p_request_id uuid,p_object_path text,p_file_name text,p_mime_type text,p_file_size bigint,p_category text default 'supporting_document') returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.frt_requests; a public.frt_attachments; role text; begin
 role:=private.frt_current_role(p_workspace_id); if role is null then raise exception 'Active Fund Released Tracker membership is required'; end if;
 select * into r from public.frt_requests where workspace_id=p_workspace_id and id=p_request_id and archived_at is null;
 if r.id is null then raise exception 'Request not found'; end if;
 if role='REQUESTOR' and r.requestor_id<>auth.uid() then raise exception 'Requestors may upload files only to their own requests'; end if;
 if p_file_size<0 or p_file_size>15728640 then raise exception 'File exceeds the 15 MB upload limit'; end if;
 insert into public.frt_attachments(workspace_id,fund_request_id,uploaded_by,object_path,file_name,mime_type,file_size,category) values(p_workspace_id,p_request_id,auth.uid(),p_object_path,p_file_name,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_file_size,coalesce(nullif(p_category,''),'supporting_document')) returning * into a;
 insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'ATTACHMENT_UPLOADED',jsonb_build_object('file',p_file_name,'category',p_category));
 return jsonb_build_object('id',a.id,'file_name',a.file_name);
end $$;

create or replace function public.frt_submit_liquidation(p_workspace_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare r public.frt_requests; l public.frt_liquidations; item jsonb; total numeric:=0; role text; begin
 role:=private.frt_current_role(p_workspace_id); if role is null then raise exception 'Active Fund Released Tracker membership is required'; end if;
 select * into r from public.frt_requests where workspace_id=p_workspace_id and id=p_request_id and archived_at is null for update;
 if r.id is null then raise exception 'Request not found'; end if;
 if r.finance_approved_at is null or r.status in ('CLOSED','REJECTED') then raise exception 'Finance approval is required before liquidation can be submitted'; end if;
 if r.liquidation_status='APPROVED' then raise exception 'Approved liquidation can no longer be replaced'; end if;
 if role='REQUESTOR' and r.requestor_id<>auth.uid() then raise exception 'Requestors may liquidate only their own requests'; end if;
 if jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))<1 then raise exception 'At least one liquidation item is required'; end if;
 for item in select * from jsonb_array_elements(p_payload->'items') loop total:=total+(item->>'amount')::numeric; if (item->>'amount')::numeric<=0 then raise exception 'Liquidation amounts must be positive'; end if; end loop;
 insert into public.frt_liquidations(workspace_id,fund_request_id,submitted_by,submitted_at,notes,total_spent,excess_or_deficit) values(p_workspace_id,p_request_id,auth.uid(),now(),nullif(p_payload->>'notes',''),total,r.total_amount-total)
 on conflict(workspace_id,fund_request_id) do update set submitted_by=excluded.submitted_by,submitted_at=now(),notes=excluded.notes,total_spent=excluded.total_spent,excess_or_deficit=excluded.excess_or_deficit,reviewed_by=null,reviewed_at=null,updated_at=now() returning * into l;
 delete from public.frt_liquidation_items where workspace_id=p_workspace_id and liquidation_id=l.id;
 for item in select * from jsonb_array_elements(p_payload->'items') loop insert into public.frt_liquidation_items(workspace_id,liquidation_id,description,vendor,or_invoice_no,amount) values(p_workspace_id,l.id,trim(item->>'description'),nullif(item->>'vendor',''),nullif(item->>'orInvoiceNo',''),(item->>'amount')::numeric); end loop;
 update public.frt_requests set liquidation_status='SUBMITTED',updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
 insert into public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details) values(p_workspace_id,p_request_id,auth.uid(),'LIQUIDATION_SUBMITTED',jsonb_build_object('total',total));
 return jsonb_build_object('ok',true,'total',total);
end $$;

create or replace function public.frt_dashboard(p_workspace_id uuid,p_company text) returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare result jsonb; begin
 if not private.frt_has_membership(p_workspace_id) then raise exception 'Active Fund Released Tracker membership is required'; end if;
 select jsonb_build_object('total_requests',count(*)::int,'total_amount',coalesce(sum(fr.total_amount),0),'pending',count(*) filter(where fr.status='PENDING_APPROVAL'),'in_progress',count(*) filter(where fr.finance_approved_at is not null and fr.status not in ('CLOSED','REJECTED')),'completed',count(*) filter(where fr.status in ('DONE','CLOSED')),'released',coalesce(sum(fr.total_amount) filter(where fr.status in ('DONE','CLOSED')),0),'pending_liquidation_count',count(*) filter(where fr.finance_approved_at is not null and fr.status not in ('CLOSED','REJECTED') and fr.liquidation_status<>'APPROVED'),'pending_liquidation',coalesce(sum(fr.total_amount) filter(where fr.finance_approved_at is not null and fr.status not in ('CLOSED','REJECTED') and fr.liquidation_status<>'APPROVED'),0)) into result from public.frt_requests fr join public.frt_companies c on c.id=fr.company_id and c.workspace_id=fr.workspace_id where fr.workspace_id=p_workspace_id and c.code=p_company and fr.archived_at is null;
 return result || jsonb_build_object(
   'top_categories',(select coalesce(jsonb_agg(to_jsonb(x) order by x.amount desc),'[]'::jsonb) from (select i.category,sum(i.amount)::numeric amount from public.frt_request_items i join public.frt_requests fr on fr.id=i.fund_request_id and fr.workspace_id=i.workspace_id join public.frt_companies c on c.id=fr.company_id and c.workspace_id=fr.workspace_id where fr.workspace_id=p_workspace_id and c.code=p_company and fr.archived_at is null group by i.category order by sum(i.amount) desc limit 5) x),
   'monthly_trend',(select coalesce(jsonb_agg(to_jsonb(x) order by x.period),'[]'::jsonb) from (select to_char(date_trunc('month',fr.created_at),'YYYY-MM') period,coalesce(sum(fr.total_amount),0)::numeric requested,coalesce(sum(fr.total_amount) filter(where fr.status in ('DONE','CLOSED')),0)::numeric released from public.frt_requests fr join public.frt_companies c on c.id=fr.company_id and c.workspace_id=fr.workspace_id where fr.workspace_id=p_workspace_id and c.code=p_company and fr.archived_at is null and extract(year from fr.created_at)=extract(year from current_date) group by date_trunc('month',fr.created_at)) x)
 );
end $$;

create or replace function public.frt_admin_users(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
 if not private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'email',m.email,'full_name',m.display_name,'role',m.role,'department',m.department,'is_active',(m.enabled and m.status='active'),'created_at',m.created_at) order by coalesce(m.display_name,m.email)),'[]'::jsonb) from public.frt_memberships m where m.workspace_id=p_workspace_id);
end $$;

create or replace function public.frt_admin_set_role(p_workspace_id uuid,p_user_id uuid,p_role text) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 if not private.frt_has_role(p_workspace_id,'GENERAL_MANAGER') then raise exception 'Insufficient permissions'; end if;
 if p_role not in ('REQUESTOR','FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') then raise exception 'Unsupported Fund Tracker role'; end if;
 if p_user_id=auth.uid() and p_role<>'GENERAL_MANAGER' then raise exception 'You cannot remove your own General Manager role'; end if;
 update public.frt_memberships set role=p_role,updated_at=now() where workspace_id=p_workspace_id and user_id=p_user_id; if not found then raise exception 'User not found'; end if;
 insert into public.frt_audit_logs(workspace_id,user_id,action,details) values(p_workspace_id,auth.uid(),'USER_ROLE_CHANGED',jsonb_build_object('targetUserId',p_user_id,'role',p_role));
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.frt_bootstrap(uuid) from public,anon;
revoke all on function public.frt_companies(uuid) from public,anon;
revoke all on function public.frt_list_requests(uuid,text,text) from public,anon;
revoke all on function public.frt_get_request(uuid,uuid) from public,anon;
revoke all on function public.frt_create_request(uuid,jsonb) from public,anon;
revoke all on function public.frt_update_request(uuid,uuid,jsonb) from public,anon;
revoke all on function public.frt_request_action(uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.frt_add_comment(uuid,uuid,text) from public,anon;
revoke all on function public.frt_register_attachment(uuid,uuid,text,text,text,bigint,text) from public,anon;
revoke all on function public.frt_submit_liquidation(uuid,uuid,jsonb) from public,anon;
revoke all on function public.frt_dashboard(uuid,text) from public,anon;
revoke all on function public.frt_admin_users(uuid) from public,anon;
revoke all on function public.frt_admin_set_role(uuid,uuid,text) from public,anon;
grant execute on function public.frt_bootstrap(uuid),public.frt_companies(uuid),public.frt_list_requests(uuid,text,text),public.frt_get_request(uuid,uuid),public.frt_create_request(uuid,jsonb),public.frt_update_request(uuid,uuid,jsonb),public.frt_request_action(uuid,uuid,text,jsonb),public.frt_add_comment(uuid,uuid,text),public.frt_register_attachment(uuid,uuid,text,text,text,bigint,text),public.frt_submit_liquidation(uuid,uuid,jsonb),public.frt_dashboard(uuid,text),public.frt_admin_users(uuid),public.frt_admin_set_role(uuid,uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('frt-attachments','frt-attachments',false,15728640) on conflict(id) do update set public=false,file_size_limit=15728640;
drop policy if exists frt_storage_select on storage.objects;
create policy frt_storage_select on storage.objects for select to authenticated using(bucket_id='frt-attachments' and private.frt_has_membership((storage.foldername(name))[1]::uuid));
drop policy if exists frt_storage_insert on storage.objects;
create policy frt_storage_insert on storage.objects for insert to authenticated with check(bucket_id='frt-attachments' and owner_id=auth.uid()::text and private.frt_has_membership((storage.foldername(name))[1]::uuid));
drop policy if exists frt_storage_delete on storage.objects;
create policy frt_storage_delete on storage.objects for delete to authenticated using(bucket_id='frt-attachments' and owner_id=auth.uid()::text and private.frt_has_membership((storage.foldername(name))[1]::uuid));;
