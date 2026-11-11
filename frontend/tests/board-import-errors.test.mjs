import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeImportFailure} from '../board-import-errors.js';

test('file decoding token errors remain retryable and confirm no board mutation',()=>{
 const result=normalizeImportFailure(new SyntaxError('Invalid or unexpected token'),'file-read');
 assert.equal(result.code,'BIMP_FILE_DECODE');
 assert.equal(result.uncertain,false);
 assert.match(result.message,/No board changes were made/);
});

test('choice schema token errors require board reconciliation before retry',()=>{
 const result=normalizeImportFailure(new SyntaxError('Unexpected token < in JSON'),'schema-write');
 assert.equal(result.code,'BIMP_SCHEMA_RESPONSE');
 assert.equal(result.uncertain,true);
 assert.match(result.message,/column may already exist/);
 assert.match(result.message,/Refresh the board/);
});

test('record commit token errors prevent blind duplicate submission',()=>{
 const result=normalizeImportFailure(new SyntaxError('Invalid or unexpected token'),'record-write');
 assert.equal(result.code,'BIMP_IMPORT_RESPONSE');
 assert.equal(result.uncertain,true);
 assert.match(result.message,/may already have been committed/);
 assert.match(result.message,/Do not submit again/);
});

test('ordinary validation and backend errors retain their original message',()=>{
 const error=Object.assign(new Error('Board changed after preview.'),{status:409});
 const result=normalizeImportFailure(error,'record-write');
 assert.equal(result.message,error.message);
 assert.equal(result.uncertain,false);
 assert.equal(result.code,'');
});

test('existing uncertain write outcomes remain uncertain',()=>{
 const error=Object.assign(new Error('Transport failed.'),{importOutcomeUncertain:true});
 const result=normalizeImportFailure(error,'record-write');
 assert.equal(result.uncertain,true);
 assert.equal(result.message,error.message);
});
