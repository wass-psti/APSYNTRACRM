-- CMP-02 isolated PG17 reproduction of unchanged production definitions.
\set ON_ERROR_STOP on
alter table public.work_board_columns add constraint work_board_columns_data_type_check
 check (data_type in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline'));
CREATE OR REPLACE FUNCTION public.work_board_normalize_column_config(p_type text, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare cfg jsonb:=coalesce(p_config,'{}'::jsonb); options jsonb; clean jsonb:='[]'::jsonb; x jsonb; label text; id text; color text; active boolean; description text; pos integer:=0; default_id text;
begin
  if p_type not in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline') then raise exception 'Unsupported column type'; end if;
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
  select * into c from public.work_board_columns where id=p_column_id and board_id=p_board_id;
  if c.id is null then raise exception 'Column does not belong to board'; end if;
  if p_value is null or p_value='null'::jsonb then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  if c.data_type in ('text','long_text','status','dropdown','date','people','url','email') then
    if jsonb_typeof(p_value)<>'string' then raise exception '% requires a text value',c.name; end if;
    t:=btrim(p_value#>>'{}'); is_empty:=(t=''); if is_empty then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  end if;
  case c.data_type
    when 'text' then if char_length(t)>1000 then raise exception '% is limited to 1000 characters',c.name; end if; return to_jsonb(t);
    when 'long_text' then if char_length(t)>5000 then raise exception '% is limited to 5000 characters',c.name; end if; return to_jsonb(t);
    when 'number' then if jsonb_typeof(p_value)<>'number' then raise exception '% requires a number',c.name; end if; return p_value;
    when 'checkbox' then if jsonb_typeof(p_value)<>'boolean' then raise exception '% requires true or false',c.name; end if; return p_value;
    when 'status' then
      if not exists(select 1 from jsonb_array_elements(c.config->'labels') e where e->>'id'=t) then raise exception 'Select a valid status for %',c.name; end if;
      return to_jsonb(t);
    when 'dropdown' then if not exists(select 1 from jsonb_array_elements_text(c.config->'options') o(value) where o.value=t) then raise exception 'Select a valid option for %',c.name; end if; return to_jsonb(t);
    when 'date' then begin d:=t::date; exception when others then raise exception '% requires a valid date',c.name; end; return to_jsonb(d::text);
    when 'people' then begin u:=t::uuid; exception when others then raise exception '% requires a valid board member',c.name; end; if not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=u) then raise exception 'Assignee must be a board member'; end if; return to_jsonb(u::text);
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
