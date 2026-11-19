import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileImportSummary} from '../board/import/import-summary.js';

test('source rows reconcile against valid, rejected and explicitly excluded worksheet rows',()=>{
 const result=reconcileImportSummary({sourceRows:420,validRows:320,rejectedRows:90,
  excludedWorksheetRows:10,receipt:{created:300,updated:10,skipped:10,duplicates:10}});
 assert.equal(result.reconciled,true);
 assert.equal(result.sourceRows,420);
 assert.equal(result.validRows,320);
 assert.equal(result.committedWrites,310);
 assert.equal(result.processedRows,320);
 assert.equal(result.failedRows,0);
 assert.equal(result.duplicates,10);
});

test('420 source rows are not reported as 420 persisted writes when only 320 are accounted for',()=>{
 const result=reconcileImportSummary({sourceRows:420,validRows:420,rejectedRows:0,
  receipt:{created:320,updated:0,skipped:0,duplicates:0}});
 assert.equal(result.reconciled,false);
 assert.equal(result.committedWrites,320);
 assert.equal(result.unreconciledRows,100);
 assert.equal(result.failedRows,null);
 assert.match(result.reconciliationIssues.join(' '),/Valid rows do not equal/);
});

test('duplicate matches are reported separately from skipped and updated rows',()=>{
 const result=reconcileImportSummary({sourceRows:4,validRows:4,rejectedRows:0,
  receipt:{created:2,updated:1,skipped:1,duplicates:2}});
 assert.equal(result.reconciled,true);
 assert.equal(result.duplicates,2);
 assert.equal(result.committedWrites,3);
});

test('impossible duplicate totals cannot be marked reconciled',()=>{
 const result=reconcileImportSummary({sourceRows:2,validRows:2,rejectedRows:0,
  receipt:{created:1,updated:0,skipped:1,duplicates:3}});
 assert.equal(result.reconciled,false);
});

test('invalid receipt values are rejected',()=>{
 assert.throws(()=>reconcileImportSummary({sourceRows:-1,validRows:0,rejectedRows:0,receipt:{}}),
  /non-negative safe integers/);
});
