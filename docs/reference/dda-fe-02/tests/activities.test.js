import {test} from 'node:test';
import assert from 'node:assert/strict';
import {departments,people} from '../src/data/directory.js';
import {saveActivity,filterActivities,summarize,manilaDate,validDate,readActivities,writeActivities} from '../src/data/activities.js';
const person=people.find(person=>!person.isHead);
const input={personId:person.id,date:'2026-11-25',title:'  Daily report  ',details:' Notes ',status:'Completed'};
const create=()=>saveActivity([],input,'',()=> 'test-1');
test('six departments, each with a supervisor; Engineering has two units',()=>{
  assert.equal(departments.length,6);
  for(const department of departments)assert.ok(people.some(person=>person.departmentId===department.id&&person.isHead));
  assert.equal(people.filter(person=>person.departmentId==='engineering'&&person.isHead).length,2);
});
test('create, trim, derive department, multiple daily entries',()=>{
  const records=create();
  assert.equal(records[0].title,'Daily report');
  assert.equal(records[0].departmentId,person.departmentId);
  assert.equal(saveActivity(records,input,'',()=> 'test-2').length,2);
});
test('edit preserves identity and changes status',()=>{
  const records=saveActivity(create(),{...input,status:'Pending'},'test-1');
  assert.equal(records.length,1);assert.equal(records[0].id,'test-1');assert.equal(records[0].status,'Pending');
});
test('invalid inputs rejected without mutation',()=>{
  const records=create();
  for(const invalid of [{title:' '},{date:'2026-02-30'},{status:'Unknown'},{personId:'invalid'}])assert.throws(()=>saveActivity(records,{...input,...invalid}));
  assert.equal(records.length,1);assert.throws(()=>saveActivity(records,input,'missing'));
});
test('date, department, personnel, status filters and counts',()=>{
  const records=create();
  assert.equal(filterActivities(records,{date:input.date,departmentId:person.departmentId,personId:person.id,status:'Completed'}).length,1);
  for(const filters of [{date:'2026-11-24'},{departmentId:'it'},{personId:'unknown'},{status:'Pending'}])assert.equal(filterActivities(records,filters).length,0);
  assert.deepEqual(summarize(records),{total:1,completed:1,inProgress:0,pending:0,people:1});
});
test('Manila date rollover and calendar validation',()=>{
  assert.equal(manilaDate(new Date('2026-11-24T16:01:00Z')),'2026-11-25');assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);
});
test('local persistence and invalid storage handling',()=>{
  const data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  assert.deepEqual(readActivities(storage),[]);writeActivities(storage,create());assert.deepEqual(readActivities(storage),create());
  writeActivities(storage,[{id:'invalid'}]);assert.throws(()=>readActivities(storage));
});
