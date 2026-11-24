-- Initial confirmed company scope only. Separate provenance from the workforce review.
create table agt.company_scope_review(
 workspace_id uuid not null references agt.workspace(id),
 source_revision text not null check(source_revision ~ '^[0-9a-f]{64}$'),
 workforce_review_id uuid not null references agt.crm_source_review(review_id),
 actor_id uuid not null,
 captured_at timestamptz not null default statement_timestamp(),
 companies jsonb not null check(jsonb_typeof(companies)='array'),
 primary key(workspace_id,source_revision)
);
create trigger company_scope_review_immutable before update or delete on agt.company_scope_review for each row execute function agt.preserve_crm_source_review();
revoke all on agt.company_scope_review from public,anon,authenticated,service_role;

create function private.agt_bind_company_scope_v1(expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; source jsonb; roster jsonb; selected jsonb; rev text; workforce_review uuid; inserted integer;
begin
 if a is null then raise exception 'Signed context required' using errcode='42501';end if;
 -- Retain the existing signed workforce administration admission.
 roster:=private.agt_workforce_readback_v1();
 w:=(roster->>'workspaceId')::uuid;
 if w is distinct from '00000000-0000-4000-8000-000000000001'::uuid then raise exception 'Workspace unavailable' using errcode='42501';end if;
 perform 1 from agt.workspace where id=w for update;
 if not found or coalesce((roster->>'personnel')::integer,0)=0
 or roster->>'personnel' is distinct from roster->>'classifications'
 or roster->>'sourceRevision' is null
 or roster->>'sourceRevision' is distinct from roster->>'currentSourceRevision' then
  raise exception 'Verified workforce activation required';
 end if;
 workforce_review:=(roster->>'reviewId')::uuid;
 if not exists(select 1 from agt.crm_source_review s where s.workspace_id=w and s.review_id=workforce_review) then raise exception 'Workforce review unavailable';end if;
 -- Server-derived, existing board and FRT admissions; never trust client rows.
 source:=private.agt_commercial_board_sources_v1();
 if source->>'workspaceId' is distinct from w::text then raise exception 'Company scope mismatch';end if;
 selected:=source->'companies';
 rev:=encode(sha256(convert_to(selected::text,'UTF8')),'hex');
 if rev is distinct from expected_revision then raise exception 'Company source revision changed';end if;
 if jsonb_array_length(selected)<>3 or exists(
 select 1 from jsonb_array_elements(selected)x where x->>'workspaceId' is distinct from w::text
 or (x->>'code',x->>'id') not in (
 ('WASS','9b5fad85-97fa-47ea-95c8-182d0a511892'),
 ('WAO','044fe766-cd40-41ba-8bc5-e47f4cae8a8e'),
 ('PSTI','09ec5c72-4297-4c35-96d0-96557193bc93'))
 ) or (select count(distinct x->>'id') from jsonb_array_elements(selected)x)<>3 then raise exception 'Confirmed company identities unavailable';end if;
 if exists(select 1 from agt.entity e where e.workspace_id=w and not exists(select 1 from jsonb_array_elements(selected)x where e.id=(x->>'id')::uuid and e.code=x->>'code')) then raise exception 'Existing company mapping conflict';end if;
 if exists(select 1 from agt.company_scope_review s where s.workspace_id=w and s.source_revision=rev) then
  if (select count(*) from agt.entity where workspace_id=w)<>3 then raise exception 'Company persistence mismatch';end if;
  return jsonb_build_object('sourceRevision',rev,'companies',3,'inserted',0);
 end if;
 insert into agt.entity(workspace_id,id,code)
 select w,(x->>'id')::uuid,x->>'code' from jsonb_array_elements(selected)x
 on conflict(workspace_id,id) do nothing;
 get diagnostics inserted=row_count;
 if (select count(*) from agt.entity where workspace_id=w)<>3 then raise exception 'Company persistence mismatch';end if;
 insert into agt.company_scope_review(workspace_id,source_revision,workforce_review_id,actor_id,companies)
 values(w,rev,workforce_review,a,selected);
 update agt.workspace set revision=revision+1 where id=w;
 return jsonb_build_object('sourceRevision',rev,'companies',3,'inserted',inserted);
end $$;

create function public.agt_bind_company_scope_v1(expected_revision text)
returns jsonb language sql security invoker set search_path='' as $$select private.agt_bind_company_scope_v1(expected_revision)$$;
-- Company-only digest and signed persistence readback, without disclosing personnel.
create function private.agt_company_scope_status_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source jsonb; w uuid; rev text; result jsonb;
begin
 source:=private.agt_commercial_board_sources_v1();w:=(source->>'workspaceId')::uuid;
 rev:=encode(sha256(convert_to((source->'companies')::text,'UTF8')),'hex');
 select jsonb_build_object('workspaceId',w,'sourceRevision',rev,
 'persistedCompanies',(select count(*) from agt.entity where workspace_id=w),
 'matchedCompanies',(select count(*) from agt.entity e join jsonb_array_elements(source->'companies')x on e.id=(x->>'id')::uuid and e.code=x->>'code' where e.workspace_id=w),
 'reviewExists',exists(select 1 from agt.company_scope_review s where s.workspace_id=w and s.source_revision=rev))
 into result;
 return result;
end $$;
create function public.agt_company_scope_status_v1()
returns jsonb language sql stable security invoker set search_path='' as $$select private.agt_company_scope_status_v1()$$;
revoke all on function private.agt_bind_company_scope_v1(text),public.agt_bind_company_scope_v1(text),private.agt_company_scope_status_v1(),public.agt_company_scope_status_v1() from public,anon,authenticated,service_role;
grant execute on function private.agt_bind_company_scope_v1(text),public.agt_bind_company_scope_v1(text),private.agt_company_scope_status_v1(),public.agt_company_scope_status_v1() to authenticated;
;
