import {OrderIntakeRegistryClient} from './order-intake-registry-client.js';

// Activate this adapter only with the CP05A migration. Existing deployed read contract is retained.
export class OrderIntakeOperationalClient extends OrderIntakeRegistryClient {
 validateReadRow(row) {
  if(row?.record_kind!=='legacy')return super.validateReadRow(row);
  if(!row.source_key||row.workspace_id!==this.workspaceId||!row.id||
   !Number.isSafeInteger(row.revision)||row.revision<1||![true,false,null].includes(row.archived))throw Error('Invalid operational historical order');
  return row;
 }
 async read(params){
  const rows=await this.request(()=>this.auth.authorized('/rest/v1/order_intake_operational_registry?'+params,{retryableRead:true}));
  if(!Array.isArray(rows))throw Error('Invalid operational registry response');
  rows.forEach(row=>this.validateReadRow(row));return rows;
 }
 async changeLegacy(row,action,status=null){
  const result=await this.request(()=>this.api.rpc('order_intake_legacy_change',{p_id:row.id,p_expected_revision:row.revision,p_action:action,p_status:status}));
  this.validateReadRow(result);
  if(result.id!==row.id||result.record_kind!=='legacy')throw Error('Unexpected lifecycle receipt');
  return result;
 }
 async operationalActivity(row){
  const params=new URLSearchParams({workspace_id:'eq.'+this.workspaceId,order_id:'eq.'+row.id,record_kind:'eq.'+row.record_kind,
   select:'id,workspace_id,order_id,type,message,created_at,delivery_state',order:'created_at.desc,id.desc',limit:'51'});
  const events=await this.request(()=>this.auth.authorized('/rest/v1/order_intake_lifecycle_events?'+params,{retryableRead:true}));
  if(!Array.isArray(events)||events.length>51||events.some(item=>item.workspace_id!==this.workspaceId||item.order_id!==row.id))throw Error('Invalid operational activity');
  const native=row.record_kind==='native'?await super.activity(row.id):{rows:[],hasMore:false};
  const combined=[...native.rows,...events].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  return {rows:combined.slice(0,50),hasMore:native.hasMore||combined.length>50};
 }
 async recipientOptions(row){
  const result=await this.request(()=>this.api.rpc('order_intake_recipient_options',{p_id:row.id,p_kind:row.record_kind}));
  if(!Array.isArray(result?.members)||result.members.some(member=>typeof member.id!=='string'))throw Error('Invalid recipient directory');
  return result;
 }
 async bindRecipient(row,id){
  const result=await this.request(()=>this.api.rpc('order_intake_bind_recipient',{p_id:row.id,p_kind:row.record_kind,p_recipient:id,p_expected_revision:row.revision}));
  if(result?.recipientId!==id||result?.orderId!==row.id)throw Error('Recipient binding not confirmed');
  const verified=await this.recipientOptions(row);
  if(verified.recipientId!==id)throw Error('Recipient binding readback not confirmed');
  return verified;
 }
 async notifications({offset=0}={}){
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid inbox page');
  const params=new URLSearchParams({workspace_id:'eq.'+this.workspaceId,recipient_id:'eq.'+this.auth.userId,
   select:'id,workspace_id,recipient_id,order_id,record_kind,po_number,status,message,created_at,read_at',
   order:'created_at.desc,id.desc',offset:String(offset),limit:'51'});
  const rows=await this.request(()=>this.auth.authorized('/rest/v1/order_intake_notifications?'+params,{retryableRead:true}));
  if(!Array.isArray(rows)||rows.length>51||rows.some(row=>row.workspace_id!==this.workspaceId||row.recipient_id!==this.auth.userId))throw Error('Invalid notification inbox response');
  return {rows:rows.slice(0,50),hasMore:rows.length>50};
 }
 async markNotificationRead(id){
  const result=await this.request(()=>this.api.rpc('order_intake_notification_read',{p_id:id}));
  if(result?.id!==id||!result.readAt)throw Error('Notification acknowledgement not confirmed');
  return result;
 }
}
