/** APP-V2: signed, strictly app-scoped Roles > Settings presentation.
 * Data contract is server-authoritative. No screenshot sample rows in production.
 */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const nameValue=value=>String(value??'').trim();
const APP_KEYS=Object.freeze([
 ['fueltrans','FuelTrans Standalone'],
 ['tool-traceability','Tool Traceability'],
 ['order-intake','Order Intake'],
 ['time-tracker','TimeTracker']
]);
const ACTIONS=Object.freeze(['view','create','edit','delete','approve','export']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function verifyAppRolesSnapshot(raw,{appKey,workspaceId,actorId}={}){
 if(!raw||raw.contract!=='apsyntra-app-roles-v2'||raw.authorized!==true||
    raw.workspaceId!==workspaceId||raw.actorId!==actorId||raw.appKey!==appKey||
    !UUID.test(raw.appId||'')||!Number.isSafeInteger(raw.revision)||raw.revision<0||
    raw.canManage!==true||!Array.isArray(raw.roles)||!Array.isArray(raw.features)||
    !Array.isArray(raw.people)||raw.roles.length>300||raw.features.length>300||
    raw.people.length>10000)return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
 const roleIds=new Set(),roleKeys=new Set(),featureKeys=new Set(),memberKeys=new Set();
 for(const r of raw.roles){
  if(!UUID.test(r?.id||'')||roleIds.has(r.id)||
     typeof r.key!=='string'||r.key.length>100||roleKeys.has(r.key)||
     typeof r.name!=='string'||nameValue(r.name).length===0||r.name.length>100||
     typeof r.description!=='string'||r.description.length>600||
     typeof r.isAdminRole!=='boolean'||!Number.isSafeInteger(r.memberCount)||
     r.memberCount<0||!Array.isArray(r.capabilities)||r.capabilities.length>1800)
   return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
  for(const cap of r.capabilities){
   if(typeof cap.featureKey!=='string'||!ACTIONS.includes(cap.capability)||
      typeof cap.allowed!=='boolean')return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
  }
  roleIds.add(r.id);roleKeys.add(r.key);
 }
 if(raw.roles.filter(r=>r.isAdminRole).length!==1)
  return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
 for(const f of raw.features){
  if(typeof f.key!=='string'||featureKeys.has(f.key)||f.key.length>100||
     typeof f.name!=='string'||f.name.length>150||
     !Array.isArray(f.availableCapabilities)||
     f.availableCapabilities.some(c=>!ACTIONS.includes(c)))
   return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
  featureKeys.add(f.key);
 }
 for(const p of raw.people){
  if(!UUID.test(p?.roleId||'')||!roleIds.has(p.roleId)||
     !UUID.test(p.userId||'')||typeof p.name!=='string'||
     p.name.length>250||memberKeys.has(p.roleId+':'+p.userId))
   return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
  memberKeys.add(p.roleId+':'+p.userId);
 }
 for(const r of raw.roles){
  if(raw.people.filter(p=>p.roleId===r.id).length!==r.memberCount)return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
  for(const capability of r.capabilities){
   const feature=raw.features.find(f=>f.key===capability.featureKey);
   if(!feature?.availableCapabilities.includes(capability.capability))
    return {status:'UNAVAILABLE',roles:[],features:[],people:[]};
  }
 }
 return Object.freeze({...raw,status:'VERIFIED_APP_ROLES'});
}
const icon=type=>type==='more'?
 '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>':'';
const avatar=p=>'<span class="ap-v2-app-avatar" aria-hidden="true">'+
 esc((p.name||'?').split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase())+'</span>';
const side=(appKey)=>'<aside class="ap-v2-app-sidebar" aria-label="Applications navigation">'+
 '<div class="ap-v2-app-brand"><span>A</span><strong>APSYNTRA CRM</strong></div>'+
 '<div class="ap-v2-app-sidegroup"><p>Applications</p>'+
 APP_KEYS.map(([id,label])=>'<a href="#/apps/'+id+'/settings/roles"'+
  (id===appKey?' class="active" aria-current="page"':'')+'>'+esc(label)+'</a>').join('')+
 '</div><div class="ap-v2-app-sidegroup"><p>Administration</p>'+
 '<a href="#/user-role-management">User Role Management</a></div></aside>';
export function renderAppRolesSettings({appKey='fueltrans',snapshot=null,selectedRoleId=null,
 loading=false,error='',pending=null}={}){
 const app=APP_KEYS.find(([key])=>key===appKey)?.[1]||'Application';
 const ready=snapshot?.status==='VERIFIED_APP_ROLES'&&snapshot.appKey===appKey;
 const roles=ready?snapshot.roles:[];
 const role=roles.find(r=>r.id===selectedRoleId)||roles[0]||null;
 const featureList=ready?snapshot.features:[];
 const members=ready&&role?snapshot.people.filter(p=>p.roleId===role.id):[];
 const changed=Array.isArray(pending)?pending.length:0;
 const table=role?'<div class="ap-v2-app-right-head"><div><h2>'+esc(role.name)+'</h2>'+
  '<p>'+esc(role.description)+'</p></div>'+
  '<details class="ap-v2-app-menu"><summary aria-label="Role options">'+icon('more')+'</summary>'+
  '<div class="ap-v2-app-menu-options">'+
  ['Rename','Edit description','Duplicate','Delete'].map(t=>
   '<button type="button" data-app-role-action="'+t.toLowerCase().replace(/ /g,'-')+'">'+t+'</button>').join('')+
  '</div></details></div>'+
 '<div class="ap-v2-app-table-viewport"><table class="ap-v2-app-table"><thead><tr>'+
 '<th>What this role can do</th>'+
 ACTIONS.map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody>'+
 featureList.map(f=>'<tr><th scope="row">'+esc(f.name)+'</th>'+
 ACTIONS.map(c=>{
  if(!f.availableCapabilities.includes(c))return '<td><span class="ap-v2-app-dash" aria-label="Not applicable">–</span></td>';
  const stored=role.capabilities.find(x=>x.featureKey===f.key&&x.capability===c)?.allowed===true;
  const changedValue=pending?.find(x=>x.roleId===role.id&&x.featureKey===f.key&&x.capability===c);
  const effective=changedValue?changedValue.allowed===true:stored;
  return '<td><label class="ap-v2-app-checkbox"><span class="ap-v2-app-sr">'+esc(f.name+' '+c)+'</span>'+
   '<input type="checkbox" data-app-role-action="toggle-capability" data-feature-key="'+esc(f.key)+
   '" data-capability="'+esc(c)+'"'+(effective?' checked':'')+'></label></td>';
 }).join('')+'</tr>').join('')+'</tbody></table></div>'+
 '<section class="ap-v2-app-people"><div class="ap-v2-app-people-heading"><h3>People with this role · '+members.length+'</h3>'+
 '<button type="button" class="ap-v2-app-secondary" data-app-role-action="assign-person">+ Assign people</button></div>'+
 '<div class="ap-v2-app-person-chips">'+members.map(p=>'<button type="button" class="ap-v2-app-chip" data-app-role-action="remove-person" data-user-id="'+esc(p.userId)+
 '" title="Remove '+esc(p.name)+' from role">'+avatar(p)+esc(p.name)+'</button>').join('')+'</div></section>'+
 (changed?'<footer class="ap-v2-app-save"><span>Changes apply to '+esc(app)+' only. '+changed+' unsaved change'+(changed===1?'':'s')+'.</span>'+
 '<div><button type="button" class="ap-v2-app-secondary" data-app-role-action="discard">Discard</button>'+
 '<button type="button" class="ap-v2-app-primary" data-app-role-action="save">Save changes</button></div></footer>':''):
 '<div class="ap-v2-app-unavailable" role="status">'+
 (loading?'<p>Loading verified app roles…</p>':'<h2>App role management is not available yet</h2><p>'+
 esc(error||'The signed app-role service has not been activated. Existing permissions remain unchanged.')+
 '</p><button type="button" class="ap-v2-app-primary" data-app-role-action="retry">Retry</button>')+'</div>';
 return '<div class="ap-v2-app-shell">'+side(appKey)+'<main class="ap-v2-app-main">'+
 '<p class="ap-v2-app-breadcrumb">'+esc(app)+'</p><h1>Settings</h1>'+
 '<nav class="ap-v2-app-tabs" aria-label="Application settings">'+
 ['General','Roles','Notifications','Integrations'].map(t=>
 '<button type="button" '+(t==='Roles'?'class="active" aria-current="page"':'disabled title="Only Roles is available in this settings screen"')+'>'+t+'</button>').join('')+'</nav>'+
 '<div class="ap-v2-app-cols"><section class="ap-v2-app-list">'+
 '<button type="button" class="ap-v2-app-secondary ap-v2-app-full" data-app-role-action="new-role"'+(!ready?' disabled':'')+'>+ New role</button>'+
 '<nav aria-label="Roles in this application">'+roles.map(r=>
  '<button type="button" data-app-role-action="select-role" data-role-id="'+esc(r.id)+'" class="'+(role?.id===r.id?'active':'')+'">'+
   '<span>'+esc(r.name)+'</span><span>'+r.memberCount+'</span></button>').join('')+'</nav>'+
 '<p class="ap-v2-app-list-note">These roles exist only in '+esc(app)+'. Other apps have their own.</p>'+
 '</section><section class="ap-v2-app-detail">'+table+'</section></div></main></div>';
}
