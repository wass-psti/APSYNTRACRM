import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOperationalResult} from '../board-foundation-ui.js';
test('per-board acceptance report does not confuse structural READY with operational PASS',()=>{
 const html=renderOperationalResult({status:'fail',passed:0,results:[]});
 assert.equal((html.match(/NOT RUN/g)||[]).length,12);
 assert.match(html,/0\/12 boards passed/);
 assert.doesNotMatch(html,/>PASS<\/span>/);
});
test('a partial or failed board cannot display PASS and includes cleanup evidence',()=>{
 const html=renderOperationalResult({status:'fail',passed:0,results:[
  {module:'fueltrans',status:'fail',steps:['Authorized board and empty isolation scope','Signed create and independent read'],
   error:'Stale update did not confirm conflict',cleaned:true}
 ]});
 assert.match(html,/FAILED/);
 assert.match(html,/Stale update did not confirm conflict/);
 assert.match(html,/Confirmed removed/);
 assert.equal((html.match(/NOT RUN/g)||[]).length,11);
});
test('full five-check signed report only passes with confirmed QA cleanup',()=>{
 const checks=Array.from({length:5},(_,i)=>'Check '+(i+1));
 const html=renderOperationalResult({status:'fail',passed:0,results:[{module:'fueltrans',status:'pass',steps:checks,cleaned:false}]});
 assert.match(html,/FAILED/);
 assert.match(html,/Not confirmed/);
 assert.doesNotMatch(html,/>PASS<\/span>/);
});
