-- All assertions run in an isolated disposable PostgreSQL database.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set test.board_permission='yes';
set test.mrh_role='ADMIN';
do $$
declare bid uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 item uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb; rejected boolean;
begin
 select public.mrh_sourcing_sensitive_write(bid,item,'Buying Price','25.50'::jsonb,null) into r;
 if r->>'revision'<>'1' then raise exception 'CAS create receipt invalid'; end if;
 select public.mrh_sourcing_sensitive_read(bid,item) into r;
 if r#>>'{Buying Price,value}'<>'25.50' then raise exception 'Authorized read failed'; end if;
 select public.mrh_sourcing_sensitive_write(bid,item,'Buying Price','40.00'::jsonb,1) into r;
 if r->>'revision'<>'2' then raise exception 'CAS update receipt invalid'; end if;
 rejected:=false;
 begin
  perform public.mrh_sourcing_sensitive_write(bid,item,'Buying Price','42'::jsonb,1);
 exception when sqlstate 'PT409' then rejected:=true; end;
 if not rejected then raise exception 'Stale CAS was accepted'; end if;
 rejected:=false;
 begin
  perform public.mrh_sourcing_sensitive_write(bid,item,'PHP Equivalent','1'::jsonb,null);
 exception when sqlstate '22023' then rejected:=true; end;
 if not rejected then raise exception 'Derived value accepted'; end if;
 rejected:=false;
 begin
  perform public.mrh_sourcing_sensitive_write(bid,item,'Currency','"DOGE"'::jsonb,null);
 exception when sqlstate '22023' then rejected:=true; end;
 if not rejected then raise exception 'Unsupported currency accepted'; end if;
 rejected:=false;
 begin
  perform public.mrh_sourcing_sensitive_read(bid,'55555555-5555-4555-8555-555555555555'::uuid);
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign item read accepted'; end if;
 rejected:=false;
 begin
  execute 'select count(*) from private.mrh_sourcing_sensitive_cells';
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Direct private table read accepted'; end if;
end $$;
set test.mrh_role='VIEWER';
do $$
declare rejected boolean:=false;
begin
 begin
  perform public.mrh_sourcing_sensitive_read(
   '617c4c0f-e343-4b3b-8456-50d47dcbaf99',
   '44444444-4444-4444-8444-444444444444');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Viewer read accepted'; end if;
end $$;
set test.mrh_role='ADMIN';
set test.board_permission='no';
do $$
declare rejected boolean:=false;
begin
 begin
  perform public.mrh_sourcing_sensitive_read(
   '617c4c0f-e343-4b3b-8456-50d47dcbaf99',
   '44444444-4444-4444-8444-444444444444');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Revoked board access accepted'; end if;
end $$;
set test.board_permission='yes';
set request.jwt.claim.sub='';
do $$
declare rejected boolean:=false;
begin
 begin
  perform public.mrh_sourcing_sensitive_read(
   '617c4c0f-e343-4b3b-8456-50d47dcbaf99',
   '44444444-4444-4444-8444-444444444444');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Expired session accepted'; end if;
end $$;
reset role;
set role anon;
do $$
declare rejected boolean:=false;
begin
 begin
  perform public.mrh_sourcing_sensitive_read(
   '617c4c0f-e343-4b3b-8456-50d47dcbaf99',
   '44444444-4444-4444-8444-444444444444');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Anonymous EXECUTE accepted'; end if;
end $$;
reset role;
do $$
begin
 if not (select relrowsecurity from pg_class where oid='private.mrh_sourcing_sensitive_cells'::regclass)
 then raise exception 'RLS disabled'; end if;
 if has_table_privilege('authenticated','private.mrh_sourcing_sensitive_cells','SELECT')
 then raise exception 'Table SELECT grant leaked'; end if;
end $$;
select 'MRH_SOURCING_VAULT_DISPOSABLE_DENIAL_PASS' as result;
