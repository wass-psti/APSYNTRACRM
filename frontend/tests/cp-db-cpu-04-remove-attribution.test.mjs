import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261114021800_cp_db_cpu_04_remove_temporary_attribution.sql',import.meta.url),'utf8');
test('temporary hashed attribution is removed exactly once from the existing RPC',()=>{
 assert.match(sql,/public\.wm_board_card_mutate\(uuid,timestamp with time zone,text,text,text,text\)/);
 assert.match(sql,/CP_DB_CPU_04_STALE_LIFECYCLE actor_hash=/);
 assert.match(sql,/occurrences <> 1/);
 assert.match(sql,/EXECUTE pg_catalog\.replace\(definition, needle, ''\)/);
});
test('cleanup changes no RPC permissions, roles, RLS policies, or data',()=>{
 assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|CREATE\s+POLICY|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM)\b/i);
});
