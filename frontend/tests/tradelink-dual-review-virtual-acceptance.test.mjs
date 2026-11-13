import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const source=path=>readFile(new URL(path,root),'utf8');

test('virtual secondary reviewer acceptance is disposable and cannot impersonate the unavailable account',async()=>{
 const sql=await source('sql/tests/cp-tl08h-virtual-review-acceptance.sql');
 assert.match(sql,/local-only virtual secondary reviewer acceptance/i);
 assert.match(sql,/Never run against production Supabase/i);
 assert.match(sql,/virtual-secondary@apsyntra\.test/);
 assert.match(sql,/119edeed-b85c-4349-9d89-11b323ca8509/);
 assert.match(sql,/Primary actor was accepted as secondary/);
 assert.doesNotMatch(sql,/asenagan@watchdogautomation\.com\.ph/);
});

test('virtual second review verifies automatic approval, actor separation, idempotency, CAS, and Board projection',async()=>{
 const sql=await source('sql/tests/cp-tl08h-virtual-review-acceptance.sql');
 assert.match(sql,/receipt->>'state'<>'approved'/);
 assert.match(sql,/count\(DISTINCT actor_id\).*<>2/s);
 assert.match(sql,/idempotent'<>'true'/);
 assert.match(sql,/Stale document revision was accepted/);
 assert.match(sql,/i\.updated_at IS DISTINCT FROM d\.updated_at/);
 assert.match(sql,/tradelink\.document\.approved/);
});

test('approved-only browser print remains separate from electronic PDF issuance',async()=>{
 const app=await source('frontend/app.js');
 const print=app.slice(app.indexOf('async function printTradeLinkDocument'),app.indexOf('async function commitTradeLinkDraft'));
 assert.match(print,/listed\.workflowState!=='approved'/);
 assert.match(print,/record\.workflow_state!=='approved'/);
 const contract=await source('frontend/tradelink-pdf-approval-contract.js');
 assert.match(contract,/TRADELINK_ELECTRONIC_PDF_ISSUANCE_ENABLED=false/);
 assert.match(contract,/TRADELINK_PDF_TEMPLATE_ACTIVATED=false/);
});
