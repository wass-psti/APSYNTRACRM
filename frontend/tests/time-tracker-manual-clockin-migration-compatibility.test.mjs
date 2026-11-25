import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261125090000_cp_tt_admin_manual_clockin.sql','utf8');
const guards=[...sql.matchAll(/\$old\$(IF\[\[:space:\]\].*?)\$old\$/g)].map(m=>m[1]);
const baseline="IF v_clock_in IS NULL OR v_in_geo->>'latitude' IS NULL OR\n    v_in_geo->>'longitude' IS NULL OR v_in_geo->>'accuracy' IS NULL THEN";

test('manual clock-in migration matches one coordinate guard across indentation and line endings',()=>{
 assert.equal(guards.length,2);
 assert.equal(guards[0],guards[1]);
 const regex=new RegExp(guards[0].replaceAll('[[:space:]]','\\s'),'g');
 const count=s=>[...s.matchAll(regex)].length;
 assert.equal(count(baseline),1);
 assert.equal(count(baseline.replaceAll('\n','\r\n')),1);
 assert.equal(count(baseline.replaceAll('\n    ','\t')),1);
 assert.equal(count(baseline.replace('OR v_in_geo','AND v_in_geo')),0);
 assert.equal(count(baseline.replace("->>'accuracy'","->>'altitude'")),0);
 assert.equal(count(baseline+'\n'+baseline),2);
 assert.match(sql,/pg_catalog\.regexp_count\(d,[\s\S]*?\)<>1\s+THEN RAISE EXCEPTION 'Employee projection coordinate baseline differs'/);
 assert.match(sql,/v_clock_in IS NULL OR \(\s*\(v_in_geo->>'latitude' IS NULL OR v_in_geo->>'longitude' IS NULL\s*OR v_in_geo->>'accuracy' IS NULL\)\s*AND NOT private\.tt_is_admin_clockin_evidence\(p_record\)\) THEN/);
});
