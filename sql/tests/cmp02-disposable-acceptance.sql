-- CMP-02 disposable PG17 acceptance; zero writes to production.
\set ON_ERROR_STOP on
DO $cmp02_accept$
DECLARE
 b uuid:='30000000-0000-4000-8000-000000000001';
 f uuid:='30000000-0000-4000-8000-000000000002';
 owner_id text:='20000000-0000-4000-8000-000000000001';
 editor_id text:='20000000-0000-4000-8000-000000000002';
 foreign_id text:='20000000-0000-4000-8000-000000000004';
 col_phone uuid; col_rating uuid; col_percent uuid;
 receipt jsonb; first_revision timestamptz; denied boolean;
BEGIN
 if public.work_board_normalize_column_config('rating','{}'::jsonb)<>'{"max":5}'::jsonb or
    public.work_board_normalize_column_config('rating','{"max":7}'::jsonb)<>'{"max":7}'::jsonb or
    public.work_board_normalize_column_config('percentage','{"decimals":3}'::jsonb)<>'{"decimals":3}'::jsonb or
    public.work_board_normalize_column_config('phone','{}'::jsonb)<>'{}'::jsonb then
   raise exception 'CMP02 config normalization mismatch';
 end if;
 -- Existing core types must continue to normalize without mutation.
 if public.work_board_normalize_column_config('text','{}'::jsonb)<>'{}'::jsonb or
    jsonb_array_length(public.work_board_normalize_column_config('status','{}'::jsonb)->'labels')<>4 then
   raise exception 'CMP02 broke existing board configuration';
 end if;
 denied:=false;
 begin perform public.work_board_normalize_column_config('rating','{"max":11}'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Invalid rating scale accepted'; end if;
 denied:=false;
 begin perform public.work_board_normalize_column_config('percentage','{"decimals":2.5}'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Fractional percent precision accepted'; end if;
 denied:=false;
 begin perform public.work_board_normalize_column_config('phone','{"unknown":"yes"}'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Unsupported phone configuration accepted'; end if;

 perform pg_catalog.set_config('request.jwt.claim.sub',owner_id,false);
 perform pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 if not public.work_board_access(b,'manage') then raise exception 'Manager fixture failed'; end if;
 first_revision:=(select updated_at from public.work_boards where id=b);
 receipt:=public.wm_board_schema_mutate(b,first_revision,'create',null,
  'Phone contact','phone','{}'::jsonb,true,false);
 col_phone:=(receipt->>'column_id')::uuid;
 receipt:=public.wm_board_schema_mutate(b,(select updated_at from public.work_boards where id=b),
  'create',null,'Rating points','rating','{"max":7}'::jsonb,true,false);
 col_rating:=(receipt->>'column_id')::uuid;
 receipt:=public.wm_board_schema_mutate(b,(select updated_at from public.work_boards where id=b),
  'create',null,'Progress percent','percentage','{"decimals":2}'::jsonb,true,false);
 col_percent:=(receipt->>'column_id')::uuid;
 if (select count(*) from public.work_board_columns where board_id=b and
   id in (col_phone,col_rating,col_percent) and column_key like 'custom:%')<>3 then
  raise exception 'CMP02 native columns not saved via audited CAS';
 end if;
 if public.work_board_validate_column_value(b,col_phone,'"+15125550123"'::jsonb)<>'"+15125550123"'::jsonb or
    public.work_board_validate_column_value(b,col_rating,'7'::jsonb)<>'7'::jsonb or
    public.work_board_validate_column_value(b,col_percent,'12.25'::jsonb)<>'12.25'::jsonb or
    public.work_board_validate_column_value(b,col_percent,'0'::jsonb)<>'0'::jsonb then
   raise exception 'CMP02 accepted values were changed unexpectedly';
 end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_phone,'"02123456789"'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Unqualified phone number accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_phone,'"+1;DROP TABLE users"'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Unsafe phone value accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_rating,'8'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Out of range rating accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_rating,'2.5'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Fractional rating accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_rating,'"4"'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'String rating accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_percent,'100.001'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Out-of-range percentage accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_percent,'12.345'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Unapproved decimal precision accepted'; end if;
 denied:=false;
 begin perform public.work_board_validate_column_value(b,col_percent,'"12%"'::jsonb);
 exception when others then denied:=true; end;
 if not denied then raise exception 'String percentage accepted by numeric validator'; end if;
 -- A stale revision must not add an additional native column.
 denied:=false;
 begin perform public.wm_board_schema_mutate(b,first_revision,'create',null,
  'Stale column','phone','{}'::jsonb,true,false);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Stale CMP02 schema CAS accepted'; end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',editor_id,false);
 perform pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
 denied:=false;
 begin perform public.wm_board_schema_mutate(b,(select updated_at from public.work_boards where id=b),
  'create',null,'Editor denied','rating','{}'::jsonb,true,false);
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Nonmanager created native column'; end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',foreign_id,false);
 perform pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000004',false);
 denied:=false;
 begin perform public.wm_board_schema_mutate(b,(select updated_at from public.work_boards where id=b),
  'create',null,'Foreign denied','phone','{}'::jsonb,true,false);
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Cross-workspace native column creation accepted'; end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',owner_id,false);
 perform pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000099',false);
 denied:=false;
 begin perform public.wm_board_schema_mutate(b,(select updated_at from public.work_boards where id=b),
  'create',null,'Revoked denied','rating','{}'::jsonb,true,false);
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Nonexistent session created native column'; end if;
 if (select count(*) from public.work_board_events where board_id=b and event_type='column.created')<3 then
  raise exception 'Missing audit events for native typed schema';
 end if;
 raise notice 'CMP02 native types, format, CAS, audit and denials PASS';
END $cmp02_accept$;
