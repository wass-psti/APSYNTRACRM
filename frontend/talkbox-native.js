/** Signed TalkBox facade over existing Toolbox Issues RPCs. No monday.com mirroring. */
const statuses=['Working on it','Stuck','Done'];
const isId=x=>/^[1-9][0-9]{0,18}$/.test(String(x||''));
const id=x=>{if(!isId(x))throw new TypeError('Invalid issue ID');return String(x)};
export function projectTalkBoxIssue(x){
 if(!x||!isId(x.id))throw new TypeError('Invalid Toolbox issue payload');
 return {id:String(x.id),name:String(x.name||''),status:String(x.status||'Working on it'),
  date:x.date||null,version:Number(x.version),person:Array.isArray(x.person)?x.person:[],
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
 async list(cursor=null){
  const result=await this.rpc('list_issues',{p_where:null,p_order_by:{column:'updatedAt',direction:'desc'},p_limit:50,p_cursor:cursor});
  if(!Array.isArray(result?.items))throw new Error('Invalid Toolbox issue list');
  return {items:result.items.map(projectTalkBoxIssue),cursor:result.cursor||null,total:Number(result.total)||0};
 }
 async get(issueId){return projectTalkBoxIssue(await this.rpc('get_issue',{p_issue_id:id(issueId)}));}
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
     Object.entries(fields).some(([key,value])=>record[key]!==value))
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
 async updateSubitem(issueId,subitemId,status){
  if(!statuses.includes(status))throw new TypeError('Invalid subtask status');
  const receipt=await this.rpc('update_subitem',{p_subitem_id:id(subitemId),p_updates:{status}});
  const record=await this.get(issueId);
  if(!record.subitems.some(item=>String(item.id)===String(receipt?.id)&&item.status===status))
   throw new Error('Subtask update could not be verified by signed readback');
  return record;
 }
 async saveAssignees(issueId,people,version){
  if(!Array.isArray(people)||people.length>100||
    people.some(p=>!p||typeof p!=='object'||typeof p.id!=='string'||
      !/^[1-9][0-9]{0,19}$/.test(p.id)))
   throw new TypeError('An existing monday-compatible people identity array is required');
  const receipt=await this.rpc('update_issue',{
   p_issue_id:id(issueId),p_updates:{person:people},p_expected_version:version});
  const record=await this.get(issueId);
  if(record.version!==Number(receipt.version)||
   JSON.stringify(record.person)!==JSON.stringify(people))
   throw new Error('Assignee change could not be verified by signed readback');
  return record;
 }

}
