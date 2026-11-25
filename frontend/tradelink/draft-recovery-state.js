// Local input snapshots are not authoritative documents or permission grants.
import {TRADELINK_MAX_ITEMS} from './limits.js';
export const RECOVERY_SCHEMA=1;
export const RECOVERY_MAX_BYTES=4*1024*1024;
export const RECOVERY_TYPES=Object.freeze(['esi','quotation','packing','delivery','payment','po']);
export const RECOVERY_FIELDS=Object.freeze([
 'documentType','documentNumber','documentStatus','date','dueDate','vendorId','quoteStatus',
 'customerName','customerContact','customerAddress','referenceNumber','customerTin','customerEmail','customerPhone','currency',
 'vatType','discountType','discountValue','exchangeRate','checkedBy','deliveredBy','receivedBy',
 'verifiedBy','approvedBy','verifiedByEmail','approvedByEmail','paymentParticulars','cashAmount',
 'chequeAmount','bankName','chequeNumber','validity','deliveryCommitment','paymentTerms',
 'validityCustom','deliveryCommitmentCustom','paymentTermsCustom',
 'targetDeliveryDate','poNumber','remarks','terms',
 'lineDescription','lineQuantity','lineUnitPrice','lineUnit','lineSerialNumber'
]);
export const RECOVERY_LINE_FIELDS=Object.freeze(['id','kind','description','quantity','unitPrice','unit','serialNumber']);
const RECOVERY_CAPTURE_FIELDS=Object.freeze(RECOVERY_FIELDS.filter(key=>!['lineDescription','lineQuantity','lineUnitPrice','lineUnit','lineSerialNumber'].includes(key)));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function recoveryScope(userId,workspaceId,documentType){
 if(!uuid.test(userId||'')||!uuid.test(workspaceId||'')||!RECOVERY_TYPES.includes(documentType))
  throw new Error('Invalid recovery scope.');
 return [userId.toLowerCase(),workspaceId.toLowerCase(),documentType].join(':');
}
export function captureRecoveryFields(fields){
 const values={};
 for(const key of RECOVERY_CAPTURE_FIELDS){
  const value=fields.get(key);
  if(typeof value==='string')values[key]=value;
 }
 return values;
}
function validFields(value,allowed){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.entries(value).every(([key,text])=>allowed.includes(key)&&typeof text==='string'&&text.length<=5000);
}
function validRecoveryLine(line){
 return line!==null&&typeof line==='object'&&!Array.isArray(line)&&
 Object.entries(line).every(([key,text])=>{
  if(!RECOVERY_LINE_FIELDS.includes(key)||typeof text!=='string')return false;
  const max=key==='id'?120:key==='kind'?4:key==='description'?2000:RECOVERY_MAX_BYTES;
  return text.length<=max;
 });
}
function compactPendingSave(pendingSave,lines){
 if(!pendingSave)return null;
 const copy=JSON.parse(JSON.stringify(pendingSave));
 const draft=copy.command?.draft;
 if(Array.isArray(draft?.items)){
  if(draft.items.length!==lines.length||draft.items.some((item,index)=>item?.id!==lines[index]?.id))
   throw new Error('Pending save items do not match the recovery line snapshot.');
  delete draft.items;
  copy.itemsStoredInLines=true;
 }
 return copy;
}
export function validateRecoverySnapshot(value){
 if(!value||value.schema!==RECOVERY_SCHEMA||!uuid.test(value.instanceId||'')||
 !Number.isSafeInteger(value.updatedAt)||value.updatedAt<=0||
 !Number.isSafeInteger(value.version)||value.version<1||
 !validFields(value.fields,RECOVERY_FIELDS)||value.fields.documentType!==value.documentType||
 !Array.isArray(value.lines)||value.lines.length>TRADELINK_MAX_ITEMS||
 !value.lines.every(line=>validRecoveryLine(line)&&
  typeof line.id==='string'&&line.id.length>0&&line.id.length<=120&&
  ['item','note'].includes(line.kind))||
 new Set(value.lines.map(line=>line.id)).size!==value.lines.length||
 Object.keys(value).some(key=>!['schema','instanceId','userId','workspaceId','documentType','updatedAt','version','fields','lines','scope','key','pendingSave'].includes(key)))
  throw new Error('Invalid recovery snapshot.');
 if(value.pendingSave!==undefined&&value.pendingSave!==null){
  const pending=value.pendingSave,command=pending.command;
  if(!command||!uuid.test(command.documentId||'')||command.expectedRevision!==0||
    command.draft?.documentType!==value.documentType||
    (pending.itemsStoredInLines!==undefined&&pending.itemsStoredInLines!==true)||
    (pending.itemsStoredInLines===true&&Object.hasOwn(command.draft,'items'))||
    !['draft','for-approval'].includes(command.initialState)||
    command.reviseApproved!==false||
    (pending.receipt&&(!uuid.test(pending.receipt.boardItemId||'')||
      pending.receipt.revision!==1||typeof pending.receipt.documentNumber!=='string')))
   throw new Error('Invalid pending creation transaction.');
 }
 const scope=recoveryScope(value.userId,value.workspaceId,value.documentType);
 if(value.scope!==scope||value.key!==scope+':'+value.instanceId.toLowerCase())
  throw new Error('Invalid recovery identity.');
 if(new TextEncoder().encode(JSON.stringify(value)).length>RECOVERY_MAX_BYTES)
  throw new Error('Recovery snapshot exceeds storage limit.');
 return value;
}
export function createRecoverySnapshot({userId,workspaceId,documentType,instanceId,fields,lines,pendingSave,version=1,updatedAt=Date.now()}){
 const scope=recoveryScope(userId,workspaceId,documentType);
 if(!uuid.test(instanceId||''))throw new Error('Invalid creation instance.');
 const copiedLines=lines.map(line=>({...line}));
 const compactedPendingSave=compactPendingSave(pendingSave,copiedLines);
 return validateRecoverySnapshot({schema:RECOVERY_SCHEMA,userId:userId.toLowerCase(),
  workspaceId:workspaceId.toLowerCase(),documentType,instanceId:instanceId.toLowerCase(),
  scope,key:scope+':'+instanceId.toLowerCase(),fields:{...fields},lines:copiedLines,version,updatedAt,
  ...(compactedPendingSave?{pendingSave:compactedPendingSave}:{})});
}
