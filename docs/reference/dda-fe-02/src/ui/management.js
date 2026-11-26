import {departments,people,companies,departmentById,supervisorFor,searchPersonnel} from '../data/directory.js';
import {escape,heading,option,departmentOptions} from './views.js';

const input=(name,label,value,placeholder,max,required=false)=>`<label>${label}<input name="${name}" value="${escape(value)}" placeholder="${placeholder}" maxlength="${max}" ${required?'required':''}></label>`;
export function unitOptions(departmentId,selected='') {
  return option('','Department level (no unit)',selected)+(departmentById(departmentId)?.units||[]).map(unit=>option(unit,unit,selected)).join('');
}
function departmentForm(state) {
  const d=departmentById(state.departmentEditId);
  return `<section class="panel management-form"><h2>${d?'Edit department':'Add department'}</h2><form id="department-form">${input('name','Department name',d?.name,'e.g. Operations',120,true)}${input('short','Abbreviation',d?.short,'e.g. OPS',8,true)}<label>Organizational units (optional)<textarea name="units" rows="3" placeholder="One unit per line">${escape(d?.units.join('\n'))}</textarea></label><p class="muted small">Assign supervisors from Personnel. Move personnel out of a unit before removing or renaming it.</p><div class="form-actions"><button class="primary" type="submit">Save department</button><button class="secondary" type="button" id="cancel-department">Cancel</button></div></form></section>`;
}
export function departmentManagement(state) {
  return heading('Departments','Manage organizational units, assigned personnel and designated supervisors.','<button class="primary" data-add-department>+ Add department</button>')+
  (state.departmentFormOpen?departmentForm(state):'')+
  `<div class="department-grid">${departments.map(d=>{
    const members=people.filter(p=>p.departmentId===d.id);
    const scopes=['',...d.units];
    return `<section class="panel directory-card"><div class="section-heading"><span class="dept-icon">${escape(d.short)}</span><span class="muted small">${members.length} personnel</span></div><h2>${escape(d.name)}</h2>${scopes.map(unit=>{
      const roster=members.filter(p=>p.unit===unit);
      if(!unit&&d.units.length&&!roster.length)return '';
      const head=roster.find(p=>p.isHead);
      return `<div class="unit-heading"><strong>${escape(unit||'Department')}</strong><small>${head?'Head: '+escape(head.name):'No designated head'}</small></div>${roster.map(p=>`<div class="person"><div><strong>${escape(p.name)}</strong><small>${escape(p.position||'Personnel')}</small></div><span class="muted small">${p.isHead?'Supervisor':'Personnel'}</span></div>`).join('')}`;
    }).join('')}<button class="secondary" data-edit-department="${escape(d.id)}">Edit department</button><button class="secondary" data-team="${escape(d.id)}">View activities</button></section>`;
  }).join('')}</div>`;
}
function personForm(state) {
  const p=people.find(item=>item.id===state.personEditId);
  const departmentId=p?.departmentId||state.personnelDepartment||departments[0].id;
  return `<section class="panel management-form"><h2>${p?'Edit personnel':'Add personnel'}</h2><form id="personnel-form"><div class="form-grid">${input('name','Employee name',p?.name,'e.g. Demo Employee',120,true)}${input('employeeId','Employee ID',p?.employeeId,'e.g. EMP-001',80,true)}${input('position','Position',p?.position,'e.g. Operations Assistant',120)}<label>Company<select name="company">${option('','Not specified',p?.company||'')}${companies.map(company=>option(company,company,p?.company)).join('')}</select></label><label>Department<select name="departmentId" id="personnel-form-department">${departmentOptions(departmentId)}</select></label><label>Organizational unit<select name="unit" id="personnel-form-unit">${unitOptions(departmentId,p?.unit)}</select></label></div><label class="check-label"><input type="checkbox" name="isHead" ${p?.isHead?'checked':''}> Designate as department or unit supervisor</label><p class="muted small">Selecting this replaces the current supervisor for the selected department or unit. Moving a supervisor to a different assignment clears the selection until explicitly checked again. Existing activities retain their original department.</p><div class="form-actions"><button class="primary" type="submit">Save personnel</button><button class="secondary" type="button" id="cancel-personnel">Cancel</button></div></form></section>`;
}
export function personnelManagement(state) {
  const roster=searchPersonnel(people,state.personnelQuery,state.personnelDepartment);
  return heading('Personnel','Manage employee details, department assignments and reporting relationships.','<button class="primary" data-add-personnel>+ Add personnel</button>')+
  (state.personFormOpen?personForm(state):'')+
  `<section class="panel"><form id="personnel-search" class="filters search-form"><label>Search personnel<input name="query" type="search" value="${escape(state.personnelQuery)}" placeholder="Name, employee ID, position or company"></label><label>Department<select name="departmentId">${departmentOptions(state.personnelDepartment,true)}</select></label><button class="secondary" type="submit">Search</button></form><div class="section-heading"><h2>Personnel directory</h2><span class="muted">${roster.length} of ${people.length} personnel</span></div><div class="roster-list">${roster.map(p=>{
    const head=supervisorFor(p);
    return `<article class="roster-row"><div><h3>${escape(p.name)} ${p.isHead?'<span class="head-label">Supervisor</span>':''}</h3><p class="muted small">${escape(p.employeeId)} · ${escape(p.position||'Position not specified')}${p.company?' · '+escape(p.company):''}</p></div><div><strong>${escape(departmentById(p.departmentId).name)}</strong><p class="muted small">${escape(p.unit||'Department level')}</p></div><div><span class="muted small">Reports to</span><p>${head?escape(head.name):'Not assigned'}</p></div><button class="secondary" data-edit-personnel="${escape(p.id)}">Edit</button></article>`;
  }).join('')||'<div class="empty">No personnel match your search.</div>'}</div></section>`;
}
