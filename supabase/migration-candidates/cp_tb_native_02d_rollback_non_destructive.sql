-- NON-DESTRUCTIVE feature rollback: preserve original records and any new
-- reply/deletion/timer data, restore original projections and disable V2 RPCs.
-- Apply as a managed corrective migration only if activation is found unsafe.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create or replace function private.toolbox_issue_update_json(u public.toolbox_issue_updates) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',u.id::text,'text_body',u.text_body,'created_at',u.created_at,'creator',private.toolbox_issues_profile_json(u.creator_user_id),'assets',coalesce((select jsonb_agg(private.toolbox_issue_asset_json(a) order by a.created_at) from public.toolbox_issue_attachments a where a.workspace_id=u.workspace_id and a.update_id=u.id),'[]'::jsonb)) $$;
create or replace function private.toolbox_issue_json(i public.toolbox_issues) returns jsonb language sql stable security definer set search_path='' as $$ select coalesce(i.payload,'{}'::jsonb)||jsonb_build_object('id',i.id::text,'name',i.name,'status',i.status,'person',i.person,'date',i.target_date,'timeTracking',i.time_tracking,'creator',private.toolbox_issues_profile_json(i.creator_user_id),'createdAt',i.created_at,'updatedAt',i.updated_at,'version',i.version,'subitems',coalesce((select jsonb_agg(private.toolbox_issue_subitem_json(s) order by s.id) from public.toolbox_issue_subitems s where s.workspace_id=i.workspace_id and s.issue_id=i.id),'[]'::jsonb),'updates',coalesce((select jsonb_agg(private.toolbox_issue_update_json(u) order by u.created_at desc) from public.toolbox_issue_updates u where u.workspace_id=i.workspace_id and u.issue_id=i.id),'[]'::jsonb),'assets',coalesce((select jsonb_agg(private.toolbox_issue_asset_json(a) order by a.created_at) from public.toolbox_issue_attachments a where a.workspace_id=i.workspace_id and a.issue_id=i.id and a.update_id is null),'[]'::jsonb)) $$;;

drop function if exists public.toolbox_issues_timer_start(uuid,text,bigint);
drop function if exists public.toolbox_issues_timer_stop(uuid,text,bigint);
drop function if exists public.toolbox_issues_reply_update(uuid,text,text,text);
drop function if exists public.toolbox_issues_unregister_attachment(uuid,text,text);
drop function if exists public.toolbox_issues_confirm_attachment_purged(uuid,text,text);
drop function if exists public.toolbox_issues_native_v2_capabilities(uuid);
commit;
