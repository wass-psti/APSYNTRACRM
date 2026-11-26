import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialDirectory,saveDepartment,savePerson,supervisorFor,searchPersonnel,readDirectory,writeDirectory,applyDirectory,personById,validateDirectory} from '../src/data/directory.js';
import {saveActivity,readActivities,writeActivities,filterActivities} from '../src/data/activities.js';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const department={name:'Operations',short:'OPS',units:'Field\nOffice'};
const employee={name:'Demo New',employeeId:'EMP-1',position:'Analyst',company:'WASS',departmentId:'operations',unit:'Field',isHead:false};
const withDepartment=()=>saveDepartment(initialDirectory(),department,'',()=> 'operations');
test('create/edit department with stable identity and configurable units',()=>{
  const data=withDepartment();assert.equal(data.departments.length,7);
  const updated=saveDepartment(data,{...department,name:'Operations Group',units:'Field\nOffice\nSupport'},'operations');
  assert.deepEqual(updated.departments.at(-1),{id:'operations',name:'Operations Group',short:'OPS',units:['Field','Office','Support']});
});
test('invalid department changes preserve data',()=>{
  const data=withDepartment();
  assert.throws(()=>saveDepartment(data,{...department,name:'materials & logistics'}));
  assert.throws(()=>saveDepartment(data,{...department,units:'Field\nfield'},'operations'));
  assert.throws(()=>saveDepartment(data,{name:'Engineering',short:'EN',units:'iFab'},'engineering'));
  assert.equal(data.departments.length,7);
});
test('create/edit/search personnel with unique employee ID',()=>{
  const data=savePerson(withDepartment(),employee,'',()=> 'new');
  assert.equal(searchPersonnel(data.people,'emp-1','operations')[0].id,'new');
  assert.equal(searchPersonnel(data.people,'WASS').length,1);
  const updated=savePerson(data,{...employee,name:'Demo Renamed',company:'PSTI'},'new');
  assert.equal(updated.people.at(-1).id,'new');assert.equal(updated.people.at(-1).company,'PSTI');
  assert.throws(()=>savePerson(updated,{...employee,employeeId:'emp-1'}));
  assert.throws(()=>savePerson(updated,{...employee,unit:'missing'}));
});
test('supervisor replacement is scoped to a unit; department fallback and transfer',()=>{
  let data=savePerson(withDepartment(),{...employee,isHead:true},'',()=> 'head');
  data=savePerson(data,{...employee,employeeId:'EMP-2',isHead:true},'',()=> 'replacement');
  assert.equal(data.people.find(p=>p.id==='head').isHead,false);
  assert.equal(supervisorFor(data.people.find(p=>p.id==='head'),data.people).id,'replacement');
  data=savePerson(data,{...employee,employeeId:'EMP-3',unit:'',isHead:true},'',()=> 'department-head');
  assert.equal(supervisorFor(data.people.find(p=>p.id==='replacement'),data.people).id,'department-head');
  assert.equal(data.people.filter(p=>p.departmentId==='operations'&&p.isHead).length,2);
  data=savePerson(data,{...employee,employeeId:'EMP-2',departmentId:'it',unit:'',isHead:false},'replacement');
  assert.equal(supervisorFor(data.people.find(p=>p.id==='head'),data.people).id,'department-head');
});
test('directory storage round trip and corrupted directory detection',()=>{
  const storage=memory();assert.equal(readDirectory(storage).people.length,21);
  const data=savePerson(withDepartment(),employee,'',()=> 'new');
  writeDirectory(storage,data);assert.deepEqual(readDirectory(storage),data);
  assert.throws(()=>validateDirectory({...data,people:[...data.people,data.people[0]]}));
});
test('legacy activities survive transfer, historical edits and reload',()=>{
  const storage=memory();applyDirectory(initialDirectory());
  try{
    const id='materials-0-staff1';
    const input={personId:id,date:'2026-11-25',title:'Original activity',status:'Completed'};
    const old=saveActivity([],input,'',()=> 'old');
    writeActivities(storage,old);
    const data=savePerson(initialDirectory(),{...personById(id),departmentId:'it',unit:''},id);
    writeDirectory(storage,data);applyDirectory(readDirectory(storage));
    const loaded=readActivities(storage);
    assert.equal(loaded[0].departmentId,'materials');
    const edited=saveActivity(loaded,{...input,title:'Corrected'},'old');
    assert.equal(edited[0].departmentId,'materials');
    const next=saveActivity(edited,input,'',()=> 'new');
    assert.equal(next[1].departmentId,'it');
    writeActivities(storage,next);assert.deepEqual(readActivities(storage),next);
    assert.equal(filterActivities(next,{departmentId:'materials'}).length,1);
    assert.equal(filterActivities(next,{departmentId:'it'}).length,1);
  }finally{applyDirectory(initialDirectory());}
});
