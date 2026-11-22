/** Shared OJT login: one GoTrue actor, independent PIN-verified intern attendance.
 * This module never persists a PIN or bearer identity token to storage.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Existing verified company login: ojt@watchdogautomation.com.ph.
 * TimeTracker application role remains Employee; department is OJT.
 * The backend separately verifies these attributes and active membership.
 */
export const TIMETRACKER_SHARED_OJT_USER_ID='d613280d-907b-418f-b872-c0f6dd53e580';
export function isEligibleTimeTrackerSharedOjtAccount(member){
 return member?.id===TIMETRACKER_SHARED_OJT_USER_ID &&
  member?.role==='Employee' &&
  member?.department?.trim().toLocaleLowerCase()==='ojt';
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fail=m=>{throw Error(m)};
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const same=(r,s)=>r?.actorId===s.userId&&r?.workspaceId===s.workspaceId&&
 r?.boardId===s.boardId;
const scoped=(a)=>a&&uuid.test(a.userId||'')&&uuid.test(a.workspaceId||'')&&uuid.test(a.boardId||'');
const safeName=n=>typeof n==='string'&&n.trim().length>=2&&n.trim().length<=100;
const sharedModes=['PERSONAL','SHARED_LOGIN','SHARED_DISABLED'];
export function projectOjtRoster(raw,scope){
 if(!scoped(scope)||raw?.contract!=='tt-ojt-roster-1'||!same(raw,scope)||
  !sharedModes.includes(raw.mode)||!Array.isArray(raw.interns)||raw.interns.length>300)fail('Verified OJT roster unavailable');
 const seen=new Set(),names=new Set();
 const interns=raw.interns.map(i=>{
  if(!uuid.test(i?.id||'')||!safeName(i.name)||seen.has(i.id)||
    names.has(i.name.trim().toLocaleLowerCase()))fail('Invalid signed OJT roster');
  seen.add(i.id);names.add(i.name.trim().toLocaleLowerCase());
  return Object.freeze({id:i.id,name:i.name.trim()});
 });
 if(raw.mode!=='SHARED_LOGIN'&&interns.length)fail('Inactive OJT roster cannot expose identities');
 return Object.freeze({mode:raw.mode,interns:Object.freeze(interns)});
}
export function projectOjtAdmin(raw,scope){
 if(!scoped(scope)||raw?.contract!=='tt-ojt-admin-1'||!same(raw,scope)||
   !Array.isArray(raw.groups)||raw.groups.length>150)fail('Verified OJT admin roster unavailable');
 const groups=new Set();
 return Object.freeze({groups:Object.freeze(raw.groups.map(g=>{
  if(!uuid.test(g?.userId||'')||groups.has(g.userId)||typeof g.enabled!=='boolean'||
    !Array.isArray(g.interns)||g.interns.length>300)fail('Invalid OJT admin group');
  groups.add(g.userId);
  const seen=new Set();
  const interns=g.interns.map(i=>{
   if(!uuid.test(i?.id||'')||!safeName(i.name)||typeof i.active!=='boolean'||
    seen.has(i.id))fail('Invalid OJT admin identity');
   seen.add(i.id);return Object.freeze({id:i.id,name:i.name,active:i.active});
  });
  return Object.freeze({userId:g.userId,enabled:g.enabled,interns:Object.freeze(interns)});
 }))});
}
export function projectOjtAttendance(raw,scope,internId){
 if(!scoped(scope)||raw?.contract!=='tt-ojt-attendance-1'||
  !same(raw,scope)||raw?.internId!==internId||!safeName(raw.name)||
  !Array.isArray(raw.records)||raw.records.length>50)
  fail('Verified intern attendance unavailable');
 const seen=new Set(),records=raw.records.map(x=>{
  if(!uuid.test(x?.id||'')||seen.has(x.id)||!validTime(x.clockIn)||
    (x.clockOut!==null&&!validTime(x.clockOut))||
    (x.clockOut!==null&&Date.parse(x.clockOut)<Date.parse(x.clockIn))||
    typeof x.location!=='string'||x.location.length>100||
    (x.workNote!==null&&typeof x.workNote!=='string'))
   fail('Invalid intern attendance record');
  seen.add(x.id);
  return Object.freeze({id:x.id,clockIn:x.clockIn,clockOut:x.clockOut,
   location:x.location,workNote:x.workNote||'',status:x.clockOut?'Completed':'Active'});
 });
 if(records.filter(x=>x.status==='Active').length>1)fail('Conflicting OJT sessions require administrator review');
 return Object.freeze({internId,name:raw.name,records:Object.freeze(records),
  active:records.find(x=>x.status==='Active')||null});
}
export function projectOjtAdminAttendance(raw,scope){
 if(!scoped(scope)||raw?.contract!=='tt-ojt-admin-attendance-1'||!same(raw,scope)||
   !Array.isArray(raw.records)||raw.records.length>100)fail('Signed intern report unavailable');
 const ids=new Set();
 return Object.freeze({records:Object.freeze(raw.records.map(x=>{
  if(!uuid.test(x?.id||'')||!uuid.test(x?.internId||'')||ids.has(x.id)||
    !safeName(x.name)||!validTime(x.clockIn)||
    (x.clockOut!==null&&!validTime(x.clockOut)))fail('Invalid OJT admin attendance row');
  ids.add(x.id);
  return Object.freeze({id:x.id,internId:x.internId,name:x.name,
    clockIn:x.clockIn,clockOut:x.clockOut,location:String(x.location||'')});
 }))});
}

export class TimeTrackerOjtClient{
 constructor({auth,api}){this.auth=auth;this.api=api;}
 async identity(scope){
  if(!scoped(scope))fail('Signed OJT workspace and board required');
  const [u,ctx]=await Promise.all([this.auth.getVerifiedUser(),this.api.context()]);
  if(!this.auth.isSignedIn||u?.id!==scope.userId||
    ctx?.user_id!==scope.userId||ctx?.workspace_id!==scope.workspaceId||
    ctx?.profile?.status!=='active')fail('OJT session or workspace changed');
 }
 async perform(scope,method,args,project){
  await this.identity(scope);
  const response=await this.api.rpc(method,{p_board_id:scope.boardId,...args},
    {retryUnauthorized:false});
  await this.identity(scope);
  return project?project(response):response;
 }
 roster(s){return this.perform(s,'timetracker_ojt_roster',{},v=>projectOjtRoster(v,s));}
 admin(s){return this.perform(s,'timetracker_ojt_admin_snapshot',{},v=>projectOjtAdmin(v,s));}
 async adminAttendance(s){
  return this.perform(s,'timetracker_ojt_admin_attendance',{},
    v=>projectOjtAdminAttendance(v,s));
 }
 async setGroup(s,userId,enabled){
  if(!uuid.test(userId||'')||typeof enabled!=='boolean')fail('OJT account required');
  return this.perform(s,'timetracker_ojt_group_set',
   {p_shared_user_id:userId,p_enabled:enabled},
   v=>{if(v?.contract!=='tt-ojt-admin-write-1'||v.workspaceId!==s.workspaceId||
       v.userId!==userId||v.enabled!==enabled)fail('OJT group write unverified');return v});
 }
 async setIntern(s,{userId,id=null,name,pin=null,active=true}={}){
  name=String(name??'').trim();
  if(!uuid.test(userId||'')||(id!==null&&!uuid.test(id))||!safeName(name)||
    (pin!==null&&!/^[0-9]{8,12}$/.test(pin))||
    (id===null&&pin===null))fail('Intern name and individual 8–12 digit PIN required');
  return this.perform(s,'timetracker_ojt_intern_set',
   {p_shared_user_id:userId,p_intern_id:id,p_name:name,p_pin:pin,p_active:active},
   v=>{if(v?.contract!=='tt-ojt-admin-write-1'||v.workspaceId!==s.workspaceId||
      !uuid.test(v.internId||'')||v.active!==active)fail('OJT identity write unverified');return v});
 }
 async select(s,id,pin){
  if(!uuid.test(id||'')||!/^[0-9]{8,12}$/.test(pin||''))fail('Select an intern and enter the individual PIN');
  return this.perform(s,'timetracker_ojt_select',{p_intern_id:id,p_pin:pin},
   v=>{
    if(v?.contract!=='tt-ojt-select-1')fail('OJT verification response invalid');
    if(v.ok!==true)fail('Incorrect PIN or temporarily locked identity');
    if(!same(v,s)||v.internId!==id||!safeName(v.name)||
      !/^[0-9a-f]{64}$/.test(v.token||'')||!validTime(v.expiresAt))
     fail('OJT verification identity mismatch');
    return Object.freeze({id,name:v.name,token:v.token,
      expiresAt:v.expiresAt,scope:{...s}});
   });
 }
 snapshot(s,selected){
  if(selected?.scope?.userId!==s.userId||selected?.scope?.workspaceId!==s.workspaceId||
   selected?.scope?.boardId!==s.boardId)fail('Selected intern session changed');
  return this.perform(s,'timetracker_ojt_snapshot',
   {p_token:selected.token},v=>projectOjtAttendance(v,s,selected.id));
 }
 async commit(s,selected,{action,recordId=null,location,geo,workNote=''}={}){
  if(!['clock-in','clock-out'].includes(action)||
    (recordId!==null&&!uuid.test(recordId))||
    !geo||geo.status!=='captured')fail('Verified OJT attendance action and fresh GPS fix required');
  return this.perform(s,'timetracker_ojt_commit',
   {p_token:selected.token,p_action:action,p_record_id:recordId,
    p_location:location,p_geo:geo,p_work_note:String(workNote||'').trim()},
   v=>{
    if(v?.contract!=='tt-ojt-commit-1'||v.mode!=='COMMITTED'||
       !same(v,s)||v.internId!==selected.id||v.action!==action||
       !uuid.test(v.recordId||'')||!validTime(v.committedAt))
     fail('OJT attendance receipt could not be verified');
    return Object.freeze(v);
   });
 }
 leave(s,selected){
  if(!selected?.token)return Promise.resolve();
  return this.perform(s,'timetracker_ojt_leave',{p_token:selected.token},
   v=>{if(v?.contract!=='tt-ojt-leave-1'||v.ok!==true)fail('OJT identity release failed');return v});
 }
}

const stamp=x=>x?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',
 month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(x)):'—';
const locationOptions=['Office-Base Duty','Offsite (Home)','Local Field Works',
 'Out of Town Assignment','International Field Assignments'];
export function renderTimeTrackerOjtClock({
 roster=null,selected=null,attendance=null,busy=false,error='',success=''
}={}){
 const disabled=busy?' disabled':'';
 let html='<section class="tt-ojt" aria-label="Individual OJT attendance">'+
  '<div class="tt-ojt-header"><div><p>TIME TRACKER / OJT</p>'+
  '<h3>Intern attendance</h3><span>One company login, individually verified records.</span></div>';
 if(selected)html+='<button type="button" class="secondary" data-action="tt-ojt-leave"'+disabled+
  '>Switch intern</button>';
 html+='</div>';
 if(error)html+='<p class="tt-ojt-error" role="alert">'+esc(error)+'</p>';
 if(success)html+='<p class="tt-ojt-success" role="status">'+esc(success)+'</p>';
 if(roster?.mode==='SHARED_DISABLED')
  return html+'<p role="status">This shared OJT login is disabled or no longer eligible. Contact a TimeTracker administrator.</p></section>';
 if(roster?.mode==='SERVICE_UNAVAILABLE')
  return html+'<p role="alert">Individual OJT attendance requires the signed Supabase service. Standard attendance is disabled for this shared account until deployment.</p></section>';
 if(roster?.mode==='SETUP_REQUIRED')
  return html+'<p role="status">This account is ready, but the shared OJT roster has not been enabled yet. Ask an administrator to activate the shared login and add intern profiles.</p></section>';
 if(!selected){
  html+='<h4>Who is clocking in?</h4><p>Choose your name and enter your private PIN before using attendance.</p>';
  html+='<div class="tt-ojt-roster">'+(roster?.interns?.length?
   roster.interns.map(i=>'<button type="button" data-action="tt-ojt-choose" data-ojt-id="'+
     esc(i.id)+'"'+disabled+'><span class="tt-ojt-avatar">'+
     esc(i.name.slice(0,1).toUpperCase())+'</span><strong>'+esc(i.name)+
     '</strong><small>Verify identity</small></button>').join(''):
   '<p>No active interns are registered yet. Ask the TimeTracker administrator to add your profile.</p>')+'</div>';
  return html+'</section>';
 }
 const active=attendance?.active||null;
 html+='<div class="tt-ojt-selected"><span class="tt-ojt-avatar">'+
   esc(selected.name[0]?.toUpperCase()||'O')+'</span><div><strong>'+
   esc(selected.name)+'</strong><small>Identity verified for this session</small></div></div>'+
   '<div class="tt-ojt-session"><strong>'+ (active?'Active session':'Ready to clock in')+
   '</strong><p>'+(active?'Clocked in '+esc(stamp(active.clockIn))+
    ' · '+esc(active.location):'GPS is requested only when starting or ending a session.')+'</p>'+
   '<label for="tt-ojt-location">Work location</label>'+
   (active?'<p class="tt-ojt-current-location">'+esc(active.location)+'</p>':
    '<select id="tt-ojt-location"'+disabled+'>'+
     locationOptions.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('')+
     '</select>')+
   (active?'':'<label for="tt-ojt-note">Work note (required when working from home)</label>'+
    '<textarea id="tt-ojt-note" maxlength="500" rows="3" placeholder="Optional work details…"></textarea>')+
   '<button type="button" class="tt-ojt-clock-button" data-action="tt-ojt-clock"'+disabled+'>'+
     (busy?'Saving…':active?'End session':'Start session')+'</button></div>';
 html+='<div class="tt-ojt-history"><h4>My attendance</h4>'+
  '<table><thead><tr><th>Clock in</th><th>Clock out</th><th>Location</th></tr></thead><tbody>'+
  (attendance?.records?.length?
    attendance.records.map(x=>'<tr><td>'+esc(stamp(x.clockIn))+'</td><td>'+
     esc(stamp(x.clockOut))+'</td><td>'+esc(x.location)+'</td></tr>').join(''):
    '<tr><td colspan="3">No attendance records yet.</td></tr>')+
  '</tbody></table></div></section>';
 return html;
}
export function renderTimeTrackerOjtAdmin({admin=null,attendance=null,employees=[]}={}){
 if(!admin)return '<section class="tt-ojt-admin"><h4>OJT shared identities</h4>'+
  '<p>Administrator roster management is unavailable until the signed OJT service is deployed.</p></section>';
 const users=employees.filter(isEligibleTimeTrackerSharedOjtAccount);
 const configured=new Set(admin.groups.map(x=>x.userId));
 return '<section class="tt-ojt-admin" aria-label="OJT shared login management">'+
  '<div class="tt-ojt-admin-head"><h4>OJT shared login &amp; intern profiles</h4>'+
   '<p>Choose an existing OJT login account. Each intern receives a private PIN and distinct attendance history.</p></div>'+
  '<div class="tt-ojt-unconfigured">'+
   users.filter(x=>!configured.has(x.id)).map(x=>
    '<div><strong>'+esc(x.name)+'</strong>'+
    '<button type="button" data-action="tt-ojt-group-enable" data-ojt-user="'+esc(x.id)+
    '">Enable shared login</button></div>').join('')+'</div>'+
  admin.groups.map(g=>{
   const user=users.find(x=>x.id===g.userId);
   return '<article class="tt-ojt-admin-group"><header><div><strong>'+
    esc(user?.name||'OJT account')+'</strong><small>'+
    (g.enabled?'Shared login enabled':'Shared login disabled')+'</small></div>'+
    '<button type="button" data-action="tt-ojt-group-toggle" data-ojt-user="'+
    esc(g.userId)+'" data-ojt-enabled="'+String(!g.enabled)+'">'+
    (g.enabled?'Disable shared login':'Enable shared login')+'</button></header>'+
    '<div class="tt-ojt-admin-people">'+
     g.interns.map(i=>'<div><span class="tt-ojt-avatar">'+esc(i.name[0]?.toUpperCase()||'O')+
      '</span><strong>'+esc(i.name)+'</strong><small>'+ (i.active?'Active':'Inactive')+
      '</small><button type="button" data-action="tt-ojt-intern-edit" data-ojt-user="'+
      esc(g.userId)+'" data-ojt-id="'+esc(i.id)+'">Edit / PIN</button></div>').join('')+
    '</div><button type="button" class="tt-ojt-add" data-action="tt-ojt-intern-add" data-ojt-user="'+
    esc(g.userId)+'">+ Add intern</button></article>';
  }).join('')+
  '<div class="tt-ojt-admin-records"><h4>Recent intern attendance</h4>'+
  '<table><thead><tr><th>Intern</th><th>Clock in</th><th>Clock out</th></tr></thead><tbody>'+
  (attendance?.records?.length?
   attendance.records.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+
    esc(stamp(x.clockIn))+'</td><td>'+esc(stamp(x.clockOut))+'</td></tr>').join(''):
   '<tr><td colspan="3">No OJT attendance records available.</td></tr>')+
  '</tbody></table></div></section>';
}
