import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveDepartment,savePerson,filterActivities,supervisorFor,searchPersonnel,teamMembers} from '../apps/DailyDepartmentActivity/activity-model.js';
import {createActivityController} from '../apps/DailyDepartmentActivity/activity-controller.js';
const directory={departments:[{id:'d',name:'Operations',parentId:null},{id:'u',name:'Unit',parentId:'d'}],people:[{id:'p',name:'Person',departmentId:'d'}],unassigned:[{id:'q',name:'New member'}]};
test('DDA department creation and editing preserve stable IDs and validate hierarchy',()=>{
 assert.deepEqual(saveDepartment(directory,{name:' Field ',parentId:'d'},'',()=> 'new'),{id:'new',name:'Field',parentId:'d',short:''});
 assert.equal(saveDepartment(directory,{name:'Renamed'},'d').id,'d');
 assert.throws(()=>saveDepartment(directory,{name:'operations'}),/already exists/);
 assert.throws(()=>saveDepartment(directory,{name:'Cycle',parentId:'d'},'d'),/hierarchy/);
 assert.throws(()=>saveDepartment(directory,{name:'Nested',parentId:'u'}),/hierarchy/);
});
test('DDA personnel assignment uses existing source identity and rejects invented people',()=>{
 assert.deepEqual(savePerson(directory,{id:'q',name:'Override',departmentId:'u'}),{id:'q',name:'New member',departmentId:'u',employeeId:'',position:'',company:'',isHead:false});
 assert.deepEqual(savePerson(directory,{id:'p',name:'Renamed',departmentId:'u'}),{id:'p',name:'Renamed',departmentId:'u',employeeId:'',position:'',company:'',isHead:false});
 assert.throws(()=>savePerson(directory,{id:'unknown',departmentId:'d'}),/existing workforce/);
 assert.throws(()=>savePerson(directory,{id:'q',departmentId:'unknown'}),/Department not found/);
});
test('DDA directory mutations require authoritative readback and preserve historical activity department',async()=>{
 let snapshot={workspaceId:'w',revision:0,directory:structuredClone(directory),categories:[],records:[{id:'a',personId:'p',departmentId:'d',date:'2026-11-26',title:'Original',details:'',status:'Completed',categoryId:null}]};
 const repository={async load(){return structuredClone(snapshot);},async mutate(command){
  const record=command.record;
  if(command.action==='save-department')snapshot.directory.departments.push(record);
  else if(command.action==='save-person'){snapshot.directory.people=[...snapshot.directory.people.filter(row=>row.id!==record.id),record];snapshot.directory.unassigned=snapshot.directory.unassigned.filter(row=>row.id!==record.id);}
  else throw Error('Unknown command');
  snapshot.revision++;
  return structuredClone(snapshot);
 }};
 let id=0;
 const controller=createActivityController({repository,workspaceId:'w',userId:'actor',makeId:()=> 'id'+(++id)});
 await controller.load();
 const next=await controller.saveDepartment({name:'Field'});
 const dept=next.snapshot.directory.departments.find(row=>row.name==='Field').id;
 await controller.savePerson({id:'p',name:'Person',departmentId:dept});
 await controller.savePerson({id:'q',departmentId:dept});
 assert.equal(controller.getSnapshot().directory.unassigned.length,0);
 assert.equal(controller.getRecords()[0].departmentId,'d');
});

test('DDA organizational reporting fields and parent rollups preserve source identity',()=>{
 const record=savePerson(directory,{id:'q',departmentId:'u',employeeId:' E-1 ',position:'Engineer',company:'PSTI',isHead:true});
 assert.equal(record.employeeId,'E-1'); assert.equal(record.name,'New member'); assert.equal(record.isHead,true);
 assert.throws(()=>savePerson({...directory,people:[{...directory.people[0],employeeId:'e-1'}]},{id:'q',departmentId:'u',employeeId:'E-1'}),/already exists/);
 const roster={...directory,people:[{...directory.people[0],isHead:true},record]};
 assert.equal(supervisorFor(record,roster).id,'p');
 assert.equal(savePerson(roster,{id:'q',name:record.name,departmentId:'d'}).isHead,false);
 assert.equal(filterActivities([{departmentId:'u'},{departmentId:'d'},{departmentId:'other'}],{departmentId:'d'},directory.departments).length,2);
 assert.equal(filterActivities([{departmentId:'u'},{departmentId:'d'}],{departmentId:'u'},directory.departments).length,1);
 assert.throws(()=>saveDepartment(directory,{name:'Long',short:'123456789'}),/abbreviation/);
});

test('directory search includes assigned and unassigned people; team views retain former contributors',()=>{
 const roster={...directory,people:[{...directory.people[0],employeeId:'E-100',position:'Engineer',company:'PSTI',departmentId:'u'},{id:'former',name:'Former',departmentId:'other'}],departments:[...directory.departments,{id:'other',name:'Other'}]};
 assert.deepEqual(searchPersonnel(roster,{query:'e-100'}).map(row=>row.id),['p']);
 assert.deepEqual(searchPersonnel(roster,{query:'new member'}).map(row=>row.id),['q']);
 assert.deepEqual(searchPersonnel(roster,{query:'psti',departmentId:'d'}).map(row=>row.id),['p']);
 assert.equal(searchPersonnel(roster,{departmentId:'u',query:'new member'}).length,0);
 const records=[{personId:'former',departmentId:'d',date:'2026-11-26'}];
 const members=teamMembers(roster,records,{date:'2026-11-26',departmentId:'d'});
 assert.deepEqual(members.map(row=>[row.id,row.formerContributor]),[['p',false],['former',true]]);
 assert.equal(teamMembers(roster,records,{date:'2026-11-27',departmentId:'d'}).length,1);
});
