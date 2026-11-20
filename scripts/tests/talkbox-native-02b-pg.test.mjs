/** Actual isolated PostgreSQL-engine acceptance; no live Supabase credentials. */
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const modulePath=process.env.PGLITE_MODULE;
if(!modulePath)throw new Error('PGLITE_MODULE must point to isolated, pinned PGlite package');
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
after(async()=>db.close());
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const alice='20000000-0000-4000-8000-000000000001';
const bob='20000000-0000-4000-8000-000000000002';
const other='20000000-0000-4000-8000-000000000003';
let issueId,parentId,assetId;

const q=(sql,params=[])=>db.query(sql,params);
const scalar=async(sql,params=[])=>Object.values((await q(sql,params)).rows[0]||{})[0];
const as=async(id)=>{await db.exec("RESET ROLE");await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');};
const asOwner=async()=>{await db.exec('RESET ROLE');};
const fails=async(fn,pattern)=>assert.rejects(fn,pattern);

await db.exec(`
 create role anon; create role authenticated;
 create schema if not exists auth;
 create function auth.uid() returns uuid language sql stable as $$
   select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.workspace_members(workspace_id uuid not null,user_id uuid not null,
   active boolean not null default true,primary key(workspace_id,user_id));
 create table public.profiles(id uuid primary key,display_name text,email text);
 create schema storage;
 create table storage.objects(bucket_id text not null,name text primary key);
`);
for(const file of [
 '20261005044500_toolbox_issues_schema.sql',
 '20261005044554_toolbox_issues_helpers.sql',
 '20261005044633_toolbox_issues_bootstrap_rpc.sql',
 '20261005044651_toolbox_issues_user_role_rpcs.sql',
 '20261005044709_toolbox_issues_state_rpcs.sql',
 '20261005044742_toolbox_issues_issue_rpcs.sql',
 '20261005044817_toolbox_issues_update_rpcs.sql',
 '20261005044837_toolbox_issues_subitem_rpcs.sql'
]){
 await db.exec(readFileSync(resolve(root,'supabase/migrations',file),'utf8'));
}

test('candidate applies against eight actual original schema/RPC migrations without DDL errors',async()=>{
 const candidate=readFileSync(resolve(root,'supabase/migration-candidates/cp_tb_independent_native_02_thread_and_media.sql'),'utf8');
 assert.match(candidate,/CANDIDATE ONLY: DO NOT DEPLOY/);
 await db.exec(candidate);
 await db.exec(candidate); // DDL replay must not disturb native records
 const functions=(await q("select proname from pg_proc where proname in ('toolbox_issues_native_v2_capabilities','toolbox_issues_reply_update','toolbox_issues_unregister_attachment') order by proname")).rows;
 assert.equal(functions.length,3);
 const cols=(await q("select table_name,column_name from information_schema.columns where table_schema='public' and column_name in ('reply_to_update_id','deleted_at') order by table_name")).rows;
 assert.deepEqual(cols.map(x=>x.column_name),['deleted_at','reply_to_update_id']);
});

test('disposable same-workspace signed records and capability discovery',async()=>{
 await asOwner();
 for(const id of [alice,bob,other])await q('insert into public.profiles(id,display_name,email) values($1,$2,$3)',[id,'Isolated Test User',id+'@invalid.test']);
 for(const [workspace,user] of [[A,alice],[A,bob],[B,other]]){
  await q('insert into public.workspace_members(workspace_id,user_id,active) values($1,$2,true)',[workspace,user]);
  await q("insert into public.toolbox_issues_memberships(workspace_id,user_id,role) values($1,$2,'standard')",[workspace,user]);
 }
 await as(alice);
 const issue=await scalar("select public.toolbox_issues_create_issue($1,jsonb_build_object('name','Isolated native discussion'))",[A]);
 issueId=issue.id;
 const parent=await scalar("select public.toolbox_issues_add_update($1,$2,'Initial update')",[A,issueId]);
 parentId=parent.id;
 const cap=await scalar('select public.toolbox_issues_native_v2_capabilities($1)',[A]);
 assert.deepEqual(cap,{threadedReplies:true,attachmentRemoval:true});
 assert.equal(parent.replyTo,null); // root updates have no parent
});

test('two signed same-workspace users can post and independently read native parent linkage',async()=>{
 await as(bob);
 const reply=await scalar('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,parentId,'  Follow-up  ']);
 assert.equal(reply.replyTo,parentId);
 assert.equal(reply.text_body,'Follow-up');
 assert.equal(reply.creator.id,bob);
 await as(alice);
 const detail=await scalar('select public.toolbox_issues_get_issue($1,$2)',[A,issueId]);
 assert.equal(detail.updates.length,2);
 assert.equal(detail.updates.find(x=>x.id===reply.id).replyTo,parentId);
 assert.equal(detail.updates.find(x=>x.id===parentId).text_body,'Initial update');
});

test('wrong issue, unknown parent, reply-to-reply and blank text are denied with no orphan',async()=>{
 await as(alice);
 await fails(()=>q('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,'99999999','Missing']),/Parent update not found/);
 await fails(()=>q('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,parentId,'  ']),/reply text required/);
 const signedIssue=await scalar('select public.toolbox_issues_get_issue($1,$2)',[A,issueId]);
 const child=signedIssue.updates.find(row=>row.replyTo===parentId)?.id;
 assert.ok(child);
 await fails(()=>q('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,child,'Nested']),/Parent update not found/);
 assert.equal((await scalar('select public.toolbox_issues_get_issue($1,$2)',[A,issueId])).updates.length,2);
});

test('signed unrelated workspace cannot enumerate, reply or unregister attached file',async()=>{
 await as(other);
 await fails(()=>q('select public.toolbox_issues_native_v2_capabilities($1)',[A]),/access denied/);
 await fails(()=>q('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,parentId,'Cross-workspace']),/access denied/);
 await fails(()=>q('select public.toolbox_issues_unregister_attachment($1,$2,$3)',[A,issueId,assetId||'1']),/access denied/);
 await fails(()=>q('select public.toolbox_issues_confirm_attachment_purged($1,$2,$3)',[A,issueId,assetId||'1']),/access denied/);
});

test('native attachment soft-delete retains audit row and is idempotent on retry',async()=>{
 await asOwner();
 const path=A+'/'+issueId+'/30000000-0000-4000-8000-000000000001/file.txt';
 assetId=String(await scalar("insert into public.toolbox_issue_attachments(workspace_id,issue_id,storage_path,name,mime_type,size_bytes,creator_user_id) values($1,$2,$3,'file.txt','text/plain',5,$4) returning id",[A,issueId,path,alice]));
 await as(alice);
 await asOwner();
 await q("insert into storage.objects(bucket_id,name) values('toolbox-issues-attachments',$1)",[path]);
 await as(alice);
 const before=await scalar('select public.toolbox_issues_get_issue($1,$2)',[A,issueId]);
 assert.equal(before.assets.length,1);
 await fails(()=>q('select public.toolbox_issues_confirm_attachment_purged($1,$2,$3)',[A,issueId,assetId]),/No pending attachment removal/);
 const first=await scalar('select public.toolbox_issues_unregister_attachment($1,$2,$3)',[A,issueId,assetId]);
 assert.equal(first.storagePath,path);
 const after=await scalar('select public.toolbox_issues_get_issue($1,$2)',[A,issueId]);
 assert.deepEqual(after.assets,[]);
 assert.equal(after.pendingAttachmentCleanup.length,1);
 await fails(()=>q('select public.toolbox_issues_confirm_attachment_purged($1,$2,$3)',[A,issueId,assetId]),/binary is still registered/);
 const redo=await scalar('select public.toolbox_issues_unregister_attachment($1,$2,$3)',[A,issueId,assetId]);
 assert.deepEqual(redo,first);
 await asOwner();
 assert.equal(Number(await scalar("select count(*) from public.toolbox_issues_activity where entity_type='attachment' and entity_id=$1",[assetId])),1);
 assert.equal(Number(await scalar('select count(*) from public.toolbox_issue_attachments where id=$1 and deleted_at is not null',[assetId])),1);
 await q('delete from storage.objects where name=$1',[path]);
 await as(alice);
 const purged=await scalar('select public.toolbox_issues_confirm_attachment_purged($1,$2,$3)',[A,issueId,assetId]);
 assert.equal(purged.storagePath,path);
 assert.deepEqual((await scalar('select public.toolbox_issues_get_issue($1,$2)',[A,issueId])).pendingAttachmentCleanup,[]);
 const purgedAgain=await scalar('select public.toolbox_issues_confirm_attachment_purged($1,$2,$3)',[A,issueId,assetId]);
 assert.deepEqual(purgedAgain,purged);
});

test('attempting another issue attachment or archived-issue reply is denied',async()=>{
 await as(alice);
 await fails(()=>q('select public.toolbox_issues_unregister_attachment($1,$2,$3)',[A,'999999',assetId]),/Attachment not found/);
 await scalar('select public.toolbox_issues_archive_issue($1,$2)',[A,issueId]);
 await fails(()=>q('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,parentId,'Archived reply']),/Issue not found/);
});

test('anonymous role cannot execute native V2 RPCs',async()=>{
 await asOwner();await db.exec('SET ROLE anon');
 await fails(()=>q('select public.toolbox_issues_native_v2_capabilities($1)',[A]),/permission denied/);
 await fails(()=>q('select public.toolbox_issues_reply_update($1,$2,$3,$4)',[A,issueId,parentId,'Anon']),/permission denied/);
 await fails(()=>q('select public.toolbox_issues_confirm_attachment_purged($1,$2,$3)',[A,issueId,assetId]),/permission denied/);
 await db.exec('RESET ROLE');
});
