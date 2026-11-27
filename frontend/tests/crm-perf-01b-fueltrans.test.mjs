import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFuelTransRead} from '../../scripts/cp-crm-perf-01b-fueltrans.mjs';
test('counts and lists are distinguished without retaining user-specific query values',()=>{
 const base='http://127.0.0.1:3000';
 assert.equal(classifyFuelTransRead(base+'/rest/v1/fueltrans_tickets?select=id&limit=1'),'ticket-count');
 assert.equal(classifyFuelTransRead(base+'/fueltrans_tickets?select=*&limit=6'),'ticket-list');
 assert.equal(classifyFuelTransRead(base+'/rest/v1/fueltrans_memberships?select=id'),'membership');
 assert.equal(classifyFuelTransRead(base+'/frontend/config.js'),null);
});
