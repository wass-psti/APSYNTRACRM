import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const migrations=readdirSync('supabase/migrations');
const name=migrations.find(n=>n.endsWith('_cp_crm_urm_integrity_03c_projection_parity.sql'));
const sql=readFileSync('supabase/migrations/'+name,'utf8');
const rollback=readFileSync('sql/cp-crm-urm-integrity-03c-projection-rollback.sql','utf8');
test('controlled activation changes projection only and guards exact deployed source hash',()=>{
 assert.match(sql,/md5\(source\) <> '7a3d5763dccae093940238b1961c0ff9'/);
 assert.match(sql,/public\.has_module_access\(id,v_actor\)/);
 assert.match(sql,/public\.module_role_for\(id,v_actor\)/);
 assert.match(sql,/source drift/);
 assert.match(sql,/fund-released-tracker/);
 assert.doesNotMatch(sql,/\bINSERT INTO\b|\bDELETE FROM\b|\bALTER TABLE\b|\bCREATE ROLE\b|\bGRANT\b|\bUPDATE public\./);
});
test('rollback restores only original native projection expression and rejects source drift',()=>{
 assert.match(rollback,/Rollback guard: unexpected active projection/);
 assert.match(rollback,/pg_catalog\.replace\(source,new_fragment,old_fragment\)/);
 assert.match(rollback,/source drift|Rollback guard/);
 assert.doesNotMatch(rollback,/\bINSERT INTO\b|\bDELETE FROM\b|\bALTER TABLE\b|\bGRANT\b|\bUPDATE public\./);
});
test('disposable parity remains tied to the four existing native modules',()=>{
 const s=readFileSync('sql/tests/cp-crm-urm-integrity-03b-projection-disposable.sql','utf8');
 for(const id of ['time-tracker','fund-released-tracker','fueltrack-plus','tradelink'])assert.ok(sql.includes(id));
 assert.match(s,/CP_CRM_URM_INTEGRITY_03B_PROJECTION_PARITY_PASS/);
});
