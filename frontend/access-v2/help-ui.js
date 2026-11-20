/** Three-layer access education screen; read-only and permission-neutral. */
export function renderAccessModelHelp(){
 const layers=[
  {index:1,label:'Workspace',icon:'♙',body:'Organize people into teams and set workspace-level roles without changing app capabilities.',tags:['Member','Team owner','System Admin'],where:'User Role Management'},
  {index:2,label:'Board',icon:'▦',body:'Grant Viewer or Editor access to one board, directly or through team membership.',tags:['Viewer','Editor'],where:'Board Invite / N'},
  {index:3,label:'Application',icon:'▦',body:'Each app has its own approved roles and capabilities, such as requests, approvals and reports.',tags:['Requester','Approver','Dispatcher'],where:'App Settings > Roles'}
 ];
 const cards=layers.map(l=>'<article class="ap-v2-help-card '+(l.index===2?'highlight':'')+'">'+
  '<div class="ap-v2-help-icon" aria-hidden="true">'+l.icon+'</div>'+
  '<span class="ap-v2-help-layer">Layer '+l.index+'</span><h2>'+l.label+'</h2>'+
  '<p>'+l.body+'</p><div class="ap-v2-help-tags">'+l.tags.map(t=>
   '<span class="'+(t==='System Admin'?'admin':t==='Editor'||t==='Team owner'?'editor':'')+'">'+t+'</span>').join('')+'</div>'+
  '<footer>Managed in<strong>'+l.where+'</strong></footer></article>').join('');
 return '<div class="ap-v2-help-shell"><aside class="ap-v2-help-sidebar">'+
  '<div class="ap-v2-help-brand"><span>A</span><strong>APSYNTRA CRM</strong></div>'+
  '<nav aria-label="Access navigation"><a href="#/overview">Dashboard</a>'+
  '<a href="#/user-role-management">User Role Management</a>'+
  '<a href="#/access-model" aria-current="page">How access works</a></nav></aside>'+
  '<main class="ap-v2-help-main"><a href="#/user-role-management" class="ap-v2-help-back">← User Role Management</a>'+
  '<div class="ap-v2-help-eyebrow">HOW ACCESS WORKS</div>'+
  '<h1>Three layers of access, each managed where it belongs</h1>'+
  '<p class="ap-v2-help-subtitle">Workspace roles organize people, board access determines collaboration, and application roles control actions within each app.</p>'+
  '<div class="ap-v2-help-grid">'+cards+'</div>'+
  '<section class="ap-v2-help-combine"><h2>HOW THEY COMBINE</h2>'+
  '<p>A person’s effective board access is the highest role from their direct invitation and team memberships. Application capabilities come from their role inside that app. A verified System Admin overrides both according to backend authorization.</p></section>'+
  '</main></div>';
}
