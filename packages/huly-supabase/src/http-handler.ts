/** Mount this Request handler inside the existing same-origin WatchdogWorkspace host.
 * It deliberately does not start a second server, expose CORS, or accept URL tokens.
 */
import { Denied, HulySupabaseGateway, ServiceUnavailable, VersionConflict, validDocumentId, isUuid } from './sb02.js';
import { HulyTransactionGateway, type HulyMutation } from './transactions.js';

const PATH = /^\/api\/v1\/huly\/boards\/([^/]+)\/documents\/([^/]+)$/;
const TX_PATH = /^\/api\/v1\/huly\/boards\/([^/]+)\/transactions$/;
const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const MAX_BODY_BYTES = 262144;

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}
async function jsonBody(request: Request): Promise<Record<string,unknown>> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw new RangeError('Body too large');
  const reader=request.body?.getReader();
  if (!reader) throw new SyntaxError('Missing JSON body');
  const parts:Uint8Array[]=[];let size=0;
  while(true){
    const chunk=await reader.read();if(chunk.done)break;
    size+=chunk.value.byteLength;
    if(size>MAX_BODY_BYTES){await reader.cancel();throw new RangeError('Body too large');}
    parts.push(chunk.value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const value:unknown=JSON.parse(raw);
  if(!value || typeof value!=='object' || Array.isArray(value))throw new SyntaxError('Invalid JSON object');
  const o=value as Record<string,unknown>;
  return o;
}
async function parseBody(request: Request): Promise<{payload:unknown;expectedRevision:number|null}> {
  const o=await jsonBody(request);
  if(!Object.hasOwn(o,'payload') || o.payload===undefined || o.payload===null) throw new SyntaxError('Missing payload');
  if(!Object.hasOwn(o,'expectedRevision')) throw new SyntaxError('Missing expectedRevision');
  if(o.expectedRevision !== null && (!Number.isSafeInteger(o.expectedRevision) || Number(o.expectedRevision)<1)) throw new SyntaxError('Invalid expectedRevision');
  return {payload:o.payload,expectedRevision:o.expectedRevision as number|null};
}

export function createHulyRequestHandler(gateway:HulySupabaseGateway, transactions?:HulyTransactionGateway) {
  return async (request:Request):Promise<Response> => {
    const url=new URL(request.url);
    const match=PATH.exec(url.pathname);
    const txMatch=TX_PATH.exec(url.pathname);
    if(!match && !txMatch)return respond(404,{error:'Not found'});
    if(txMatch ? request.method!=='POST' : (request.method!=='GET' && request.method!=='PUT'))return respond(405,{error:'Method not allowed'});
    const boardId=(match??txMatch)?.[1]??'', documentId=match?.[2]??'', workspaceId=url.searchParams.get('workspace_id')??'';
    if(!isUuid(boardId) || !isUuid(workspaceId) || (match && !validDocumentId(documentId)))return respond(400,{error:'Invalid scope'});
    const auth=request.headers.get('authorization')??'';
    const token=auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if(!token)return respond(401,{error:'Authentication required'});
    try{
      if(txMatch){
        if(!transactions)return respond(503,{error:'Transaction backend unavailable'});
        if(!(request.headers.get('content-type')??'').startsWith('application/json'))return respond(415,{error:'JSON required'});
        const input=await jsonBody(request);
        if(!Array.isArray(input.operations))return respond(400,{error:'Invalid transaction operations'});
        const receipts=await transactions.commit(token,workspaceId,boardId,input.operations as HulyMutation[]);
        return respond(200,{receipts});
      }
      if(request.method==='GET') {
        const document=await gateway.read(token,workspaceId,boardId,documentId);
        return document?respond(200,document):respond(404,{error:'Document not found'});
      }
      if(!(request.headers.get('content-type')??'').startsWith('application/json'))return respond(415,{error:'JSON required'});
      const input=await parseBody(request);
      const document=await gateway.save(token,{id:documentId,boardId,workspaceId,payload:input.payload},input.expectedRevision);
      return respond(input.expectedRevision===null?201:200,document);
    }catch(err){
      if(err instanceof Denied)return respond(403,{error:'Access denied'});
      if(err instanceof VersionConflict)return respond(409,{error:'Document version conflict'});
      if(err instanceof RangeError)return respond(413,{error:'Request too large'});
      if(err instanceof SyntaxError || err instanceof TypeError)return respond(400,{error:'Invalid request body'});
      if(err instanceof ServiceUnavailable)return respond(503,{error:'Backend unavailable'});
      return respond(500,{error:'Internal server error'});
    }
  };
}
