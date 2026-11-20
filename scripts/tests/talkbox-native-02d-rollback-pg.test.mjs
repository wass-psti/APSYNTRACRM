import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve('.');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db=new PGlite();
after(async()=>db.close());
const A='10000000-0000-4000-8000-000000000001';
const USER='20000000-0000-4000-8000-000000000001';
const original=[
 '20261005044500_toolbox_issues_schema.sql',
 '20261005044554_toolbox_issues_helpers.sql',
 '20261005044633_toolbox_issues_bootstrap_rpc.sql',
 '20261005044651_toolbox_issues_user_role_rpcs.sql',
 '20261005044709_toolbox_issues_state_rpcs.sql',
 '20261005044742_toolbox_issues_issue_rpcs.sql',
 '20261005044817_toolbox_issues_update_rpcs.sql',
 '20261005044837_toolbox_issues_subitem_rpcs.sql'
];
const loaded=p=>readFileSync(resolve(root,p),'utf8');
const query=async(sql,params=[])=>db.query(sql,params);
await db.exec([
'create role anon;create role authenticated;',
'create schema auth;create schema storage;',
"create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
'create table public.workspace_members(workspace_id uuid,user_id uuid,active boolean);',
'create table public.profiles(id uuid primary key,display_name text,email text);',
'create table storage.objects(bucket_id text,name text primary key);'
].join('\n'));
for(const name of original)await db.exec(loaded('supabase/migrations/'+name));
test('preflight baseline is the actual repository Toolbox schema',async()=>{
 const functions=(await query("select proname from pg_proc where proname in ('toolbox_issue_json','toolbox_issue_update_json')")).rows;
 assert.equal(functions.length,2);
 const columns=(await query("select column_name from information_schema.columns where table_name='toolbox_issue_attachments' and column_name='deleted_at'")).rows;
 assert.equal(columns.length,0);
});
test('transactional V2 and timer candidates activate on baseline',async()=>{
 await db.exec(loaded('supabase/migration-candidates/cp_tb_independent_native_02_thread_and_media.sql'));
 await db.exec(loaded('supabase/migration-candidates/cp_tb_independent_native_02c_server_timer.sql'));
 const count=Number((await query("select count(*)::int as n from pg_proc where proname in ('toolbox_issues_timer_start','toolbox_issues_timer_stop','toolbox_issues_reply_update','toolbox_issues_unregister_attachment','toolbox_issues_confirm_attachment_purged','toolbox_issues_native_v2_capabilities')")).rows[0].n);
 assert.equal(count,6);
});
test('a live signed fixture is preserved on safe rollback',async()=>{
 await query('insert into public.profiles(id,display_name,email) values($1,$2,$3)',[USER,'QA','test@invalid.example']);
 await query('insert into public.workspace_members(workspace_id,user_id,active) values($1,$2,true)',[A,USER]);
 await query("insert into public.toolbox_issues_memberships(workspace_id,user_id,role) values($1,$2,'standard')",[A,USER]);
 await query("select set_config('request.jwt.claim.sub',$1,false)",[USER]);
 await db.exec('SET ROLE authenticated');
 const created=(await query("select public.toolbox_issues_create_issue($1,jsonb_build_object('name','Rollback retention fixture')) as result",[A])).rows[0].result;
 await db.exec('RESET ROLE');
 await db.exec(loaded('supabase/migration-candidates/cp_tb_native_02d_rollback_non_destructive.sql'));
 const functionCount=Number((await query("select count(*)::int n from pg_proc where proname in ('toolbox_issues_timer_start','toolbox_issues_timer_stop','toolbox_issues_reply_update','toolbox_issues_unregister_attachment','toolbox_issues_confirm_attachment_purged','toolbox_issues_native_v2_capabilities')")).rows[0].n);
 assert.equal(functionCount,0);
 assert.equal(Number((await query('select count(*)::int n from public.toolbox_issues where id=$1',[created.id])).rows[0].n),1);
 assert.equal(Number((await query("select count(*)::int n from information_schema.columns where table_name='toolbox_issue_attachments' and column_name='deleted_at'")).rows[0].n),1);
 await db.exec('SET ROLE authenticated');
 const record=(await query("select public.toolbox_issues_get_issue($1,$2) as issue",[A,created.id])).rows[0].issue;
 assert.equal(record.name,'Rollback retention fixture');
 assert.equal(record.pendingAttachmentCleanup,undefined);
});
