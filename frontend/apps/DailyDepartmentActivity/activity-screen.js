import {statuses} from './activity-model.js';
import {matchesActivityDraft} from './activity-repository.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const option = (value,label,selected) => '<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const select = (name,label,rows,selected) => '<label>'+label+'<select name="'+name+'">'+rows.map(row=>option(row.id,row.name,selected)).join('')+'</select></label>';
const nameOf = (rows,id) => rows.find(row=>row.id===id)?.name ?? 'Unavailable';
const manilaDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const emptyFields = () => ({title:'',details:'',status:'Completed',categoryId:''});
const statusRows = statuses.map(name=>({id:name,name}));
const any = (name,rows) => [{id:'',name},...rows];

export function renderActivityScreen({snapshot,records,filters,editor,fields,busy,notice,error,requiresReload}) {
  const disabled = busy || requiresReload ? ' disabled' : '';
  const top = '<header><div><h1>Daily Department Activity</h1><p>Record and review departmental work.</p></div><button type="button" class="secondary" data-dda-action="refresh"'+(busy?' disabled':'')+'>Refresh</button></header>';
  const messages = '<p role="status" data-dda-notice>'+esc(notice)+'</p><p role="alert" data-dda-error>'+esc(error)+'</p>';
  if (!snapshot) return '<section class="dda-app">'+top+messages+'<p>'+ (busy?'Loading activities…':'Activity service unavailable. Refresh to retry.')+'</p></section>';
  const {directory:{departments,people},categories} = snapshot;
  const filterForm = '<form data-dda-form="filters"><label>Activity date<input type="date" name="date" value="'+esc(filters.date)+'"></label>'+
    select('departmentId','Department',any('All departments',departments),filters.departmentId)+
    select('personId','Personnel',any('All personnel',people),filters.personId)+
    select('status','Status',any('All statuses',statusRows),filters.status)+
    select('categoryId','Category',any('All categories',categories),filters.categoryId)+
    '<label>Search<input type="search" name="query" value="'+esc(filters.query)+'"></label><button type="submit" class="secondary"'+(busy?' disabled':'')+'>Apply filters</button></form>';
  const stats = '<div class="dda-stats">'+[['Activities',records.length],...statuses.map(status=>[status,records.filter(row=>row.status===status).length])].map(([label,n])=>'<div><span>'+esc(label)+'</span><strong>'+n+'</strong></div>').join('')+'</div>';
  const editorMarkup = editor ? '<section class="dda-panel"><h2>'+(editor.activityId?'Edit activity':'Record activity')+'</h2><p>'+esc(nameOf(people,editor.personId))+' · '+esc(editor.date)+'</p>'+
    '<form data-dda-form="activity"><fieldset'+disabled+'><label>Activity title<input name="title" required maxlength="160" value="'+esc(fields.title)+'"></label><label>Details<textarea name="details" maxlength="2000" rows="4">'+esc(fields.details)+'</textarea></label>'+
    select('status','Status',statusRows,fields.status)+select('categoryId','Category',any('Uncategorized',categories),fields.categoryId)+
    '<div class="dda-actions"><button class="primary" type="submit">Save activity</button><button type="button" class="secondary" data-dda-action="close-editor">Close (keep draft)</button><button type="button" class="secondary" data-dda-action="discard">Discard draft</button></div></fieldset></form></section>' :
    '<section class="dda-panel"><h2>Record activity</h2><form data-dda-form="new"><fieldset'+disabled+'>'+select('personId','Personnel',people,filters.personId)+'<label>Date<input name="date" type="date" required value="'+esc(filters.date||manilaDate())+'"></label><button class="primary" type="submit"'+(!people.length?' disabled':'')+'>New activity</button></fieldset></form>'+(!people.length?'<p>No personnel available.</p>':'')+'</section>';
  const categoryMarkup = '<section class="dda-panel"><h2>Categories</h2><form data-dda-form="category"><fieldset'+disabled+'>'+select('id','Category to edit',any('New category',categories),'')+'<label>Category name<input name="name" required maxlength="120"></label><button type="submit" class="secondary">Save category</button></fieldset></form></section>';
  const list = '<section class="dda-panel"><h2>Recorded activities</h2>'+(records.length?records.map(row=>'<article class="dda-entry"><div><h3>'+esc(row.title)+'</h3><p>'+esc(nameOf(people,row.personId))+' · '+esc(nameOf(departments,row.departmentId))+' · '+esc(row.date)+'</p><p>'+esc(row.status)+' · '+esc(row.categoryId?nameOf(categories,row.categoryId):'Uncategorized')+'</p><p class="dda-details">'+esc(row.details)+'</p></div><div class="dda-actions"><button type="button" class="secondary" data-dda-action="edit" data-id="'+esc(row.id)+'"'+disabled+'>Edit</button><button type="button" class="secondary" data-dda-action="delete" data-id="'+esc(row.id)+'"'+disabled+'>Delete</button></div></article>').join(''):'<p>No matching activities.</p>')+'</section>';
  const unassigned=snapshot.directory.unassigned;
  const management=Array.isArray(unassigned)?
    '<p>DDA reporting assignments do not change the shared CRM or AGT directory.</p>'+
    '<form data-dda-form="department"><fieldset'+disabled+'>'+select('id','Department to edit',any('New department',departments),'')+
    '<label>Department name<input name="name" required maxlength="120"></label>'+
    select('parentId','Parent department',any('None (top level)',departments.filter(row=>!row.parentId)),'')+
    '<button type="submit" class="secondary">Save department</button></fieldset></form>'+
    '<p>'+unassigned.length+' available unassigned personnel</p>'+
    '<form data-dda-form="person"><fieldset'+disabled+'>'+select('id','Personnel to assign',any('Choose personnel',[...people,...unassigned.map(row=>({...row,name:row.name+' (unassigned)'}))]),'')+
    '<label>Personnel display name<input name="name" required maxlength="160"></label>'+
    select('departmentId','Assign department',any('Choose department',departments),'')+
    '<button type="submit" class="secondary">Save personnel</button></fieldset></form>':'';
  const directory = '<section class="dda-panel"><h2>Department directory</h2>'+management+departments.map(department=>'<details><summary>'+esc(department.parentId?nameOf(departments,department.parentId)+' / '+department.name:department.name)+' ('+people.filter(person=>person.departmentId===department.id).length+')</summary><ul>'+people.filter(person=>person.departmentId===department.id).map(person=>'<li>'+esc(person.name)+'</li>').join('')+'</ul></details>').join('')+'</section>';
  return '<section class="dda-app">'+top+messages+filterForm+stats+'<div class="dda-layout"><div>'+editorMarkup+categoryMarkup+directory+'</div>'+list+'</div></section>';
}

// The CRM host owns the controller and must call dispose on route exit.
export function mountDailyDepartmentActivity(host,controller,{today=manilaDate(),confirmDelete=()=>window.confirm('Delete this activity?')}={}) {
  let snapshot=null,editor=null,fields=emptyFields(),notice='',error='',busy=false,disposed=false;
  let filters={date:today,departmentId:'',personId:'',status:'',categoryId:'',query:''};
  function paint() {
    if (!disposed) host.innerHTML=renderActivityScreen({snapshot,records:snapshot?controller.getRecords(filters):[],filters,editor,fields,busy,notice,error,requiresReload:controller.requiresReload});
  }
  function messages() {
    if(disposed)return;
    host.querySelector('[data-dda-notice]').textContent=notice;
    host.querySelector('[data-dda-error]').textContent=error;
  }
  async function run(work) {
    if(busy||disposed)return;
    busy=true;error='';notice='';paint();
    try {await work();}
    catch(e){error=e instanceof Error?e.message:'Activity operation failed.';}
    finally{busy=false;paint();}
  }
  function acceptLoaded(next) {
    snapshot=next;
    const recovered=next.recoveries||[];
    if(!recovered.length)return;
    const rejected=recovered.find(item=>item.outcome==='rejected');
    const warning=recovered.find(item=>item.warning)?.warning;
    for(const item of recovered){
      if(item.outcome==='committed'&&editor&&item.scope&&
         ['personId','date','activityId'].every(key=>(editor[key]||'')===(item.scope[key]||''))&&
         matchesActivityDraft(fields,item.record)){editor=null;fields=emptyFields();}
    }
    notice=warning||(rejected?'Previous request was rejected. Your draft is retained for review.':'Previous request confirmed without a duplicate save.');
    if(rejected)error=rejected.reason;
  }
  function openEditor(scope,initial) {
    editor=scope;fields=initial;
    try {const recovered=controller.recoverDraft(scope);if(recovered){fields=recovered;notice='Unsaved draft restored.';}}
    catch {error='The local draft could not be recovered.';}
    paint();
  }
  function captureDraft(form) {
    fields=Object.fromEntries(new FormData(form));
    try {controller.storeDraft(editor,fields);}
    catch {error='Local draft could not be stored. Keep this screen open until saved.';messages();}
  }
  function onInput(event) {
    const form=event.target.closest('form[data-dda-form="activity"]');
    if(form&&editor&&!busy)captureDraft(form);
  }
  function onSubmit(event) {
    const form=event.target.closest('form[data-dda-form]');
    if(!form||!host.contains(form))return;
    event.preventDefault();
    if(busy)return;
    const data=Object.fromEntries(new FormData(form));
    const kind=form.dataset.ddaForm;
    if(kind==='filters'){filters=data;paint();return;}
    if(kind==='new'){openEditor({personId:data.personId,date:data.date,activityId:''},emptyFields());return;}
    if(kind==='activity'&&editor){
      captureDraft(form);
      const input={...fields,personId:editor.personId,date:editor.date},id=editor.activityId;
      void run(async()=>{const result=await controller.save(input,id);snapshot=result.snapshot;editor=null;fields=emptyFields();notice=result.draftWarning||'Activity saved.';});
    }
    if(kind==='category')void run(async()=>{const result=await controller.saveCategory({name:data.name},data.id);snapshot=result.snapshot;notice='Category saved.';});
    if(kind==='department')void run(async()=>{const result=await controller.saveDepartment(data,data.id);snapshot=result.snapshot;notice=result.draftWarning||'Department saved.';});
    if(kind==='person')void run(async()=>{const result=await controller.savePerson(data);snapshot=result.snapshot;notice=result.draftWarning||'Personnel saved.';});
  }
  function onChange(event) {
    const form=event.target.closest('form[data-dda-form]');
    if(!form||event.target.name!=='id'||!snapshot)return;
    const id=event.target.value;
    if(form.dataset.ddaForm==='category')form.elements.name.value=snapshot.categories.find(row=>row.id===id)?.name||'';
    if(form.dataset.ddaForm==='department'){
      const row=snapshot.directory.departments.find(item=>item.id===id);
      form.elements.name.value=row?.name||'';
      form.elements.parentId.value=row?.parentId||'';
    }
    if(form.dataset.ddaForm==='person'){
      const row=snapshot.directory.people.find(item=>item.id===id);
      const source=snapshot.directory.unassigned?.find(item=>item.id===id);
      form.elements.name.value=row?.name||source?.name||'';
      form.elements.name.readOnly=!!source;
      form.elements.departmentId.value=row?.departmentId||'';
    }
  }
  function onClick(event) {
    const button=event.target.closest('[data-dda-action]');
    if(!button||!host.contains(button)||busy)return;
    const action=button.dataset.ddaAction;
    const record=snapshot?.records.find(row=>row.id===button.dataset.id);
    if(action==='refresh')void run(async()=>{notice='Activities refreshed.';acceptLoaded(await controller.load());});
    else if(action==='edit'&&record)openEditor({personId:record.personId,date:record.date,activityId:record.id},{title:record.title,details:record.details,status:record.status,categoryId:record.categoryId||''});
    else if(action==='close-editor'){editor=null;fields=emptyFields();paint();}
    else if(action==='discard'&&editor){try{controller.discardDraft(editor);editor=null;fields=emptyFields();notice='Draft discarded.';}catch{error='Draft could not be discarded.';}paint();}
    else if(action==='delete'&&record&&confirmDelete(record))void run(async()=>{const result=await controller.remove(record.id);snapshot=result.snapshot;if(editor?.activityId===record.id){editor=null;fields=emptyFields();}notice='Activity deleted.';});
  }
  host.addEventListener('input',onInput);
  host.addEventListener('change',onChange);
  host.addEventListener('submit',onSubmit);
  host.addEventListener('click',onClick);
  const ready=run(async()=>{acceptLoaded(await controller.load());});
  return {ready,dispose(){disposed=true;host.removeEventListener('input',onInput);host.removeEventListener('change',onChange);host.removeEventListener('submit',onSubmit);host.removeEventListener('click',onClick);controller.dispose();host.replaceChildren();}};
}
