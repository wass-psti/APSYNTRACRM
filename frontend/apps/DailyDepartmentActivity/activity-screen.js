import {statuses,supervisorFor,searchPersonnel,teamMembers,departmentScope} from './activity-model.js';
import {matchesActivityDraft} from './activity-repository.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const option = (value,label,selected) => '<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const select = (name,label,rows,selected) => '<label>'+label+'<select name="'+name+'">'+rows.map(row=>option(row.id,row.name,selected)).join('')+'</select></label>';
const nameOf = (rows,id) => rows.find(row=>row.id===id)?.name ?? 'Unavailable';
const manilaDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const emptyFields = () => ({title:'',details:'',status:'Completed',categoryId:''});
const statusRows = statuses.map(name=>({id:name,name}));
const any = (name,rows) => [{id:'',name},...rows];
const glyphs = {
  activities:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  pending:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  progress:'<path d="M12 4a8 8 0 1 1-8 8M4 8v4h4"/>',
  completed:'<circle cx="12" cy="12" r="8"/><path d="m8 12 3 3 5-6"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>'
};
const glyph = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+glyphs[name]+'</svg>';
const metric = (label,value,key) => '<div class="dda-metric dda-metric-'+key+'"><div class="dda-metric-copy"><span>'+esc(label)+'</span><strong>'+value+'</strong></div><span class="dda-metric-icon">'+glyph(key)+'</span></div>';
const heading = (title,description) => '<div class="dda-section-heading"><h2>'+title+'</h2><p>'+description+'</p></div>';
const views = [
  {id:'activities',label:'Activities'},
  {id:'organization',label:'Organization & Settings'},
  {id:'insights',label:'Team Insights'}
];
function navigation(view,busy,available) {
  return '<nav class="dda-view-nav" aria-label="Daily Department Activity views">'+views.map(item=>
    '<button type="button" class="secondary dda-view-button" data-dda-action="view" data-view="'+item.id+'" aria-pressed="'+(view===item.id)+'"'+(busy||!available?' disabled':'')+'>'+esc(item.label)+'</button>'
  ).join('')+'</nav>';
}
function viewVisibility(view,scope) {
  return scope.split(' ').includes(view)?'':' hidden';
}

const organizationTabs = [
  {id:'personnel',label:'Personnel'},
  {id:'departments',label:'Departments'},
  {id:'categories',label:'Categories'}
];
function organizationNavigation(active,busy) {
  return '<nav class="dda-org-nav" aria-label="Organization settings sections">'+organizationTabs.map(tab=>
    '<button type="button" class="secondary dda-org-tab" data-dda-action="organization-view" data-org-view="'+tab.id+'" aria-pressed="'+(active===tab.id)+'"'+(busy?' disabled':'')+'>'+tab.label+'</button>'
  ).join('')+'</nav>';
}
function organizationPanel(id,active,content) {
  return '<div class="dda-org-content" data-dda-org-panel="'+id+'"'+(id===active?'':' hidden')+'>'+content+'</div>';
}
function organizationMetric(label,count,description) {
  return '<div class="dda-org-metric"><span>'+label+'</span><strong>'+count+'</strong><small>'+description+'</small></div>';
}
function directoryPerson(person,department,directory) {
  const head=supervisorFor(person,directory);
  const metadata=[person.employeeId,person.position,person.company].filter(Boolean);
  return '<li class="dda-org-person"><div><strong>'+esc(person.name)+'</strong>'+
    (metadata.length?'<p>'+metadata.map(esc).join(' · ')+'</p>':'')+
    (head?'<p>Reports to '+esc(head.name)+'</p>':'')+'</div>'+
    (person.isHead?'<span class="dda-org-tag">Supervisor</span>':'')+'</li>';
}
function renderOrganization(snapshot,directoryFilters,active,busy,disabled,categoryMarkup) {
  const {directory,categories}=snapshot;
  const {departments,people,unassigned}=directory;
  const canManage=Array.isArray(unassigned);
  const available=unassigned||[];
  const matching=searchPersonnel(directory,directoryFilters);
  const ids=new Set(matching.map(row=>row.id));
  const searching=Boolean(directoryFilters.query||directoryFilters.departmentId);
  const visiblePeople=people.filter(row=>ids.has(row.id));
  const visibleUnassigned=available.filter(row=>ids.has(row.id));
  const summary='<div class="dda-org-summary" aria-label="Organization totals">'+
    organizationMetric('Departments',departments.length,'Reporting scopes')+
    organizationMetric('Assigned personnel',people.length,'In the reporting directory')+
    (canManage?organizationMetric('Unassigned',available.length,'Available for assignment'):'')+
    organizationMetric('Categories',categories.length,'Activity labels')+'</div>';
  const search=canManage?'<form data-dda-form="directory"><label>Directory search<input type="search" name="query" value="'+esc(directoryFilters.query)+'" placeholder="Name, ID, position or company"></label>'+
    select('departmentId','Reporting department',any('All departments',departments),directoryFilters.departmentId)+
    '<button type="submit" class="secondary"'+(busy?' disabled':'')+'>Apply personnel filters</button></form><p class="dda-org-result-count">'+matching.length+' matching personnel of '+(people.length+available.length)+'</p>':'';
  const roster=departments.filter(department=>!searching||visiblePeople.some(person=>person.departmentId===department.id)).map(department=>{
    const members=visiblePeople.filter(person=>person.departmentId===department.id);
    return '<details class="dda-org-roster-group"'+(searching?' open':'')+'><summary>'+esc(department.parentId?nameOf(departments,department.parentId)+' / '+department.name:department.name)+' ('+members.length+')</summary>'+
      (members.length?'<ul>'+members.map(person=>directoryPerson(person,department,directory)).join('')+'</ul>':'<p class="dda-org-blank">No assigned personnel.</p>')+'</details>';
  }).join('');
  const unassignedRoster=canManage&&visibleUnassigned.length?'<details class="dda-org-roster-group"'+(searching?' open':'')+'><summary>Unassigned ('+visibleUnassigned.length+')</summary><ul>'+visibleUnassigned.map(person=>'<li class="dda-org-person"><strong>'+esc(person.name)+'</strong><span class="dda-org-tag">Unassigned</span></li>').join('')+'</ul></details>':'';
  const personEditor=canManage?'<section class="dda-panel dda-org-editor">'+heading('Manage personnel','Select a person to update their reporting assignment and employee details.')+
    '<form data-dda-form="person"><fieldset'+disabled+'>'+select('id','Personnel to assign',any('Choose personnel',[...visiblePeople,...visibleUnassigned.map(row=>({...row,name:row.name+' (unassigned)'}))]),'')+
    '<label>Personnel display name<input name="name" required maxlength="160"></label><label>Employee ID<input name="employeeId" maxlength="80"></label><label>Position<input name="position" maxlength="120"></label>'+
    select('company','Company',[{id:'',name:'Not specified'},...['WASS','WAO','PSTI'].map(name=>({id:name,name}))],'')+
    select('departmentId','Assign department',any('Choose department',departments),'')+
    '<label class="dda-checkbox"><input type="checkbox" name="isHead"> Designate department or unit supervisor</label><p>Designating a supervisor replaces the current supervisor of that scope. Unverified personnel details may be left blank.</p><button type="submit" class="primary">Save personnel</button></fieldset></form></section>':'';
  const personnel='<div class="dda-org-split"><section class="dda-panel dda-directory">'+heading('Personnel directory',people.length+' assigned personnel'+(canManage?' · '+available.length+' available unassigned personnel':''))+search+
    '<h3 class="dda-org-list-title">Department roster</h3>'+(roster+unassignedRoster||'<p class="dda-org-blank">No personnel match your filters.</p>')+'</section>'+personEditor+'</div>';
  const departmentRows=departments.map(department=>'<li class="dda-org-item"><span class="dda-org-initial">'+esc(department.short||department.name.slice(0,2).toUpperCase())+'</span><div><strong>'+esc(department.name)+'</strong><p>'+esc(department.parentId?nameOf(departments,department.parentId):'Top-level department')+'</p></div><span class="dda-org-tag">'+people.filter(person=>person.departmentId===department.id).length+' assigned</span></li>').join('');
  const departmentEditor=canManage?'<section class="dda-panel dda-org-editor">'+heading('Manage departments','Create a reporting scope or edit an existing department or unit.')+
    '<form data-dda-form="department"><fieldset'+disabled+'>'+select('id','Department to edit',any('New department',departments),'')+
    '<label>Department name<input name="name" required maxlength="120"></label><label>Abbreviation<input name="short" maxlength="8"></label>'+
    select('parentId','Parent department',any('None (top level)',departments.filter(row=>!row.parentId)),'')+
    '<button type="submit" class="primary">Save department</button></fieldset></form></section>':'';
  const departmentContent='<div class="dda-org-split"><section class="dda-panel">'+heading('Department directory','Review reporting departments and organizational units.')+
    (departmentRows?'<ul class="dda-org-list">'+departmentRows+'</ul>':'<p class="dda-org-blank">No departments available.</p>')+'</section>'+departmentEditor+'</div>';
  const categoryRows=categories.map(category=>'<li class="dda-org-item"><span class="dda-org-initial">'+glyph('activities')+'</span><div><strong>'+esc(category.name)+'</strong></div></li>').join('');
  const categoryContent='<div class="dda-org-split"><section class="dda-panel">'+heading('Activity categories','Labels available when recording and filtering activities.')+
    (categoryRows?'<ul class="dda-org-list">'+categoryRows+'</ul>':'<div class="dda-empty"><span class="dda-empty-icon">'+glyph('activities')+'</span><h3>No categories yet</h3><p>Create your first category using the form.</p></div>')+'</section>'+categoryMarkup+'</div>';
  return '<div class="dda-org-heading"><div><span class="dda-eyebrow">REPORTING DIRECTORY</span><h2>Organization &amp; Settings</h2><p>Manage people, reporting departments and activity categories.</p></div></div>'+summary+
    (canManage?'<div class="dda-management-note">DDA reporting assignments do not change the shared CRM or AGT directory.</div>':'')+
    organizationNavigation(active,busy)+organizationPanel('personnel',active,personnel)+
    organizationPanel('departments',active,departmentContent)+organizationPanel('categories',active,categoryContent);
}

// Counts use the same filtered records as the activity register.
function insightCounts(records) {
  return {total:records.length,pending:records.filter(row=>row.status==='Pending').length,
    progress:records.filter(row=>row.status==='In Progress').length,
    completed:records.filter(row=>row.status==='Completed').length};
}
function insightMetric(label,value,description,icon) {
  return '<div class="dda-insight-metric"><div><span>'+label+'</span><strong>'+value+'</strong><p>'+description+'</p></div><span class="dda-metric-icon">'+glyph(icon)+'</span></div>';
}
function completionRate(counts) {
  return counts.total?Math.round(counts.completed/counts.total*100):null;
}
function reportingOverview(snapshot,records,filters,busy) {
  const {directory}=snapshot;
  const {departments,people}=directory;
  const members=teamMembers(directory,snapshot.records,filters);
  const counts=insightCounts(records);
  const contributors=new Set(records.map(row=>row.personId)).size;
  const rate=completionRate(counts);
  const selected=departments.find(row=>row.id===filters.departmentId);
  const summary='<div class="dda-insight-summary" aria-label="Team reporting totals">'+
    insightMetric('Personnel in scope',members.length,'Current and historical contributors','activities')+
    insightMetric('Matching activities',counts.total,'Within the applied filters','progress')+
    insightMetric('Active contributors',contributors,'People with matching activities','pending')+
    insightMetric('Completion rate',rate===null?'&mdash;':rate+'%',rate===null?'No matching activities':counts.completed+' of '+counts.total+' completed','completed')+'</div>';
  const cards=departments.filter(row=>!row.parentId).map(department=>{
    const scope=departmentScope(departments,department.id);
    const totals=insightCounts(records.filter(row=>scope.has(row.departmentId)));
    const count=people.filter(person=>scope.has(person.departmentId)).length;
    const reporting=new Set(records.filter(row=>scope.has(row.departmentId)).map(row=>row.personId)).size;
    const percent=completionRate(totals);
    const active=selected&&scope.has(selected.id);
    return '<article class="dda-insight-department'+(active?' is-selected':'')+'" data-insight-department="'+esc(department.id)+'">'+
      '<div class="dda-insight-dept-head"><span class="dda-org-initial">'+esc(department.short||department.name.slice(0,2).toUpperCase())+'</span><div><h3>'+esc(department.name)+'</h3><p>'+count+' assigned personnel</p></div>'+(active?'<span class="dda-org-tag">Selected</span>':'')+'</div>'+
      '<div class="dda-insight-dept-metrics"><div><strong>'+totals.total+'</strong><span>Activities</span></div><div><strong>'+reporting+'</strong><span>Reporting</span></div><div><strong>'+totals.completed+'</strong><span>Completed</span></div></div>'+
      '<div class="dda-insight-progress"><div><span>Completion</span><strong>'+(percent===null?'&mdash;':percent+'%')+'</strong></div><progress value="'+totals.completed+'" max="'+(totals.total||1)+'" aria-label="'+esc(department.name)+' activity completion"></progress><p>'+(selected&&!active?'Outside selected department':percent===null?'No matching activities':totals.completed+' of '+totals.total+' completed')+'</p></div>'+
      '<button type="button" class="secondary dda-insight-team" data-dda-action="team" data-id="'+esc(department.id)+'"'+(busy?' disabled':'')+'>View team <span aria-hidden="true">→</span></button></article>';
  }).join('');
  const roster=members.map(person=>{
    const totals=insightCounts(records.filter(row=>row.personId===person.id));
    const initials=person.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase();
    return '<tr class="dda-insight-person"><th scope="row"><div class="dda-insight-person-name"><span class="dda-org-initial" aria-hidden="true">'+esc(initials)+'</span><div><strong>'+esc(person.name)+'</strong><p>'+esc(person.formerContributor?'Former contributor · Current: ':'')+esc(nameOf(departments,person.departmentId))+'</p></div></div></th>'+
      '<td>'+totals.total+'</td><td>'+totals.pending+'</td><td>'+totals.progress+'</td><td>'+totals.completed+'</td></tr>';
  }).join('');
  const personnel='<section class="dda-panel dda-insight-roster"><div class="dda-insight-section-head">'+heading('Personnel activity overview ('+members.length+')','Individual activity counts reflect the same applied filters.')+'<span class="dda-count">'+contributors+' reporting</span></div>'+
    (roster?'<div class="dda-insight-table-scroll" role="region" aria-label="Personnel activity table" tabindex="0"><table class="dda-insight-table"><thead><tr><th scope="col">Personnel</th><th scope="col">Total</th><th scope="col">Pending</th><th scope="col">In progress</th><th scope="col">Completed</th></tr></thead><tbody>'+roster+'</tbody></table></div>':'<div class="dda-empty"><h3>No personnel match the selected filters.</h3><p>Adjust the department or personnel filter to review another team.</p></div>')+'</section>';
  return '<section class="dda-reporting"><div class="dda-insight-heading"><div><span class="dda-eyebrow">REPORTING / TEAM PERFORMANCE</span><h2>Team Insights</h2><p>Review activity volume, completion and individual contributions.</p></div><div class="dda-insight-scope"><span>Reporting scope</span><strong>'+(selected?esc(selected.name):'All departments')+'</strong><p>'+esc(filters.date||'All dates')+'</p></div></div>'+summary+
    '<section class="dda-panel dda-insight-departments">'+heading('Department activity overview','Assigned personnel reflect current reporting scopes; activity counts follow the applied filters.')+
    (cards?'<div class="dda-insight-department-grid">'+cards+'</div>':'<p>No departments available.</p>')+'</section>'+personnel+'</section>';
}

export function renderActivityScreen({snapshot,records,filters,editor,fields,busy,notice,error,requiresReload,directoryFilters={query:'',departmentId:''},view='activities',organizationView='personnel'}) {
  const disabled = busy || requiresReload ? ' disabled' : '';
  const top = '<header class="dda-heading"><div><span class="dda-eyebrow">WORK MANAGEMENT / ACTIVITY LOG</span><h1>Daily Department Activity</h1><p>Track daily work, monitor progress and keep your teams aligned.</p></div><div class="dda-header-actions">'+navigation(view,busy,Boolean(snapshot))+'<button type="button" class="secondary dda-refresh" data-dda-action="refresh"'+(busy?' disabled':'')+'>'+glyph('refresh')+'Refresh</button></div></header>';
  const messages = '<p role="status" data-dda-notice>'+esc(notice)+'</p><p role="alert" data-dda-error>'+esc(error)+'</p>';
  if (!snapshot) return '<section class="dda-app">'+top+messages+'<p>'+ (busy?'Loading activities…':'Activity service unavailable. Refresh to retry.')+'</p></section>';
  const {directory:{departments,people},categories} = snapshot;
  const filterForm = '<form data-dda-form="filters"><label>Activity date<input type="date" name="date" value="'+esc(filters.date)+'"></label>'+
    select('departmentId','Department',any('All departments',departments),filters.departmentId)+
    select('personId','Personnel',any('All personnel',people),filters.personId)+
    select('status','Status',any('All statuses',statusRows),filters.status)+
    select('categoryId','Category',any('All categories',categories),filters.categoryId)+
    '<label>Search<input type="search" name="query" placeholder="Search activities" value="'+esc(filters.query)+'"></label><button type="submit" class="secondary"'+(busy?' disabled':'')+'>Apply filters</button></form>';
  const stats = '<div class="dda-stats" aria-label="Activity totals">'+metric('Activities',records.length,'activities')+statuses.map((status,index)=>metric(status,records.filter(row=>row.status===status).length,['pending','progress','completed'][index])).join('')+'</div>';
  const editorMarkup = editor ? '<section class="dda-panel dda-editor">'+heading(editor.activityId?'Edit activity':'Record activity',esc(nameOf(people,editor.personId))+' · '+esc(editor.date))+
    '<form data-dda-form="activity"><fieldset'+disabled+'><label>Activity title<input name="title" required maxlength="160" value="'+esc(fields.title)+'"></label><label>Details<textarea name="details" maxlength="2000" rows="4">'+esc(fields.details)+'</textarea></label>'+
    select('status','Status',statusRows,fields.status)+select('categoryId','Category',any('Uncategorized',categories),fields.categoryId)+
    '<div class="dda-actions"><button class="primary" type="submit">Save activity</button><button type="button" class="secondary" data-dda-action="close-editor">Close (keep draft)</button><button type="button" class="secondary" data-dda-action="discard">Discard draft</button></div></fieldset></form></section>' :
    '<section class="dda-panel dda-editor">'+heading('Record activity','Select a team member and reporting date to begin.')+'<form data-dda-form="new"><fieldset'+disabled+'>'+select('personId','Personnel',people,filters.personId)+'<label>Date<input name="date" type="date" required value="'+esc(filters.date||manilaDate())+'"></label><button class="primary" type="submit"'+(!people.length?' disabled':'')+'>New activity</button></fieldset></form>'+(!people.length?'<p>No personnel available.</p>':'')+'</section>';
  const categoryMarkup = '<section class="dda-panel dda-categories">'+heading('Categories','Create and maintain labels for activity reporting.')+'<form data-dda-form="category"><fieldset'+disabled+'>'+select('id','Category to edit',any('New category',categories),'')+'<label>Category name<input name="name" required maxlength="120"></label><button type="submit" class="primary">Save category</button></fieldset></form></section>';
  const list = '<section class="dda-panel dda-records"><div class="dda-list-heading">'+heading('Recorded activities','Review and update entries for the selected filters.')+'<span class="dda-count">'+records.length+' '+(records.length===1?'entry':'entries')+'</span></div>'+(records.length?records.map(row=>'<article class="dda-entry"><div><h3>'+esc(row.title)+'</h3><p>'+esc(nameOf(people,row.personId))+' · '+esc(nameOf(departments,row.departmentId))+' · '+esc(row.date)+'</p><p class="dda-record-meta"><span class="dda-status" data-status="'+esc(row.status)+'">'+esc(row.status)+'</span><span>'+esc(row.categoryId?nameOf(categories,row.categoryId):'Uncategorized')+'</span></p><p class="dda-details">'+esc(row.details)+'</p></div><div class="dda-actions"><button type="button" class="secondary" data-dda-action="edit" data-id="'+esc(row.id)+'"'+disabled+'>Edit</button><button type="button" class="secondary" data-dda-action="delete" data-id="'+esc(row.id)+'"'+disabled+'>Delete</button></div></article>').join(''):'<div class="dda-empty"><span class="dda-empty-icon">'+glyph('activities')+'</span><h3>No matching activities.</h3><p>Try another date or filter, or use Record activity to add an entry.</p></div>')+'</section>';
  return '<section class="dda-app">'+top+messages+
    '<div class="dda-view-region" data-dda-views="activities"'+viewVisibility(view,'activities')+'>'+stats+'</div>'+
    '<section class="dda-panel dda-filters" data-dda-views="activities insights"'+viewVisibility(view,'activities insights')+'>'+heading('Filter activities','Choose the reporting scope for activities and team insights.')+filterForm+'</section>'+
    '<div class="dda-layout" data-dda-views="activities"'+viewVisibility(view,'activities')+'>'+editorMarkup+list+'</div>'+
    '<div class="dda-view-region" data-dda-views="insights"'+viewVisibility(view,'insights')+'>'+reportingOverview(snapshot,records,filters,busy)+'</div>'+
    '<div class="dda-management" data-dda-views="organization"'+viewVisibility(view,'organization')+'>'+renderOrganization(snapshot,directoryFilters,organizationView,busy,disabled,categoryMarkup)+'</div></section>';
}

// The CRM host owns the controller and must call dispose on route exit.
export function mountDailyDepartmentActivity(host,controller,{today=manilaDate(),confirmDelete=()=>window.confirm('Delete this activity?')}={}) {
  let snapshot=null,editor=null,fields=emptyFields(),notice='',error='',busy=false,disposed=false;
  let filters={date:today,departmentId:'',personId:'',status:'',categoryId:'',query:''};
  let directoryFilters={query:'',departmentId:''};
  let view='activities',organizationView='personnel';
  function switchOrganizationView(next) {
    if(!snapshot||!organizationTabs.some(tab=>tab.id===next))return;
    organizationView=next;
    for(const panel of host.querySelectorAll('[data-dda-org-panel]'))panel.hidden=panel.dataset.ddaOrgPanel!==next;
    for(const button of host.querySelectorAll('[data-dda-action="organization-view"]'))button.setAttribute('aria-pressed',String(button.dataset.orgView===next));
  }
  // Keep the mounted forms intact when changing views, including unsaved inputs.
  function switchView(next) {
    if(!snapshot||!views.some(item=>item.id===next))return;
    view=next;
    for(const region of host.querySelectorAll('[data-dda-views]')){
      region.hidden=!region.dataset.ddaViews.split(' ').includes(view);
    }
    for(const button of host.querySelectorAll('[data-dda-action="view"]')){
      button.setAttribute('aria-pressed',String(button.dataset.view===view));
    }
  }
  function paint() {
    if (!disposed) host.innerHTML=renderActivityScreen({snapshot,records:snapshot?controller.getRecords(filters):[],filters,editor,fields,busy,notice,error,directoryFilters,view,organizationView,requiresReload:controller.requiresReload});
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
    if(kind==='directory'){directoryFilters=data;paint();return;}
    if(kind==='new'){openEditor({personId:data.personId,date:data.date,activityId:''},emptyFields());return;}
    if(kind==='activity'&&editor){
      captureDraft(form);
      const input={...fields,personId:editor.personId,date:editor.date},id=editor.activityId;
      void run(async()=>{const result=await controller.save(input,id);snapshot=result.snapshot;editor=null;fields=emptyFields();notice=result.draftWarning||'Activity saved.';});
    }
    if(kind==='category')void run(async()=>{const result=await controller.saveCategory({name:data.name},data.id);snapshot=result.snapshot;notice='Category saved.';});
    if(kind==='department')void run(async()=>{const result=await controller.saveDepartment(data,data.id);snapshot=result.snapshot;notice=result.draftWarning||'Department saved.';});
    if(kind==='person')void run(async()=>{const result=await controller.savePerson({...data,isHead:data.isHead==='on'});snapshot=result.snapshot;notice=result.draftWarning||'Personnel saved.';});
  }
  function onChange(event) {
    const form=event.target.closest('form[data-dda-form]');
    if(!form||!snapshot)return;
    if(form.dataset.ddaForm==='person'&&event.target.name==='departmentId'){form.elements.isHead.checked=false;return;}
    if(event.target.name!=='id')return;
    const id=event.target.value;
    if(form.dataset.ddaForm==='category')form.elements.name.value=snapshot.categories.find(row=>row.id===id)?.name||'';
    if(form.dataset.ddaForm==='department'){
      const row=snapshot.directory.departments.find(item=>item.id===id);
      form.elements.name.value=row?.name||'';
      form.elements.parentId.value=row?.parentId||'';
      form.elements.short.value=row?.short||'';
    }
    if(form.dataset.ddaForm==='person'){
      const row=snapshot.directory.people.find(item=>item.id===id);
      const source=snapshot.directory.unassigned?.find(item=>item.id===id);
      form.elements.name.value=row?.name||source?.name||'';
      form.elements.name.readOnly=!!source;
      form.elements.departmentId.value=row?.departmentId||'';
      form.elements.employeeId.value=row?.employeeId||'';
      form.elements.position.value=row?.position||'';
      form.elements.company.value=row?.company||'';
      form.elements.isHead.checked=Boolean(row?.isHead);
    }
  }
  function onClick(event) {
    const button=event.target.closest('[data-dda-action]');
    if(!button||!host.contains(button)||busy)return;
    const action=button.dataset.ddaAction;
    const record=snapshot?.records.find(row=>row.id===button.dataset.id);
    if(action==='view'){switchView(button.dataset.view);return;}
    if(action==='organization-view'){switchOrganizationView(button.dataset.orgView);return;}
    if(action==='refresh')void run(async()=>{notice='Activities refreshed.';acceptLoaded(await controller.load());});
    else if(action==='team'&&snapshot?.directory.departments.some(row=>row.id===button.dataset.id)){filters={...filters,departmentId:button.dataset.id,personId:''};paint();}
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
