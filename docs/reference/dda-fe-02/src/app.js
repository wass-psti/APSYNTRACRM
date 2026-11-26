import {people,readDirectory,writeDirectory,applyDirectory,currentDirectory,saveDepartment,savePerson} from './data/directory.js';
import {manilaDate,readActivities,writeActivities,saveActivity,filterActivities} from './data/activities.js';
import {dashboard,activities,team} from './ui/views.js';
import {departmentManagement,personnelManagement,unitOptions} from './ui/management.js';

const main=document.querySelector('#main');
const notice=document.querySelector('#notice');
let storageError='';
let records=[];
try {
  applyDirectory(readDirectory(localStorage));
  records=readActivities(localStorage);
} catch(error) {
  storageError='Unable to read local data. Saving is unavailable until browser storage is restored.';
}
const state={records,date:manilaDate(),personId:people.find(person=>!person.isHead)?.id||people[0].id,departmentId:'',teamPersonId:'',status:'',editId:'',departmentFormOpen:false,departmentEditId:'',personFormOpen:false,personEditId:'',personnelQuery:'',personnelDepartment:''};
const views={dashboard,departments:departmentManagement,personnel:personnelManagement,activities,team};
const page=()=>Object.hasOwn(views,location.hash.slice(1))?location.hash.slice(1):'dashboard';
function showNotice(message,error=false) {
  notice.textContent=message;
  notice.className=message?(error?'error':'success'):'';
}
function render() {
  const current=page();
  if(state.teamPersonId&&state.departmentId&&!people.some(p=>p.id===state.teamPersonId&&p.departmentId===state.departmentId)&&!filterActivities(state.records,{date:state.date,departmentId:state.departmentId,personId:state.teamPersonId}).length)state.teamPersonId='';
  main.innerHTML=views[current](state);
  for(const link of document.querySelectorAll('nav a')) {
    if(link.hash==='#'+current)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  if(storageError)showNotice(storageError,true);
}
function closeForms() {
  state.editId='';state.departmentFormOpen=false;state.departmentEditId='';state.personFormOpen=false;state.personEditId='';
}
window.addEventListener('hashchange',()=>{closeForms();showNotice('');render();});
main.addEventListener('change',event=>{
  const value=event.target.value;
  if(event.target.id==='personnel-form-department'){
    main.querySelector('#personnel-form-unit').innerHTML=unitOptions(value);
    event.target.form.elements.isHead.checked=false;
    return;
  }
  if(event.target.id==='personnel-form-unit'){event.target.form.elements.isHead.checked=false;return;}
  switch(event.target.id) {
    case 'date-filter': if(!value){render();return;} state.date=value;break;
    case 'person-filter':state.personId=value;break;
    case 'department-filter':state.departmentId=value;state.teamPersonId='';break;
    case 'team-person-filter':state.teamPersonId=value;break;
    case 'status-filter':state.status=value;break;
    default:return;
  }
  state.editId='';render();
});
main.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.team) {state.departmentId=button.dataset.team;state.teamPersonId='';state.status='';location.hash='team';}
  if(button.dataset.edit) {state.editId=button.dataset.edit;render();main.querySelector('[name=title]').focus();}
  if(button.id==='cancel-edit') {state.editId='';render();}
  if(button.hasAttribute('data-add-department')||button.dataset.editDepartment){
    state.departmentFormOpen=true;state.departmentEditId=button.dataset.editDepartment||'';render();main.querySelector('#department-form [name=name]').focus();
  }
  if(button.hasAttribute('data-add-personnel')||button.dataset.editPersonnel){
    state.personFormOpen=true;state.personEditId=button.dataset.editPersonnel||'';render();main.querySelector('#personnel-form [name=name]').focus();
  }
  if(button.id==='cancel-department'||button.id==='cancel-personnel'){closeForms();render();}
});
function saveDirectory(next) {
  writeDirectory(localStorage,next);
  applyDirectory(next);
}
main.addEventListener('submit',event=>{
  const form=event.target;
  if(!['activity-form','department-form','personnel-form','personnel-search'].includes(form.id))return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='personnel-search'){
    state.personnelQuery=data.query;state.personnelDepartment=data.departmentId;render();return;
  }
  if(storageError){showNotice(storageError,true);return;}
  try {
    let message='Activity saved on this browser.';
    if(form.id==='department-form'){
      saveDirectory(saveDepartment(currentDirectory(),data,state.departmentEditId));
      message='Department saved on this browser.';
    }else if(form.id==='personnel-form'){
      saveDirectory(savePerson(currentDirectory(),{...data,isHead:form.elements.isHead.checked},state.personEditId));
      message='Personnel saved on this browser.';
      state.personnelQuery='';state.personnelDepartment='';
    }else{
      const next=saveActivity(state.records,{...data,personId:state.personId,date:state.date},state.editId);
      writeActivities(localStorage,next);
      state.records=next;
    }
    closeForms();render();showNotice(message);
  } catch(error){showNotice(error.message||'Changes could not be saved.',true);}
});
render();
