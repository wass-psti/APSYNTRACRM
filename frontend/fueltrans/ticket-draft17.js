// Checkpoint 17: source CreateTicketTab saved drafts, with strict workspace/user state isolation.
// No localStorage or browser global draft: state is stored in per-user Supabase RLS rows.
// Intentionally a single draft per user per FuelTrans workspace, not an atomic batch form.
export const TICKET_DRAFT_STATE_KEY='standalone_ticket_draft_v1';
export const TICKET_DRAFT_FIELDS=Object.freeze({
 client:20,stationId:120,stationName:160,systemType:120,priority:40,
 impactLevel:100,downtimeMinutes:30,affectedTerminals:30,title:160,
 description:10000,errorCode:50,escalationJustification:500,
 affectedTransactions:30,reportingChannel:100,contactName:120,contactPhone:50,
 handoverFlag:8
});
const VALID_UUID=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function ticketDraftIdentity(workspaceId,userId){
 if(!VALID_UUID.test(String(workspaceId))||!VALID_UUID.test(String(userId)))throw Error('Invalid private ticket draft identity.');
 return {workspaceId,userId};
}
export function sanitizeTicketDraft(form){
 if(!form||typeof form!=='object'||Array.isArray(form))throw Error('Invalid ticket draft form.');
 const clean={};
 for(const [key,max] of Object.entries(TICKET_DRAFT_FIELDS)){
  const source=form[key];
  if(key==='handoverFlag'){clean[key]=source===true||source==='on'||source==='true';continue;}
  const value=source==null?'':source;
  if(typeof value!=='string'||value.length>max)throw Error(`Draft ${key} exceeds source field limits.`);
  clean[key]=value;
 }
 return clean;
}
export function isMeaningfulTicketDraft(form){
 const v=sanitizeTicketDraft(form);
 return v.title.trim().length>0||v.stationId.trim().length>0||v.description.trim().length>10;
}
export function makeTicketDraft(form,now,batchStations=[]){
 if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))throw Error('Invalid ticket draft time.');
 if(!Array.isArray(batchStations)||batchStations.length>9)throw Error('Too many draft batch stations.');
 const additional=batchStations.map(s=>{if(typeof s?.stationId!=='string'||typeof s?.stationName!=='string'||s.stationId.length>120||s.stationName.length>160)throw Error('Invalid batch station draft.');return {stationId:s.stationId,stationName:s.stationName};});
 return {schemaVersion:1,form:sanitizeTicketDraft(form),savedAt:now,...(additional.length?{batchStations:additional}:{})};
}
export function normalizeTicketDraftState(record){
 if(record==null)return {revision:0,draft:null};
 if(!Number.isSafeInteger(record.revision)||record.revision<1)throw Error('Invalid ticket draft revision.');
 const item=record.value?.draft;
 if(item==null)return {revision:record.revision,draft:null};
 if(item.schemaVersion!==1||typeof item.savedAt!=='string'||!Number.isFinite(Date.parse(item.savedAt)))throw Error('Unsupported ticket draft version.');
 return {revision:record.revision,draft:makeTicketDraft(item.form,item.savedAt,item.batchStations||[])};
}
export const DUPLICATE_STATUSES=Object.freeze(['Open','Under L1 Review','Escalated to L2']);
export function buildTicketDuplicateQuery({workspaceId,client,stationId,systemType,limit=5}){
 if(!VALID_UUID.test(String(workspaceId)))throw Error('Invalid duplicate query workspace.');
 if(!['UNIOIL','ARAMCO','REPHIL','PETRON'].includes(client))throw Error('Invalid duplicate query client.');
 if(typeof stationId!=='string'||stationId.length>120||! /^[A-Za-z0-9][A-Za-z0-9 _-]{2,119}$/.test(stationId.trim()))throw Error('Invalid duplicate query station.');
 if(!['POS','Wet Stock','Both'].includes(systemType))throw Error('Invalid duplicate query system.');
 if(!Number.isInteger(limit)||limit<1||limit>5)throw Error('Invalid duplicate query limit.');
 const q=new URLSearchParams({select:'workspace_id,id,ticket_number,client_code,status,archived,payload',workspace_id:`eq.${workspaceId}`,client_code:`eq.${client}`,archived:'eq.false',status:`in.(${DUPLICATE_STATUSES.map(s=>`"${s}"`).join(',')})`, 'payload->>stationId':`eq.${stationId.trim()}`, 'payload->>systemType':`eq.${systemType}`,order:'created_at.desc,id.desc',limit:String(limit)});
 return q.toString();
}
export function projectTicketDuplicates(rows,{workspaceId,client,stationId,systemType}){
 if(!Array.isArray(rows))throw Error('Invalid ticket duplicate response.');
 return rows.filter(x=>x?.workspace_id===workspaceId&&x?.client_code===client&&x?.archived!==true&&DUPLICATE_STATUSES.includes(x.status)&&x?.payload?.stationId===stationId.trim()&&x?.payload?.systemType===systemType).slice(0,5);
}
