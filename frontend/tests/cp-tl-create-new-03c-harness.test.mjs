import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const harness=readFileSync(new URL('../../scripts/cp-tl-create-new-02c-signed-user-browser-acceptance.mjs',import.meta.url),'utf8');

test('production QA writes continue requiring two explicit, independent controls',()=>{
 assert.match(harness,/process\.argv\.includes\("--create-approved-qa-drafts"\)/);
 assert.match(harness,/CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED === "YES"/);
 assert.match(harness,/else if \(writeMode && !writeApproved\)/);
});
test('in-flight response listener errors cannot terminate the process before its acceptance report',()=>{
 assert.match(harness,/void pending\.catch\(\(\) => \{\}\)/);
 assert.match(harness,/report\.status = writeAttempted \? "PARTIAL_OR_UNCERTAIN" : "BLOCKED"/);
});
test('browser-native form validation fails before any production create attempt',()=>{
 const pre=harness.indexOf('const invalidFields = await form.evaluate');
 const attempt=harness.indexOf('writeAttempted = true;');
 assert.ok(pre>=0&&attempt>pre);
 assert.match(harness,/assert\.deepEqual\(invalidFields, \[\]/);
});
test('resume starts from an explicitly selected known module and does not replay preceding creates',()=>{
 assert.match(harness,/--start-module=/);
 assert.match(harness,/allModules\.slice\(resumeIndex\)/);
 assert.match(harness,/if \(resumeIndex < 0\)/);
 assert.match(harness,/moduleCount: modules\.length/);
});
test('same-route first-module navigation and CDP disconnection are handled',()=>{
 assert.match(harness,/new URL\(originalUrl\)\.hash\.startsWith\("#\/tradelink\/drafts\/"\)/);
 assert.match(harness,/await page\.goto\(BASE \+ "#\/overview"/);
 assert.match(harness,/await browser\.close\(\)\.catch/);
});
test('QA script never automatically retries uncertain production writes or cleans production records',()=>{
 assert.doesNotMatch(harness,/for \(let attempt|while \(.*retry|tl03_document_delete|tl03_document_archive/);
 assert.match(harness,/productionWriteOutcome = "ATTEMPTED_UNCONFIRMED"/);
 assert.match(harness,/"SIX_MODULES_CREATE_UPDATE_REFRESH_REOPEN_VERIFIED"|modules\.length \+ "_MODULES_CREATE_UPDATE_REFRESH_REOPEN_VERIFIED"/);
});
