create or replace function public.material_tracker_add_comment(p_workspace_id uuid,p_material_id text,p_text text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare c public.material_tracker_comments%rowtype; p public.profiles%rowtype;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker comment write denied' using errcode='42501'; end if;
  if trim(coalesce(p_text,''))='' then raise exception 'Comment text required' using errcode='22023'; end if;
  if not exists(select 1 from public.material_tracker_materials where workspace_id=p_workspace_id and id=p_material_id and archived_at is null) then raise exception 'Material not found' using errcode='P0002'; end if;
  insert into public.material_tracker_comments(workspace_id,material_id,text,author_user_id) values(p_workspace_id,p_material_id,left(trim(p_text),8000),auth.uid()) returning * into c;
  select * into p from public.profiles where id=auth.uid();
  return jsonb_build_object('id',c.id,'text',c.text,'authorName',coalesce(p.display_name,p.email),'authorId',p.id::text,'createdAt',c.created_at,'editedAt',c.edited_at);
end $$;

create or replace function public.material_tracker_edit_comment(p_workspace_id uuid,p_comment_id text,p_text text)
returns jsonb language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare c public.material_tracker_comments%rowtype; p public.profiles%rowtype;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker comment write denied' using errcode='42501'; end if;
  update public.material_tracker_comments set text=left(trim(p_text),8000),edited_at=now()
   where workspace_id=p_workspace_id and id=p_comment_id and deleted_at is null and (author_user_id=auth.uid() or private.material_tracker_is_admin(p_workspace_id)) returning * into c;
  if not found then raise exception 'Comment not found or edit denied' using errcode='42501'; end if;
  select * into p from public.profiles where id=c.author_user_id;
  return jsonb_build_object('id',c.id,'text',c.text,'authorName',coalesce(p.display_name,p.email),'authorId',p.id::text,'createdAt',c.created_at,'editedAt',c.edited_at);
end $$;

create or replace function public.material_tracker_delete_comment(p_workspace_id uuid,p_comment_id text)
returns boolean language plpgsql security definer set search_path='public','private','pg_temp' as $$
declare affected integer;
begin
  if not private.material_tracker_can_write(p_workspace_id) then raise exception 'Material Tracker comment write denied' using errcode='42501'; end if;
  update public.material_tracker_comments set deleted_at=now() where workspace_id=p_workspace_id and id=p_comment_id and deleted_at is null and (author_user_id=auth.uid() or private.material_tracker_is_admin(p_workspace_id));
  get diagnostics affected=row_count; if affected=0 then raise exception 'Comment not found or delete denied' using errcode='42501'; end if;
  return true;
end $$;

revoke all on function public.material_tracker_add_comment(uuid,text,text) from public, anon;
revoke all on function public.material_tracker_edit_comment(uuid,text,text) from public, anon;
revoke all on function public.material_tracker_delete_comment(uuid,text) from public, anon;
grant execute on function public.material_tracker_add_comment(uuid,text,text) to authenticated;
grant execute on function public.material_tracker_edit_comment(uuid,text,text) to authenticated;
grant execute on function public.material_tracker_delete_comment(uuid,text) to authenticated;;
