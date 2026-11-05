-- CMP-02: STAGED ONLY. Requires separate production schema/permission approval.
-- Captured from read-only live WatchdogWorkspace Supabase function metadata 2026-11-05.
-- Native types store JSON strings/integers/numeric percentage points respectively.
-- No new tables, grants, roles, RLS, services, or auth fallbacks.
\set ON_ERROR_STOP on
begin;
do $cmp02_preflight$
begin
 if (select md5(pg_get_functiondef('public.work_board_normalize_column_config(text,jsonb)'::regprocedure)))
   is distinct from '0246a27eb7e8428575188f31d0a48148' then
   raise exception 'CMP02 normalized-column function drift: abort' using errcode='PT409';
 end if;
 if (select md5(pg_get_functiondef('public.work_board_validate_column_value(uuid,uuid,jsonb)'::regprocedure)))
   is distinct from '0f027e692f487ca637bdaab7e52af5d5' then
   raise exception 'CMP02 value-validator drift: abort' using errcode='PT409';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.work_board_columns'::regclass
  and conname='work_board_columns_data_type_check'
  and pg_get_constraintdef(oid) like '%''timeline''%'
  and pg_get_constraintdef(oid) not like '%''phone''%') then
   raise exception 'CMP02 expected legacy type constraint is missing or already modified'
    using errcode='PT409';
 end if;
end $cmp02_preflight$;
alter table public.work_board_columns
 drop constraint work_board_columns_data_type_check,
 add constraint work_board_columns_data_type_check
 check (data_type in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline','phone','rating','percentage'));

CREATE OR REPLACE FUNCTION public.work_board_normalize_column_config(p_type text, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare cfg jsonb:=coalesce(p_config,'{}'::jsonb); options jsonb; clean jsonb:='[]'::jsonb; x jsonb; label text; id text; color text; active boolean; description text; pos integer:=0; default_id text;
begin
  -- CMP02_TYPED_V1: staged native Phone, Rating, Percentage contracts.
  if p_type not in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline','phone','rating','percentage') then raise exception 'Unsupported column type'; end if;
  if p_type='status' then
    options:=cfg->'labels';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then
      if jsonb_typeof(cfg->'options')='array' and jsonb_array_length(cfg->'options')>0 then
        options:='[]'::jsonb;
        pos:=0;
        for label in select value from jsonb_array_elements_text(cfg->'options') loop
          options:=options||jsonb_build_array(jsonb_build_object(
            'id','status_'||substr(md5(lower(btrim(label))),1,20),
            'name',btrim(label),
            'color',(array['#7f8a9a','#4f7df3','#e64f70','#23b784','#6d5bd0','#2a9bb8','#d9a227','#d54a9c'])[(pos % 8)+1],
            'active',true,'description',''
          ));
          pos:=pos+1;
        end loop;
        pos:=0;
      else
        options:=jsonb_build_array(
          jsonb_build_object('id','not_started','name','Not started','color','#7f8a9a','active',true,'description',''),
          jsonb_build_object('id','in_progress','name','In progress','color','#4f7df3','active',true,'description',''),
          jsonb_build_object('id','blocked','name','Blocked','color','#e64f70','active',true,'description',''),
          jsonb_build_object('id','done','name','Done','color','#23b784','active',true,'description','')
        );
      end if;
    end if;
    if jsonb_array_length(options)>50 then raise exception 'A Status column can contain at most 50 labels'; end if;
    for x in select value from jsonb_array_elements(options) loop
      if jsonb_typeof(x)<>'object' then raise exception 'Status labels must be objects'; end if;
      id:=btrim(coalesce(x->>'id','')); label:=btrim(coalesce(x->>'name','')); color:=lower(btrim(coalesce(x->>'color','#7f8a9a')));
      description:=left(btrim(coalesce(x->>'description','')),240); active:=coalesce((x->>'active')::boolean,true);
      if char_length(id) not between 1 and 96 or id !~ '^[A-Za-z0-9_:-]+$' then raise exception 'Status label IDs must contain only letters, numbers, underscore, colon, or hyphen'; end if;
      if char_length(label) not between 1 and 80 then raise exception 'Status label names must contain 1-80 characters'; end if;
      if color !~ '^#[0-9a-f]{6}$' then raise exception 'Status label colors must use six-digit hex values'; end if;
      if exists(select 1 from jsonb_array_elements(clean) e where lower(e->>'name')=lower(label)) then raise exception 'Status label names must be unique'; end if;
      if exists(select 1 from jsonb_array_elements(clean) e where e->>'id'=id) then raise exception 'Status label IDs must be unique'; end if;
      clean:=clean||jsonb_build_array(jsonb_build_object('id',id,'name',label,'color',color,'active',active,'description',description,'position',pos)); pos:=pos+1;
    end loop;
    if not exists(select 1 from jsonb_array_elements(clean) e where coalesce((e->>'active')::boolean,true)) then raise exception 'Keep at least one active status label'; end if;
    default_id:=nullif(btrim(coalesce(cfg->>'default_label_id','')),'');
    if default_id is null or not exists(select 1 from jsonb_array_elements(clean) e where e->>'id'=default_id and coalesce((e->>'active')::boolean,true)) then
      select e->>'id' into default_id from jsonb_array_elements(clean) e where coalesce((e->>'active')::boolean,true) limit 1;
    end if;
    return jsonb_build_object('labels',clean,'default_label_id',default_id);
  elsif p_type='dropdown' then
    options:=cfg->'options';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then options:=jsonb_build_array('Option 1','Option 2'); end if;
    if jsonb_array_length(options)>50 then raise exception 'A choice column can contain at most 50 options'; end if;
    for x in select value from jsonb_array_elements(options) loop
      if jsonb_typeof(x)<>'string' then raise exception 'Choice options must be text'; end if;
      label:=btrim(x#>>'{}');
      if char_length(label) not between 1 and 80 then raise exception 'Choice options must contain 1-80 characters'; end if;
      if exists(select 1 from jsonb_array_elements_text(clean) as e(value) where lower(e.value)=lower(label)) then raise exception 'Choice options must be unique'; end if;
      clean:=clean||jsonb_build_array(label);
    end loop;
    return jsonb_build_object('options',clean);

  elsif p_type='phone' then
    if jsonb_typeof(cfg)<>'object' or cfg<>'{}'::jsonb then
      raise exception 'Phone column does not accept configuration';
    end if;
    return '{}'::jsonb;
  elsif p_type='rating' then
    if jsonb_typeof(cfg)<>'object' or
       (select count(*) from jsonb_object_keys(cfg)) > 1 or
       exists(select 1 from jsonb_object_keys(cfg) as k where k<>'max') then
      raise exception 'Rating configuration accepts only max';
    end if;
    if cfg ? 'max' and (jsonb_typeof(cfg->'max')<>'number' or
       (cfg->>'max')::numeric not between 3 and 10 or
       (cfg->>'max')::numeric <> trunc((cfg->>'max')::numeric)) then
      raise exception 'Rating max must be an integer from 3 to 10';
    end if;
    return jsonb_build_object('max',coalesce((cfg->>'max')::integer,5));
  elsif p_type='percentage' then
    if jsonb_typeof(cfg)<>'object' or
       (select count(*) from jsonb_object_keys(cfg)) > 1 or
       exists(select 1 from jsonb_object_keys(cfg) as k where k<>'decimals') then
      raise exception 'Percentage configuration accepts only decimals';
    end if;
    if cfg ? 'decimals' and (jsonb_typeof(cfg->'decimals')<>'number' or
       (cfg->>'decimals')::numeric not between 0 and 4 or
       (cfg->>'decimals')::numeric <> trunc((cfg->>'decimals')::numeric)) then
      raise exception 'Percentage decimals must be an integer from 0 to 4';
    end if;
    return jsonb_build_object('decimals',coalesce((cfg->>'decimals')::integer,2));
  end if;
  return '{}'::jsonb;
end $function$;

CREATE OR REPLACE FUNCTION public.work_board_validate_column_value(p_board_id uuid, p_column_id uuid, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.work_board_columns%rowtype; t text; u uuid; d date; start_d date; end_d date; is_empty boolean:=false;
begin
  -- CMP02_TYPED_V1: staged typed values, no authorization changes.
  select * into c from public.work_board_columns where id=p_column_id and board_id=p_board_id;
  if c.id is null then raise exception 'Column does not belong to board'; end if;
  if p_value is null or p_value='null'::jsonb then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  if c.data_type in ('text','long_text','status','dropdown','date','people','url','email','phone') then
    if jsonb_typeof(p_value)<>'string' then raise exception '% requires a text value',c.name; end if;
    t:=btrim(p_value#>>'{}'); is_empty:=(t=''); if is_empty then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  end if;
  case c.data_type
    when 'text' then if char_length(t)>1000 then raise exception '% is limited to 1000 characters',c.name; end if; return to_jsonb(t);
    when 'long_text' then if char_length(t)>5000 then raise exception '% is limited to 5000 characters',c.name; end if; return to_jsonb(t);
    when 'number' then if jsonb_typeof(p_value)<>'number' then raise exception '% requires a number',c.name; end if; return p_value;
    when 'rating' then
      if jsonb_typeof(p_value)<>'number' then raise exception '% requires an integer rating',c.name; end if;
      if (p_value#>>'{}')::numeric<>trunc((p_value#>>'{}')::numeric) or
         (p_value#>>'{}')::numeric<1 or
         (p_value#>>'{}')::numeric>coalesce((c.config->>'max')::integer,5) then
        raise exception '% requires a rating between 1 and configured max',c.name;
      end if;
      return p_value;
    when 'percentage' then
      if jsonb_typeof(p_value)<>'number' then raise exception '% requires a numeric percentage',c.name; end if;
      if (p_value#>>'{}')::numeric<0 or (p_value#>>'{}')::numeric>100 or
         (p_value#>>'{}')::numeric<>round((p_value#>>'{}')::numeric,
           coalesce((c.config->>'decimals')::integer,2)) then
        raise exception '% requires 0-100 with configured decimal precision',c.name;
      end if;
      return p_value;
    when 'checkbox' then if jsonb_typeof(p_value)<>'boolean' then raise exception '% requires true or false',c.name; end if; return p_value;
    when 'status' then
      if not exists(select 1 from jsonb_array_elements(c.config->'labels') e where e->>'id'=t) then raise exception 'Select a valid status for %',c.name; end if;
      return to_jsonb(t);
    when 'dropdown' then if not exists(select 1 from jsonb_array_elements_text(c.config->'options') o(value) where o.value=t) then raise exception 'Select a valid option for %',c.name; end if; return to_jsonb(t);
    when 'date' then begin d:=t::date; exception when others then raise exception '% requires a valid date',c.name; end; return to_jsonb(d::text);
    when 'people' then begin u:=t::uuid; exception when others then raise exception '% requires a valid board member',c.name; end; if not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=u) then raise exception 'Assignee must be a board member'; end if; return to_jsonb(u::text);
    when 'phone' then
      if t !~ '^[+][1-9][0-9]{6,14}$' then
        raise exception '% requires international E.164 (+country code and 7-15 digits)',c.name;
      end if;
      return to_jsonb(t);
    when 'url' then if t !~* '^https?://[^[:space:]]+$' or char_length(t)>2000 then raise exception '% requires a valid http(s) URL',c.name; end if; return to_jsonb(t);
    when 'email' then if t !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(t)>320 then raise exception '% requires a valid email address',c.name; end if; return to_jsonb(lower(t));
    when 'timeline' then
      if jsonb_typeof(p_value)<>'object' then raise exception '% requires a start/end date range',c.name; end if;
      if coalesce(p_value->>'start','')='' and coalesce(p_value->>'end','')='' then if c.required then raise exception '% is required',c.name; end if; return null; end if;
      begin start_d:=(p_value->>'start')::date; end_d:=(p_value->>'end')::date; exception when others then raise exception '% requires valid start and end dates',c.name; end;
      if end_d<start_d then raise exception '% end date cannot be before its start date',c.name; end if;
      return jsonb_build_object('start',start_d::text,'end',end_d::text);
    else raise exception 'Unsupported column type';
  end case;
end $function$;
commit;
