// Private FuelTrans evidence bucket; object access is subject to Supabase Storage RLS.
import {CONFIG,currentSession} from './supabase-client.js';
import {storageRequestError22} from './storage-policy22.js';
const BUCKET='fueltrans-evidence';
const MIME=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
const MAX_BYTES=10*1024*1024;
export function evidencePrefix(workspaceId,ticketId){
 if(!/^[a-f0-9-]{36}$/i.test(String(workspaceId)))throw Error('Invalid evidence workspace.');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(String(ticketId)))throw Error('Invalid evidence ticket identifier.');
 return `${workspaceId}/${ticketId}/`;
}
function pathEncoded(path){return path.split('/').map(encodeURIComponent).join('/');}
async function call(path,{method='POST',body,raw=false,type='application/json'}={}){
 const s=await currentSession(raw?'edit':'view');if(!s)throw Error('Authentication required.');
 const objectWorkspace=body?.prefix?String(body.prefix).split('/')[0]:decodeURIComponent(path.split('/')[raw?3:4]||'');
 if(objectWorkspace!==s.workspaceId)throw Error('Evidence workspace does not match the active board.');
 const response=await fetch(`${CONFIG.url}/storage/v1${path}`,{method,headers:{apikey:CONFIG.publishableKey,Authorization:`Bearer ${s.access_token}`,'Content-Type':type},...(body===undefined?{}:{body:raw?body:JSON.stringify(body)})});
 let data;try{data=await response.json();}catch{data=null;}
 if(!response.ok)throw storageRequestError22(data,response.status);
 return data;
}
export async function listEvidence(workspaceId,ticketId,offset=0){
 const prefix=evidencePrefix(workspaceId,ticketId);
 if(!Number.isInteger(offset)||offset<0)throw Error('Invalid evidence page.');
 const results=await call(`/object/list/${BUCKET}`,{body:{prefix,limit:50,offset,sortBy:{column:'created_at',order:'desc'}}});
 if(!Array.isArray(results))throw Error('Unexpected evidence listing.');
 return results.filter(x=>typeof x.name==='string'&&!x.name.includes('/'));
}
export async function uploadEvidence(workspaceId,ticketId,file){
 const prefix=evidencePrefix(workspaceId,ticketId);
 if(!file||!Number.isFinite(file.size)||file.size<1||file.size>MAX_BYTES)throw Error('Choose a file between 1 byte and 10 MB.');
 if(!MIME.has(file.type))throw Error('Evidence must be a JPEG, PNG, WebP, PDF, or plain text file.');
 const safe=String(file.name||'evidence').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90)||'evidence';
 const key=prefix+crypto.randomUUID()+'-'+safe;
 const data=await call(`/object/${BUCKET}/${pathEncoded(key)}`,{body:file,raw:true,type:file.type});
 return {key,data};
}
export async function signedEvidenceUrl(workspaceId,ticketId,filename){
 const prefix=evidencePrefix(workspaceId,ticketId);
 if(typeof filename!=='string'||!filename||filename.includes('/')||filename.includes('\\'))throw Error('Invalid evidence filename.');
 const data=await call(`/object/sign/${BUCKET}/${pathEncoded(prefix+filename)}`,{body:{expiresIn:60}});
 if(typeof data?.signedURL!=='string')throw Error('No signed evidence URL returned.');
 const signed=data.signedURL;
 // This API returns a relative /object/sign/ URL. Never forward an external URL.
 const suffix=signed.startsWith('/storage/v1/object/sign/')?signed.slice('/storage/v1'.length):signed;
 if(!suffix.startsWith(`/object/sign/${BUCKET}/`))throw Error('Unexpected signed evidence URL.');
 const url=new URL(`${CONFIG.url}/storage/v1${suffix}`);
 if(url.origin!==new URL(CONFIG.url).origin)throw Error('Evidence URL was not trusted.');
 return url.href;
}
