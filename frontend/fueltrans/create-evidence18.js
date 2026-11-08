// Create Ticket evidence: validated before insert, uploaded only after confirmed ticket creation.
// Never promise an atomic transaction across public tickets and Supabase Storage objects.
export const CREATE_EVIDENCE_MIMES=Object.freeze(['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
export const CREATE_EVIDENCE_MAX_FILES=5;
export const CREATE_EVIDENCE_MAX_FILE_BYTES=10*1024*1024;
export const CREATE_EVIDENCE_TOTAL_BYTES=25*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateCreateEvidence(files){
 const selected=Array.from(files??[]);
 if(selected.length>CREATE_EVIDENCE_MAX_FILES)throw Error('Select no more than five attachments.');
 let bytes=0;const allowed=new Set(CREATE_EVIDENCE_MIMES);
 for(const f of selected){
  if(!f||!Number.isSafeInteger(f.size)||f.size<1||f.size>CREATE_EVIDENCE_MAX_FILE_BYTES)throw Error('Each attachment must be between 1 byte and 10 MB.');
  if(!allowed.has(f.type))throw Error('Attachment type is not allowed (JPEG, PNG, WebP, PDF or text only).');
  if(typeof f.name!=='string'||f.name.length<1||f.name.length>180||/[\/\\\x00-\x1f]/.test(f.name))throw Error('Invalid attachment filename.');
  bytes+=f.size;
  if(bytes>CREATE_EVIDENCE_TOTAL_BYTES)throw Error('Attachments must total 25 MB or less.');
 }
 return Object.freeze([...selected]);
}
export async function uploadCreatedTicketEvidence({workspaceId,ticketId,files,upload}){
 if(!uuid.test(String(workspaceId))||!uuid.test(String(ticketId))||typeof upload!=='function')throw Error('Confirmed ticket and authenticated uploader are required.');
 // Perform complete validation before starting any object writes.
 const selected=validateCreateEvidence(files);
 const results=[];
 for(const file of selected){
  try{
   const result=await upload(workspaceId,ticketId,file);
   if(!result||typeof result.key!=='string'||!result.key.startsWith(`${workspaceId}/${ticketId}/`))throw Error('Evidence upload did not return a trusted object key.');
   results.push({name:file.name,uploaded:true});
  }catch(error){
   // Uncertain server result (e.g. network interruption) is NOT retried automatically.
   results.push({name:file.name,uploaded:false,reason:'Upload not confirmed; inspect Evidence on the ticket before retrying.'});
  }
 }
 return Object.freeze({ticketId,attempted:results.length,uploaded:results.filter(x=>x.uploaded).length,failed:results.filter(x=>!x.uploaded).length,results:Object.freeze(results)});
}
export function creationEvidenceMessage(result){
 if(!result||!Number.isSafeInteger(result.uploaded)||!Number.isSafeInteger(result.failed))throw Error('Invalid evidence summary.');
 if(result.failed)return `Ticket created. ${result.uploaded} evidence upload(s) confirmed; ${result.failed} not confirmed. Review attachments on Ticket Details before retrying. Do not submit another ticket.`;
 return `Ticket created. ${result.uploaded} evidence attachment(s) confirmed.`;
}
