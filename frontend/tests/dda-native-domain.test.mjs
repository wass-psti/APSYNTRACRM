import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveCategory, saveActivity, deleteActivity, filterActivities, validDate} from '../apps/DailyDepartmentActivity/activity-model.js';
import {writeActivityDraft, readActivityDraft, clearActivityDraft} from '../apps/DailyDepartmentActivity/activity-drafts.js';

const directory = {departments: [{id:'d1'}, {id:'d2'}], people: [{id:'p1', departmentId:'d1'}]};
const input = {personId:'p1', date:'2026-11-26', title:' Daily report ', details:' Notes ', status:'Completed'};
const categories = [{id:'c1', name:'Reporting'}];
const create = () => saveActivity([], directory, categories, {...input, categoryId:'c1'}, '', ()=>'a1');
test('DDA categories: create, rename, reject duplicates and preserve identity', () => {
  const next = saveCategory(categories, {name:' Operations '}, '', ()=>'c2');
  assert.equal(next[1].name, 'Operations');
  assert.deepEqual(saveCategory(next, {name:'Field operations'}, 'c2')[1], {id:'c2', name:'Field operations'});
  assert.throws(()=>saveCategory(next, {name:' reporting '}), /already exists/);
  assert.throws(()=>saveCategory(next, {name:'Missing'}, 'missing'), /not found/);
  assert.equal(categories.length, 1);
});
test('DDA records: create multiple, trim text and allow uncategorized legacy records', () => {
  const first = create();
  const next = saveActivity(first, directory, categories, input, '', ()=>'a2');
  assert.equal(first.length, 1);
  assert.equal(next.length, 2);
  assert.equal(first[0].title, 'Daily report');
  assert.equal(first[0].details, 'Notes');
  assert.equal(first[0].categoryId, 'c1');
  assert.equal(next[1].categoryId, null);
});
test('DDA record edits preserve historical department after transfer', () => {
  const moved = {...directory, people:[{id:'p1', departmentId:'d2'}]};
  const first = create();
  const updated = saveActivity(first, moved, categories, {...input, status:'Pending'}, 'a1');
  assert.equal(updated[0].departmentId, 'd1');
  assert.equal(updated[0].status, 'Pending');
  assert.equal(first[0].status, 'Completed');
  assert.equal(saveActivity(updated, moved, categories, input, '', ()=>'a2')[1].departmentId, 'd2');
});
test('DDA rejects malformed records, unknown categories and identity changes', () => {
  const records = create();
  for (const patch of [{title:' '}, {date:'2026-02-30'}, {status:'Unknown'}, {personId:'missing'}, {categoryId:'missing'}]) {
    assert.throws(()=>saveActivity(records, directory, categories, {...input,...patch}));
  }
  assert.throws(()=>saveActivity(records, directory, categories, {...input,date:'2026-11-25'},'a1'), /identity and date/);
  assert.equal(records.length,1);
  assert.equal(validDate('2024-02-29'),true);
  assert.equal(validDate('2026-02-29'),false);
});
test('DDA filtering combines category, text, date, department, personnel and status', () => {
  const records = create();
  assert.equal(filterActivities(records,{categoryId:'c1',query:' NOTES ',date:input.date,departmentId:'d1',personId:'p1',status:'Completed'}).length,1);
  for (const filter of [{categoryId:'c2'},{query:'unknown'},{date:'2026-11-25'},{departmentId:'d2'},{personId:'p2'},{status:'Pending'}]) {
    assert.equal(filterActivities(records,filter).length,0);
  }
});
test('DDA record deletion projects only the selected ID and rejects stale IDs', () => {
  const records = saveActivity(create(), directory, categories, input, '', ()=>'a2');
  assert.deepEqual(deleteActivity(records,'a1').map(item=>item.id),['a2']);
  assert.equal(records.length,2);
  assert.throws(()=>deleteActivity(records,'missing'), /not found/);
});
test('DDA drafts preserve partial input and isolate workspace, user, person, date and edit ID', () => {
  const values = new Map();
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const scope = {workspaceId:'w1',userId:'u1',personId:'p1',date:input.date};
  const draft = {title:'  partial ',details:'',status:'Pending',categoryId:'c1'};
  writeActivityDraft(storage,scope,draft);
  assert.deepEqual(readActivityDraft(storage,scope),draft);
  for (const patch of [{workspaceId:'w2'},{userId:'u2'},{personId:'p2'},{date:'2026-11-25'},{activityId:'a1'}]) {
    assert.equal(readActivityDraft(storage,{...scope,...patch}),null);
  }
  writeActivityDraft(storage,{...scope,activityId:'a1'},{title:'Edit draft'});
  clearActivityDraft(storage,scope);
  assert.equal(readActivityDraft(storage,scope),null);
  assert.equal(readActivityDraft(storage,{...scope,activityId:'a1'}).title,'Edit draft');
  assert.throws(()=>writeActivityDraft(storage,{...scope,userId:''},draft), /scope/);
});
