/** Signed TalkBox facade over existing Toolbox Issues RPCs. No monday.com mirroring. */
const statuses=['Working on it','Stuck','Done'];
const isId=x=>/^[1-9][0-9]{0,18}$/.test(String(x||''));
const isUuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x||''));
const activeTimer=x=>x?.timeTracking?.running||null;
const isoTime=x=>{const d=new Date(x);if(!Number.isFinite(d.getTime())||d.toISOString()!==x)throw new TypeError('Invalid timer start');return d;};

const id=x=>{if(!isId(x))throw new TypeError('Invalid issue ID');return String(x)};
const date=x=>{
 const value=String(x??'');
 if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TypeError('Invalid target date');
 if(value){
  const parsed=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value)
   throw new TypeError('Invalid target date');
 }
 return value||null;
};
export function projectTalkBoxIssue(x){
 if(!x||!isId(x.id))throw new TypeError('Invalid Toolbox issue payload');
 return {id:String(x.id),name:String(x.name||''),status:String(x.status||'Working on it'),
  date:x.date||null,version:Number(x.version),person:Array.isArray(x.person)?x.person:[],
  timeTracking:x.timeTracking||{hours:0,minutes:0},assets:Array.isArray(x.assets)?x.assets:[],
  pendingAttachmentCleanup:Array.isArray(x.pendingAttachmentCleanup)?x.pendingAttachmentCleanup:[],
  creator:x.creator||null,updatedAt:x.updatedAt||null,
  updates:Array.isArray(x.updates)?x.updates:[],subitems:Array.isArray(x.subitems)?x.subitems:[]};
}
export function talkBoxMetrics(rows=[]){
 return {total:rows.length,open:rows.filter(r=>r.status!=='Done').length,
  done:rows.filter(r=>r.status==='Done').length,stuck:rows.filter(r=>r.status==='Stuck').length};
}
export class TalkBoxNativeClient{
 constructor({api,workspaceId}){
  if(typeof api?.rpc!=='function'||!/^[0-9a-f-]{36}$/i.test(workspaceId||''))
   throw new TypeError('Signed workspace API required');
  this.api=api;this.workspaceId=workspaceId;
 }
 rpc(name,args={}){return this.api.rpc('toolbox_issues_'+name,{p_workspace_id:this.workspaceId,...args});}
 async list(cursor=null,filter={}){
  const name=String(filter.name||'').trim();
  if(name.length>500)throw new TypeError('Issue search is too long');
  const status=String(filter.status||'').trim();
  if(status&&status!=='All'&&!statuses.includes(status))throw new TypeError('Invalid issue status filter');
  const where={};
  if(name)where.name=name;
  if(status&&status!=='All')where.status=status;
  const result=await this.rpc('list_issues',{p_where:Object.keys(where).length?where:null,
   p_order_by:{column:'updatedAt',direction:'desc'},p_limit:50,p_cursor:cursor});
  if(!Array.isArray(result?.items))throw new Error('Invalid Toolbox issue list');
  return {items:result.items.map(projectTalkBoxIssue),cursor:result.cursor||null,total:Number(result.total)||0};
 }
 async get(issueId){return projectTalkBoxIssue(await this.rpc('get_issue',{p_issue_id:id(issueId)}));}
 /** A deleted/archived selection must not hide an otherwise valid issue list.
  * Other failures (including access denial) still propagate to the caller.
  */
 async getIfAvailable(issueId){
  try{return await this.get(issueId);}
  catch(error){if(error?.status===404)return null;throw error;}
 }
 async create(name){
  const title=String(name||'').trim();if(!title||title.length>500)throw new TypeError('Issue title must be 1–500 characters');
  return projectTalkBoxIssue(await this.rpc('create_issue',{p_fields:{name:title,status:'Working on it'}}));
 }
 async update(issueId,fields,version){
  const changes={};
  if(Object.hasOwn(fields,'name')){
   changes.name=String(fields.name||'').trim();
   if(!changes.name||changes.name.length>500)throw new TypeError('Issue title must be 1–500 characters');
  }
  if(Object.hasOwn(fields,'status')){
   if(!statuses.includes(fields.status))throw new TypeError('Invalid status');
   changes.status=fields.status;
  }
  if(Object.hasOwn(fields,'date'))changes.date=date(fields.date);
  if(Object.hasOwn(fields,'timeTracking')){
   const value=fields.timeTracking;
   if(!value||typeof value!=='object'||Array.isArray(value)||
      !Number.isSafeInteger(value.hours)||value.hours<0||value.hours>100000||
      !Number.isSafeInteger(value.minutes)||value.minutes<0||value.minutes>59)
    throw new TypeError('Tracked hours must be 0–100,000 and minutes 0–59');
   changes.timeTracking={...value,hours:value.hours,minutes:value.minutes};
  }
  if(!Object.keys(changes).length||!Number.isSafeInteger(version)||version<1)throw new TypeError('Changes and current version required');
  return projectTalkBoxIssue(await this.rpc('update_issue',{p_issue_id:id(issueId),p_updates:changes,p_expected_version:version}));
 }
 async post(issueId,message){
  const text=String(message||'').trim();if(!text||text.length>20000)throw new TypeError('Update must be 1–20,000 characters');
  return this.rpc('add_update',{p_issue_id:id(issueId),p_text:text});
 }
 /**
  * First write the existing signed domain object, then read it independently.
  * Never use the mutation response as proof of durable persistence.
  */
 async createVerified(name){
  const receipt=await this.create(name);
  const record=await this.get(receipt.id);
  if(record.name!==receipt.name)throw new Error('Created issue readback did not match');
  return record;
 }
 async updateVerified(issueId,fields,version){
  const receipt=await this.update(issueId,fields,version);
  const record=await this.get(issueId);
  if(record.version!==receipt.version||
     Object.entries(fields).some(([key,value])=>{
      if(key==='timeTracking'){
       const exact=(left,right)=>left?.hours===right?.hours&&left?.minutes===right?.minutes&&
        (left?.totalSeconds??null)===(right?.totalSeconds??null)&&
        (left?.running?.startedAt??null)===(right?.running?.startedAt??null);
       return !exact(record.timeTracking,receipt.timeTracking)||!exact(receipt.timeTracking,value);
      }
      if(key==='name')return record.name!==receipt.name||record.name!==String(value).trim();
      if(key==='date')return record.date!==receipt.date||
       record.date!==(value||null);
      return record[key]!==receipt[key]||record[key]!==value;
     }))
   throw new Error('Updated issue readback did not match');
  return record;
 }
 async postVerified(issueId,message){
  const receipt=await this.post(issueId,message);
  const record=await this.get(issueId);
  const posted=record.updates.find(update=>String(update.id)===String(receipt?.id));
  if(!posted||posted.text_body!==String(message).trim())
   throw new Error('Issue update was submitted but readback is unconfirmed');
  return {record,receipt};
 }
 async createSubitem(issueId,name){
  const title=String(name||'').trim();
  if(!title||title.length>500)throw new TypeError('Subtask name must be 1–500 characters');
  const receipt=await this.rpc('create_subitem',{p_issue_id:id(issueId),p_fields:{name:title,status:'Working on it'}});
  const record=await this.get(issueId);
  if(!record.subitems.some(item=>String(item.id)===String(receipt?.id)&&item.name===title))
   throw new Error('Subtask creation could not be verified by signed readback');
  return record;
 }
 async updateSubitem(issueId,subitemId,changes){
  const updates=typeof changes==='string'?{status:changes}:changes;
  if(!updates||typeof updates!=='object'||Array.isArray(updates))throw new TypeError('Invalid subtask changes');
  const validated={};
  if(Object.hasOwn(updates,'name')){
   validated.name=String(updates.name||'').trim();
   if(!validated.name||validated.name.length>500)throw new TypeError('Subtask name must be 1–500 characters');
  }
  if(Object.hasOwn(updates,'status')){
   if(!statuses.includes(updates.status))throw new TypeError('Invalid subtask status');
   validated.status=updates.status;
  }
  if(!Object.keys(validated).length)throw new TypeError('Subtask changes required');
  const receipt=await this.rpc('update_subitem',{p_subitem_id:id(subitemId),p_updates:validated});
  const record=await this.get(issueId);
  if(!record.subitems.some(item=>String(item.id)===String(receipt?.id)&&
      Object.entries(validated).every(([key,value])=>item[key]===value)))
   throw new Error('Subtask update could not be verified by signed readback');
  return record;
 }
 async archiveVerified(issueId){
  const issue=id(issueId);
  const receipt=await this.rpc('archive_issue',{p_issue_id:issue});
  if(receipt?.success!==true||String(receipt.id)!==issue)
   throw new Error('Archive acknowledgement did not match the requested issue');
  // A single list page is insufficient evidence: inspect every page in the
  // signed active issue projection, with bounded cursor cycle detection.
  const seen=new Set();
  let cursor=null,first=null;
  do{
   const page=await this.list(cursor);
   first??=page;
   if(page.items.some(item=>item.id===issue))
    throw new Error('Archived issue remains in the active issue list');
   if(!page.cursor)return first;
   if(seen.has(page.cursor)||seen.size>=1000)
    throw new Error('Archived issue list pagination cannot be verified');
   seen.add(page.cursor);cursor=page.cursor;
  }while(true);
 }
 async nativeV2Capabilities(){
  // A missing migration is not a production feature. Keep UI controls hidden
  // until the signed, workspace-scoped capability RPC is actually deployed.
  try{
   const result=await this.rpc('native_v2_capabilities');
   return {threadedReplies:result?.threadedReplies===true,
    attachmentRemoval:result?.attachmentRemoval===true,
    serverTimer:result?.serverTimer===true};
  }catch{
   return {threadedReplies:false,attachmentRemoval:false,serverTimer:false};
  }
 }
 async replyVerified(issueId,parentId,message){
  const issue=id(issueId),parent=id(parentId);
  const text=String(message||'').trim();
  if(!text||text.length>20000)throw new TypeError('Reply must be 1–20,000 characters');
  const before=await this.get(issue);
  if(!before.updates.some(row=>String(row.id)===parent))
   throw new Error('Parent discussion update unavailable in this issue');
  const receipt=await this.rpc('reply_update',{
   p_issue_id:issue,p_parent_update_id:parent,p_text:text});
  const record=await this.get(issue);
  if(!record.updates.some(row=>String(row.id)===String(receipt?.id)&&
    row.text_body===text&&String(row.replyTo)===parent))
   throw new Error('Threaded reply was not verified by signed readback');
  return record;
 }
 async users(){
  const rows=await this.rpc('users');
  if(!Array.isArray(rows))throw new Error('Native workspace member directory unavailable');
  const seen=new Set();
  return rows.filter(p=>p?.enabled!==false&&isUuid(p?.id)).map(p=>{
   const key=String(p.id).toLowerCase();
   if(seen.has(key))throw new Error('Duplicate workspace user ID');
   seen.add(key);
   return {id:key,name:String(p.name||p.email||'Member').slice(0,160)};
  });
 }
 async saveAssignees(issueId,people,version){
  if(!Array.isArray(people)||people.length>100||
     people.some(p=>!p||typeof p!=='object'||!isUuid(p.id)))
   throw new TypeError('Native assignees must be CRM user identities');
  const directory=await this.users();
  const known=new Map(directory.map(p=>[p.id,p]));
  const normalized=people.map(p=>known.get(String(p.id).toLowerCase()));
  if(normalized.some(p=>!p)||new Set(normalized.map(p=>p.id)).size!==normalized.length)
   throw new TypeError('Assignee is not a current distinct workspace member');
  const receipt=await this.rpc('update_issue',{
   p_issue_id:id(issueId),p_updates:{person:normalized},p_expected_version:version});
  const record=await this.get(issueId);
  if(record.version!==Number(receipt.version)||
   JSON.stringify(record.person)!==JSON.stringify(normalized))
   throw new Error('Assignee change could not be verified by signed readback');
  return record;
 }
 async deleteSubitemVerified(issueId,subitemId){
  const issue=id(issueId),sub=id(subitemId);
  const before=await this.get(issue);
  if(!before.subitems.some(row=>row.id===sub))
   throw new Error('Subtask does not belong to selected issue');
  const receipt=await this.rpc('delete_subitem',{p_subitem_id:sub});
  if(receipt?.success!==true)throw new Error('Subtask deletion acknowledgement missing');
  const after=await this.get(issue);
  if(after.subitems.some(row=>row.id===sub))
   throw new Error('Subtask remains present after delete');
  return after;
 }
 async startTimerVerified(issueId,now=new Date(),{serverTimer=false}={}){
  const issue=id(issueId),current=await this.get(issue);
  if(activeTimer(current))throw new Error('TalkBox timer already running');
  if(serverTimer){
   const receipt=projectTalkBoxIssue(await this.rpc('timer_start',{
    p_issue_id:issue,p_expected_version:current.version}));
   const record=await this.get(issue);
   if(record.version!==receipt.version||!record.timeTracking?.running?.startedAt||
      record.timeTracking.running.startedAt!==receipt.timeTracking?.running?.startedAt||
      record.timeTracking.clockSource!=='postgresql')
    throw new Error('Server timer start could not be verified by signed readback');
   return record;
  }
  const startedAt=new Date(now).toISOString();
  const tracking={...current.timeTracking,running:{startedAt}};
  return this.updateVerified(issue,{timeTracking:tracking},current.version);
 }
 async stopTimerVerified(issueId,now=new Date(),{serverTimer=false}={}){
  const issue=id(issueId),current=await this.get(issue);
  const running=activeTimer(current);
  if(!running)throw new Error('No TalkBox timer is running');
  if(serverTimer&&current.timeTracking.clockSource==='postgresql'){
   const receipt=projectTalkBoxIssue(await this.rpc('timer_stop',{
    p_issue_id:issue,p_expected_version:current.version}));
   const record=await this.get(issue);
   if(record.version!==receipt.version||record.timeTracking?.running||
      record.timeTracking?.totalSeconds!==receipt.timeTracking?.totalSeconds||
      record.timeTracking?.clockSource!=='postgresql')
    throw new Error('Server timer stop could not be verified by signed readback');
   return record;
  }
  if(current.timeTracking.clockSource==='postgresql')
   throw new Error('Server timer capability is required to stop this session');
  const elapsed=Math.floor((new Date(now).getTime()-isoTime(running.startedAt).getTime())/1000);
  if(!Number.isSafeInteger(elapsed)||elapsed<0||elapsed>366*24*3600)
   throw new Error('Invalid elapsed TalkBox session duration');
  const previous=Number.isSafeInteger(current.timeTracking.totalSeconds)?
   current.timeTracking.totalSeconds:
   Math.max(0,Number(current.timeTracking.hours)||0)*3600+
    Math.max(0,Number(current.timeTracking.minutes)||0)*60;
  const totalSeconds=previous+elapsed;
  const tracking={...current.timeTracking,totalSeconds,
   hours:Math.floor(totalSeconds/3600),minutes:Math.floor(totalSeconds%3600/60),
   running:null};
  return this.updateVerified(issue,{timeTracking:tracking},current.version);
 }
}
