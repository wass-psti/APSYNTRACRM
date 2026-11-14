import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261114023400_cp_db_cpu_04_nonaborting_lifecycle_conflicts.sql',import.meta.url),'utf8');
const client=readFileSync(new URL('../board-card-lifecycle.js',import.meta.url),'utf8');

test('both stale revision branches return HTTP 409 without raising a database exception',()=>{
 assert.match(sql,/occurrences <> 2/);
 assert.match(sql,/set_config\(''response\.status'', ''409'', true\)/);
 assert.match(sql,/''code'', ''BOARD_REVISION_STALE''/);
 assert.match(sql,/''message'', ''Board changed; refresh before editing''/);
 assert.match(sql,/''boardId'', p_board_id::text/);
 assert.match(sql,/''action'', v_action/);
 const replacement=sql.slice(sql.indexOf('replacement constant text'),sql.indexOf('occurrences integer'));
 assert.doesNotMatch(replacement,/RAISE EXCEPTION/);
});

test('migration preserves authorization and locked compare ordering',()=>{
 assert.match(sql,/public\.wm_board_card_mutate\(uuid,timestamp with time zone,text,text,text,text\)/);
 assert.match(sql,/Expected two stale-revision branches/);
 assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|CREATE\s+POLICY|DROP\s+FUNCTION|ALTER\s+TABLE)\b/i);
});

test('client treats stale lifecycle conflicts as terminal and never retries',()=>{
 assert.match(client,/if\(error\?\.code==='40001'\)/);
 assert.match(client,/new ApiError\('Board changed; refresh before editing\.',409,'BOARD_REVISION_STALE'\)/);
 assert.doesNotMatch(client,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
 assert.equal((client.match(/expectedUpdatedAt=await readCurrentRevision\(\)/g)||[]).length,1);
});

test('client retains the preflight signed metadata read and receipt validation',()=>{
 assert.match(client,/const context=await this\.api\.context\(\)/);
 assert.match(client,/this\.api\.allowed\(board\.id,'manage'\)/);
 assert.match(client,/expectedUpdatedAt=await readCurrentRevision\(\)/);
 assert.match(client,/receipt\.boardId!==board\.id/);
 assert.match(client,/receipt\.action!==action/);
});
