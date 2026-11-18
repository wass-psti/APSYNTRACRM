-- CP-TB-NATIVE-01L. ISOLATED SHADOW ACTIVATION CANDIDATE ONLY.
-- Must never be placed under supabase/migrations or run in production.
-- Requires 01K immutable staging contract. No live Toolbox table writes.
create table if not exists private.tb_legacy_shadow_receipts (
 workspace_id uuid not null,
 source_board_id text not null,
 source_snapshot_hash text not null,
 evidence_sha256 text not null,
 source_issue_count integer not null,
 source_post_count integer not null,
 activated_at timestamptz not null default now(),
 primary key (workspace_id,source_board_id),
 foreign key (workspace_id,source_board_id)
  references private.tb_legacy_source_snapshots(workspace_id,source_board_id)
);
create table if not exists private.tb_legacy_shadow_issues (
 workspace_id uuid not null,
 source_board_id text not null,
 source_issue_id text not null,
 source_name text not null,
 source_status text not null,
 source_record_sha256 text not null,
 primary key (workspace_id,source_board_id,source_issue_id),
 foreign key (workspace_id,source_board_id,source_issue_id)
  references private.tb_legacy_source_issues(workspace_id,source_board_id,source_issue_id)
);
create table if not exists private.tb_legacy_shadow_posts (
 workspace_id uuid not null,
 source_board_id text not null,
 source_post_id text not null,
 source_issue_id text not null,
 parent_source_post_id text,
 original_author text not null,
 original_created_at text not null,
 source_content text not null,
 raw_asset_ids text not null,
 source_record_sha256 text not null,
 primary key (workspace_id,source_board_id,source_post_id),
 foreign key (workspace_id,source_board_id,source_post_id)
  references private.tb_legacy_source_posts(workspace_id,source_board_id,source_post_id),
 foreign key (workspace_id,source_board_id,source_issue_id)
  references private.tb_legacy_shadow_issues(workspace_id,source_board_id,source_issue_id),
 foreign key (workspace_id,source_board_id,parent_source_post_id)
  references private.tb_legacy_shadow_posts(workspace_id,source_board_id,source_post_id)
);
revoke all on private.tb_legacy_shadow_receipts,private.tb_legacy_shadow_issues,
 private.tb_legacy_shadow_posts from public,anon,authenticated;

-- This exercise requires synthetic provider-side proof of zero source subitems.
-- Real source lacks this proof, and therefore remains blocked.
-- "verified_assets" is an inventory of references/hashes, NOT a substitute for
-- independent actual-byte verification before any eventual production import.
create or replace function private.tb_legacy_shadow_activate(
 p_workspace_id uuid,p_source_board_id text,p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 rec private.tb_legacy_source_snapshots%rowtype;
 previous private.tb_legacy_shadow_receipts%rowtype;
 evidence_hash text;
 item private.tb_legacy_source_issues%rowtype;
 post private.tb_legacy_source_posts%rowtype;
 media_item jsonb;
 media_ids text[];
 observed_ids text[];
 staged_id text;
 n_media integer;
begin
 if p_workspace_id is null or p_source_board_id is distinct from '18370784140' then
  raise exception 'unexpected source or workspace' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_workspace_id::text||':'||p_source_board_id,0));
 select * into rec from private.tb_legacy_source_snapshots
 where workspace_id=p_workspace_id and source_board_id=p_source_board_id for update;
 if not found then raise exception 'source not staged' using errcode='23503'; end if;
 -- Always independently verify source row hashes and source counts.
 perform private.tb_legacy_verify_snapshot(p_workspace_id,p_source_board_id);
 if p_evidence->'subitems'->>'status' is distinct from 'VERIFIED_ZERO' or
    p_evidence->'subitems'->>'source_board_id' is distinct from '18371220520' or
    p_evidence->'subitems'->>'count' is distinct from '0' or
    not coalesce((p_evidence->'subitems'->>'evidence_sha256') ~ '^[0-9a-f]{64}$',false) then
  raise exception 'authoritative zero-subitem evidence missing' using errcode='22023';
 end if;
 if jsonb_typeof(p_evidence->'media'->'verified_assets') is distinct from 'array' then
  raise exception 'verified media manifest missing' using errcode='22023';
 end if;
 if p_evidence->>'history_display_policy' is distinct from 'PRESERVE_ORIGINAL_AUTHOR_AS_SOURCE' then
  raise exception 'historical author/display policy missing' using errcode='22023';
 end if;
 select coalesce(array_agg(distinct trim(both ' []"' from token) order by
    trim(both ' []"' from token)),array[]::text[])
 into observed_ids
 from private.tb_legacy_source_posts posts
 cross join lateral pg_catalog.regexp_split_to_table(
  coalesce(posts.record->>'asset_ids',''),',') as token
 where posts.workspace_id=p_workspace_id and posts.source_board_id=p_source_board_id
 and trim(both ' []"' from token)<>'';
 if exists(select 1 from unnest(observed_ids) v where v !~ '^[1-9][0-9]{0,19}$') then
  raise exception 'source media ID invalid' using errcode='22023';
 end if;
 media_ids:=array[]::text[];
 for media_item in select value from jsonb_array_elements(p_evidence->'media'->'verified_assets') loop
  staged_id:=media_item->>'source_asset_id';
  if jsonb_typeof(media_item) is distinct from 'object' or
     not coalesce(staged_id ~ '^[1-9][0-9]{0,19}$',false) or
    not coalesce((media_item->>'sha256') ~ '^[0-9a-f]{64}$',false) or
    coalesce((media_item->>'bytes_verified')::boolean,false) is distinct from true or
    coalesce((media_item->>'byte_count')::bigint,0)<=0 then
   raise exception 'source media byte evidence incomplete' using errcode='22023';
  end if;
  media_ids:=array_append(media_ids,staged_id);
 end loop;
 select count(*) into n_media from unnest(media_ids) as v;
 if n_media<>(select count(distinct v) from unnest(media_ids) as v) or
    (select coalesce(array_agg(v order by v),array[]::text[]) from unnest(media_ids) v) <>
    observed_ids then
  raise exception 'source media references do not match verified media evidence' using errcode='23514';
 end if;
 evidence_hash:=encode(pg_catalog.sha256(
  pg_catalog.convert_to(p_evidence::text,'UTF8')),'hex');
 select * into previous from private.tb_legacy_shadow_receipts
 where workspace_id=p_workspace_id and source_board_id=p_source_board_id for update;
 if found then
  if previous.source_snapshot_hash<>rec.canonical_sha256 or
     previous.evidence_sha256<>evidence_hash or
     previous.source_issue_count<>rec.issue_count or
     previous.source_post_count<>rec.post_count or
     (select count(*) from private.tb_legacy_shadow_issues where workspace_id=p_workspace_id and source_board_id=p_source_board_id)<>rec.issue_count or
     (select count(*) from private.tb_legacy_shadow_posts where workspace_id=p_workspace_id and source_board_id=p_source_board_id)<>rec.post_count then
   raise exception 'shadow replay conflict' using errcode='23505';
  end if;
  perform private.tb_legacy_verify_shadow(p_workspace_id,p_source_board_id);
  return jsonb_build_object('status','ALREADY_SHADOW_ACTIVATED',
   'ready_for_production',false,'issues',rec.issue_count,'posts',rec.post_count);
 end if;
 insert into private.tb_legacy_shadow_receipts
 (workspace_id,source_board_id,source_snapshot_hash,evidence_sha256,source_issue_count,source_post_count)
 values(p_workspace_id,p_source_board_id,rec.canonical_sha256,evidence_hash,rec.issue_count,rec.post_count);
 for item in select * from private.tb_legacy_source_issues
  where workspace_id=p_workspace_id and source_board_id=p_source_board_id order by source_issue_id loop
  insert into private.tb_legacy_shadow_issues
  (workspace_id,source_board_id,source_issue_id,source_name,source_status,source_record_sha256)
  values(p_workspace_id,p_source_board_id,item.source_issue_id,
   item.record->>'name',item.record->>'status',item.record_sha256);
 end loop;
 -- Source records are already inserted in parent-first order by 01K;
 -- recursively ensure roots precede children regardless of underlying row order.
 for post in
  with recursive ordered as (
   select p.*,0 as depth from private.tb_legacy_source_posts p
    where p.workspace_id=p_workspace_id and p.source_board_id=p_source_board_id
      and p.parent_source_post_id is null
   union all
   select c.*,o.depth+1 from private.tb_legacy_source_posts c
   join ordered o on o.workspace_id=c.workspace_id
    and o.source_board_id=c.source_board_id
    and c.parent_source_post_id=o.source_post_id
  )
  select * from ordered order by depth,source_post_id
 loop
  insert into private.tb_legacy_shadow_posts
  (workspace_id,source_board_id,source_post_id,source_issue_id,parent_source_post_id,
   original_author,original_created_at,source_content,raw_asset_ids,source_record_sha256)
  values(p_workspace_id,p_source_board_id,post.source_post_id,post.source_issue_id,
   post.parent_source_post_id,post.record->>'source_author',
   post.record->>'source_created_at',post.record->>'content',
   coalesce(post.record->>'asset_ids',''),post.record_sha256);
 end loop;
 if (select count(*) from private.tb_legacy_shadow_posts where workspace_id=p_workspace_id and source_board_id=p_source_board_id)<>rec.post_count then
  raise exception 'shadow source post mismatch' using errcode='23514';
 end if;
 return jsonb_build_object('status','SHADOW_ACTIVATED',
  'ready_for_production',false,'issues',rec.issue_count,'posts',rec.post_count,
  'verified_media_references',n_media);
end $$;
revoke all on function private.tb_legacy_shadow_activate(uuid,text,jsonb)
 from public,anon,authenticated;

-- Independent normalized history readback, called on every repeat activation.
create or replace function private.tb_legacy_verify_shadow(
 p_workspace_id uuid,p_source_board_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 receipt private.tb_legacy_shadow_receipts%rowtype;
 invalid_issues bigint;
 invalid_posts bigint;
 issue_total bigint;
 post_total bigint;
 reply_total bigint;
begin
 perform private.tb_legacy_verify_snapshot(p_workspace_id,p_source_board_id);
 select * into receipt from private.tb_legacy_shadow_receipts
 where workspace_id=p_workspace_id and source_board_id=p_source_board_id;
 if not found then return jsonb_build_object('status','NOT_SHADOW_ACTIVATED'); end if;
 select count(*),
 count(*) filter (where src.source_issue_id is null or
  dest.source_name is distinct from src.record->>'name' or
  dest.source_status is distinct from src.record->>'status' or
  dest.source_record_sha256 is distinct from src.record_sha256)
 into issue_total,invalid_issues
 from private.tb_legacy_shadow_issues dest left join private.tb_legacy_source_issues src
 on src.workspace_id=dest.workspace_id and src.source_board_id=dest.source_board_id
 and src.source_issue_id=dest.source_issue_id
 where dest.workspace_id=p_workspace_id and dest.source_board_id=p_source_board_id;
 select count(*),count(*) filter (where src.source_post_id is null or
  dest.source_issue_id is distinct from src.source_issue_id or
  dest.parent_source_post_id is distinct from src.parent_source_post_id or
  dest.original_author is distinct from src.record->>'source_author' or
  dest.original_created_at is distinct from src.record->>'source_created_at' or
  dest.source_content is distinct from src.record->>'content' or
  dest.raw_asset_ids is distinct from coalesce(src.record->>'asset_ids','') or
  dest.source_record_sha256 is distinct from src.record_sha256),
 count(*) filter (where dest.parent_source_post_id is not null)
 into post_total,invalid_posts,reply_total
 from private.tb_legacy_shadow_posts dest left join private.tb_legacy_source_posts src
 on src.workspace_id=dest.workspace_id and src.source_board_id=dest.source_board_id
 and src.source_post_id=dest.source_post_id
 where dest.workspace_id=p_workspace_id and dest.source_board_id=p_source_board_id;
 if issue_total<>receipt.source_issue_count or
    post_total<>receipt.source_post_count or invalid_issues<>0 or invalid_posts<>0 then
  raise exception 'shadow history integrity mismatch' using errcode='23514';
 end if;
 return jsonb_build_object('status','SHADOW_READBACK_VERIFIED',
  'issues',issue_total,'posts',post_total,'reply_links',reply_total,
  'ready_for_production',false);
end $$;
revoke all on function private.tb_legacy_verify_shadow(uuid,text) from public,anon,authenticated;
