// BS01 local standalone laboratory interface. Simulated identities only.
const $=selector=>document.querySelector(selector);
const store={session:null,role:null,email:null,issued:null,boardId:null,pendingToken:''};
function captureToken(){
 const match=/^#\/invite\/([0-9a-f-]{36}\.[0-9a-f]{64})$/i.exec(location.hash);
 if(!match)return;
 store.pendingToken=match[1];
 history.replaceState(null,'',location.pathname+'#/guest');
 $('#role').value='guest';
 $('#email').value='guest@example.test';
}
captureToken();

const notify=(message,bad=false)=>{
 const notice=$('#notice');
 notice.textContent=message;
 notice.style.backgroundColor=bad?'#852f43':'#212b4e';
 notice.hidden=false;
};
function element(tag,text,cls){
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(cls)node.className=cls;
 return node;
}
async function api(path,{method='GET',body=null}={}){
 const headers={};
 if(store.session)headers['X-Demo-Session']=store.session;
 if(method==='POST')headers['Content-Type']='application/json';
 let response;
 try{
  response=await fetch(path,{method,headers,
   ...(method==='POST'?{body:JSON.stringify(body||{})}:{})});
 }catch{throw Error('The local simulation server is unavailable.');}
 const data=await response.json().catch(()=>({error:'invalid_response'}));
 if(!response.ok)throw Error('Denied ('+response.status+'): '+(data.error||'request_failed'));
 return data;
}
async function displayBoards(){
 const {boards}=await api('/api/boards');
 const list=$('#board-list');
 list.replaceChildren();
 for(const board of boards){
  const row=element('div',undefined,'boardrow');
  const info=element('div');
  info.append(element('strong',board.name));
  info.append(element('span',
   board.kind==='protected_app'?'Protected application — no external guests':'Demo project board',
   'pill'+(board.kind==='protected_app'?' locked':'')));
  const controls=element('div',undefined,'controls');
  const selector=element('select');
  selector.setAttribute('aria-label','External access policy for '+board.name);
  for(const [mode,text] of [
   ['private','Private'],
   ['workspace_restricted','Workspace restricted'],
   ['guest_shareable','Guest shareable']
  ]){
   const opt=element('option',text);opt.value=mode;
   if(board.mode===mode)opt.selected=true;
   if(mode==='guest_shareable'&&board.kind==='protected_app')opt.disabled=true;
   selector.append(opt);
  }
  const apply=element('button','Save policy');
  apply.type='button';
  apply.addEventListener('click',async()=>{
   try{
    await api('/api/policy',{method:'POST',
     body:{boardId:board.id,mode:selector.value,expectedRevision:board.revision}});
    notify('Privacy policy changed for '+board.name);
    await displayBoards();await displayEvents();
   }catch(e){notify(e.message,true);await displayBoards();}
  });
  controls.append(selector,apply);
  if(board.kind!=='protected_app'){
   const issue=element('button','Generate demo link','primary');
   issue.type='button';
   issue.disabled=board.mode!=='guest_shareable';
   issue.addEventListener('click',async()=>{
    try{
     const issued=await api('/api/issue',{method:'POST',body:{boardId:board.id}});
     // Token appears only once. Keep it in volatile browser memory.
     store.issued={invitationId:issued.invitationId,boardId:board.id,
      url:location.origin+'/#/invite/'+issued.token};
     $('#issued-url').value=store.issued.url;
     $('#issued-panel').hidden=false;
     $('#no-link').hidden=true;
     notify('Demo invitation created. Copy it and open it as a simulated guest.');
     await displayEvents();
    }catch(e){notify(e.message,true);}
   });
   controls.append(issue);
  }
  row.append(info,controls);list.append(row);
 }
}
async function displayEvents(){
 const {events}=await api('/api/events');
 const box=$('#events');
 box.replaceChildren();
 if(!events.length)box.append(element('p','No demo activity yet.'));
 else for(const event of events.slice().reverse().slice(0,30)){
  box.append(element('p',
   event.at+' · '+event.event+' · '+event.actor+' · '+event.boardId));
 }
}
async function displayGuestBoard(boardId){
 const board=await api('/api/guest/'+encodeURIComponent(boardId));
 const box=$('#guest-access');
 box.replaceChildren();
 box.append(element('h3',board.name));
 box.append(element('p','Authorized resource: '+board.boardId+' · Viewer only · No workspace access','muted'));
 const ul=element('ul');
 for(const item of board.items)ul.append(element('li',item));
 box.append(ul,element('p',board.notice,'muted'));
}
async function setIdentity(event){
 event.preventDefault();
 const role=$('#role').value,email=$('#email').value;
 try{
  const data=await api('/api/session',{method:'POST',body:{role,email}});
  store.session=data.session;store.role=data.role;store.email=data.email;
  $('#identity-status').textContent='Demo session: '+role+' · '+email;
  $('#owner-panel').hidden=role!=='owner';
  $('#guest-panel').hidden=role!=='guest';
  if(role==='owner'){await displayBoards();await displayEvents();}
  else if(store.pendingToken)$('#guest-token').value=store.pendingToken;
  notify('Simulated '+role+' session created. No Supabase account was accessed.');
 }catch(e){notify(e.message,true);}
}
async function redeem(event){
 event.preventDefault();
 const input=$('#guest-token');
 const token=input.value.trim();
 try{
  const result=await api('/api/accept',{method:'POST',body:{token}});
  input.value='';store.pendingToken='';
  store.boardId=result.boardId;
  await displayGuestBoard(result.boardId);
  notify('Demo invitation accepted: viewer access to exactly one board.');
 }catch(e){notify(e.message,true);}
}
$('#login-form').addEventListener('submit',setIdentity);
$('#redeem-form').addEventListener('submit',redeem);
$('#role').addEventListener('change',()=>{
 $('#email').value=$('#role').value==='owner'?'owner@example.test':'guest@example.test';
});
$('#copy-link').addEventListener('click',async()=>{
 if(!store.issued)return;
 try{
  await navigator.clipboard.writeText(store.issued.url);
  notify('Demo invitation link copied. Paste into another browser tab.');
 }catch{
  $('#issued-url').focus();$('#issued-url').select();
  notify('Select and copy the link in the field (Ctrl+C).',true);
 }
});
$('#revoke-link').addEventListener('click',async()=>{
 if(!store.issued)return;
 try{
  await api('/api/revoke',{method:'POST',
   body:{invitationId:store.issued.invitationId}});
  $('#issued-panel').hidden=true;$('#no-link').hidden=false;
  store.issued=null;
  notify('Demo invitation revoked. Previously granted demo access is denied.');
  await displayEvents();
 }catch(e){notify(e.message,true);}
});
