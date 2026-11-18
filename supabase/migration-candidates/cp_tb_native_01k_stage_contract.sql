-- CP-TB-NATIVE-01K: STAGING-ONLY candidate. DO NOT APPLY TO PRODUCTION.
-- Retains original authors, timestamps, IDs, threaded replies and asset references
-- as immutable source payloads. Does not write to any live Toolbox issue table.
create schema if not exists private;

create table if not exists private.tb_legacy_source_snapshots (
 workspace_id uuid not null,
 source_board_id text not null check (source_board_id ~ '^[1-9][0-9]{0,19}$'),
 workbook_sha256 text not null check (workbook_sha256 ~ '^[0-9a-f]{64}$'),
 canonical_sha256 text not null check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
 issue_count integer not null check (issue_count >= 0),
 post_count integer not null check (post_count >= 0),
 raw_time_tracking jsonb not null default '[]',
 source_subitem_provenance text not null default 'NOT_ESTABLISHED',
 staged_at timestamptz not null default now(),
 primary key (workspace_id,source_board_id)
);
create table if not exists private.tb_legacy_source_issues (
 workspace_id uuid not null,
 source_board_id text not null,
 source_issue_id text not null check (source_issue_id ~ '^[1-9][0-9]{0,19}$'),
 record jsonb not null,
 record_sha256 text not null,
 primary key (workspace_id,source_board_id,source_issue_id),
 foreign key (workspace_id,source_board_id)
  references private.tb_legacy_source_snapshots(workspace_id,source_board_id) on delete restrict
);
create table if not exists private.tb_legacy_source_posts (
 workspace_id uuid not null,
 source_board_id text not null,
 source_post_id text not null check (source_post_id ~ '^[1-9][0-9]{0,19}$'),
 source_issue_id text not null,
 parent_source_post_id text,
 record jsonb not null,
 record_sha256 text not null,
 primary key (workspace_id,source_board_id,source_post_id),
 foreign key (workspace_id,source_board_id,source_issue_id)
  references private.tb_legacy_source_issues(workspace_id,source_board_id,source_issue_id) on delete restrict,
 foreign key (workspace_id,source_board_id,parent_source_post_id)
  references private.tb_legacy_source_posts(workspace_id,source_board_id,source_post_id) on delete restrict
);
-- Private schema: never expose a historical write RPC to anon/authenticated.
revoke all on private.tb_legacy_source_snapshots,private.tb_legacy_source_issues,
 private.tb_legacy_source_posts from public,anon,authenticated;

create or replace function private.tb_legacy_stage_snapshot(
 p_workspace_id uuid,p_manifest jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 board text :=p_manifest->>'source_board_id';
 source_hash text :=p_manifest->>'workbook_sha256';
 doc_hash text;
 issue_count int;
 post_count int;
 issues jsonb :=p_manifest->'issues';
 posts jsonb :=p_manifest->'posts_parent_first';
 issue jsonb;
 post jsonb;
 id text;
 parent text;
 issue_id text;
 item_hash text;
 existing_hash text;
 current_source_issue text;
 old_snapshot private.tb_legacy_source_snapshots%rowtype;
begin
 if p_workspace_id is null or board is distinct from '18370784140' or
    source_hash is null or source_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'invalid source identity' using errcode='22023';
 end if;
 if jsonb_typeof(issues) is distinct from 'array' or
    jsonb_typeof(posts) is distinct from 'array' or
    jsonb_typeof(p_manifest->'time_tracking_rows_raw') is distinct from 'array' then
  raise exception 'full structured source snapshot required' using errcode='22023';
 end if;
 if p_manifest->>'ready_for_migration' is distinct from 'false' or
    p_manifest->>'production_writes_authorized' is distinct from 'false' or
    p_manifest->>'source_subitem_provenance' is distinct from 'NOT_ESTABLISHED' then
  raise exception 'unexpected source migration readiness state' using errcode='22023';
 end if;
 issue_count:=jsonb_array_length(issues);
 post_count:=jsonb_array_length(posts);
 if issue_count=0 or post_count=0 or issue_count>20000 or post_count>100000 then
  raise exception 'invalid source size' using errcode='22023';
 end if;
 doc_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_manifest::text,'UTF8')),'hex');
 -- Prevent interleaving imports of a single workspace and source board.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||board,0));
 select * into old_snapshot from private.tb_legacy_source_snapshots
 where workspace_id=p_workspace_id and source_board_id=board for update;
 if found then
  if old_snapshot.workbook_sha256<>source_hash or old_snapshot.canonical_sha256<>doc_hash or
     old_snapshot.issue_count<>issue_count or old_snapshot.post_count<>post_count then
   raise exception 'source snapshot conflict: immutable provenance receipt differs' using errcode='23505';
  end if;
  if (select count(*) from private.tb_legacy_source_issues where workspace_id=p_workspace_id and source_board_id=board)<>issue_count or
     (select count(*) from private.tb_legacy_source_posts where workspace_id=p_workspace_id and source_board_id=board)<>post_count then
   raise exception 'source snapshot receipt does not match recorded rows' using errcode='23514';
  end if;
  return jsonb_build_object('status','ALREADY_STAGED','issues',issue_count,'posts',post_count,'writes_to_live_toolbox',false);
 end if;
 insert into private.tb_legacy_source_snapshots
 (workspace_id,source_board_id,workbook_sha256,canonical_sha256,issue_count,post_count,raw_time_tracking,source_subitem_provenance)
 values (p_workspace_id,board,source_hash,doc_hash,issue_count,post_count,p_manifest->'time_tracking_rows_raw','NOT_ESTABLISHED');
 for issue in select value from jsonb_array_elements(issues) loop
  id:=issue->>'monday_item_id';
  if id is null or id !~ '^[1-9][0-9]{0,19}$' or
     nullif(pg_catalog.btrim(issue->>'name'),'') is null then
    raise exception 'invalid source issue row' using errcode='22023';
  end if;
  item_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(issue::text,'UTF8')),'hex');
  insert into private.tb_legacy_source_issues
   (workspace_id,source_board_id,source_issue_id,record,record_sha256)
   values(p_workspace_id,board,id,issue,item_hash);
 end loop;
 for post in select value from jsonb_array_elements(posts) loop
  id:=post->>'monday_post_id';
  issue_id:=post->>'monday_issue_id';
  parent:=nullif(post->>'parent_monday_post_id','');
  if id is null or id !~ '^[1-9][0-9]{0,19}$' or
     issue_id is null or issue_id !~ '^[1-9][0-9]{0,19}$' or
     (parent is not null and parent !~ '^[1-9][0-9]{0,19}$') or
     nullif(pg_catalog.btrim(post->>'source_author'),'') is null or
     nullif(pg_catalog.btrim(post->>'source_created_at'),'') is null then
    raise exception 'invalid source post provenance' using errcode='22023';
  end if;
  if parent is not null then
   select source_issue_id into current_source_issue from private.tb_legacy_source_posts
   where workspace_id=p_workspace_id and source_board_id=board and source_post_id=parent;
   if current_source_issue is distinct from issue_id then
    raise exception 'missing, out-of-order or cross-issue reply parent' using errcode='23503';
   end if;
  end if;
  item_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(post::text,'UTF8')),'hex');
  insert into private.tb_legacy_source_posts
   (workspace_id,source_board_id,source_post_id,source_issue_id,parent_source_post_id,record,record_sha256)
   values(p_workspace_id,board,id,issue_id,parent,post,item_hash);
 end loop;
 return jsonb_build_object('status','STAGED','issues',issue_count,'posts',post_count,'writes_to_live_toolbox',false);
end $$;
revoke all on function private.tb_legacy_stage_snapshot(uuid,jsonb) from public,anon,authenticated;

-- Independent, read-only, receipt-scoped integrity verification.
-- This function cannot activate or copy historical data to live boards.
create or replace function private.tb_legacy_verify_snapshot(
 p_workspace_id uuid,p_source_board_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 receipt private.tb_legacy_source_snapshots%rowtype;
 n_issues bigint;
 n_posts bigint;
 n_replies bigint;
 n_assets bigint;
 n_invalid bigint;
begin
 select * into receipt from private.tb_legacy_source_snapshots
 where workspace_id=p_workspace_id and source_board_id=p_source_board_id;
 if not found then
  return jsonb_build_object('status','NOT_STAGED','ready_for_migration',false);
 end if;
 select count(*),
        count(*) filter (where record_sha256<>encode(
           pg_catalog.sha256(pg_catalog.convert_to(record::text,'UTF8')),'hex') or
           record->>'monday_item_id'<>source_issue_id)
 into n_issues,n_invalid
 from private.tb_legacy_source_issues
 where workspace_id=p_workspace_id and source_board_id=p_source_board_id;
 if n_invalid<>0 then
  raise exception 'source issue receipt tampering detected' using errcode='23514';
 end if;
 select count(*),count(*) filter (where parent_source_post_id is not null),
        count(*) filter (where nullif(record->>'asset_ids','') is not null),
        count(*) filter (where record_sha256<>encode(
          pg_catalog.sha256(pg_catalog.convert_to(record::text,'UTF8')),'hex') or
          record->>'monday_post_id'<>source_post_id or
          record->>'monday_issue_id'<>source_issue_id or
          coalesce(record->>'parent_monday_post_id','')<>coalesce(parent_source_post_id,'') or
          nullif(pg_catalog.btrim(record->>'source_author'),'') is null or
          nullif(pg_catalog.btrim(record->>'source_created_at'),'') is null)
 into n_posts,n_replies,n_assets,n_invalid
 from private.tb_legacy_source_posts
 where workspace_id=p_workspace_id and source_board_id=p_source_board_id;
 if n_invalid<>0 then
  raise exception 'source post receipt tampering detected' using errcode='23514';
 end if;
 if n_issues<>receipt.issue_count or n_posts<>receipt.post_count then
  raise exception 'source row count deviates from snapshot receipt' using errcode='23514';
 end if;
 return jsonb_build_object(
  'status','VERIFIED_STAGING_ONLY','issue_count',n_issues,'post_count',n_posts,
  'reply_count',n_replies,'posts_with_asset_references',n_assets,
  'workbook_sha256',receipt.workbook_sha256,
  'source_subitem_provenance',receipt.source_subitem_provenance,
  'ready_for_migration',false,'production_writes_authorized',false);
end $$;
revoke all on function private.tb_legacy_verify_snapshot(uuid,text) from public,anon,authenticated;
