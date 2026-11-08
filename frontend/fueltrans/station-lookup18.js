// Advisory station suggestions from RLS-visible FuelTrans ticket history.
// This is NOT an authoritative station directory or personnel/station validation.
import {clientForMembership,canCreate} from './ticket-domain.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENTS=new Set(['UNIOIL','ARAMCO','REPHIL','PETRON']);
export function buildStationHistoryQuery({workspaceId,member,client,stationId}){
 if(!UUID.test(String(workspaceId))||!canCreate(member)||member.workspace_id!==workspaceId)throw Error('Active authorized FuelTrans workspace required.');
 const own=clientForMembership(member);
 if(!CLIENTS.has(client)||(own&&own!==client))throw Error('Station client is outside your FuelTrans scope.');
 if(typeof stationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,59}$/.test(stationId.trim()))throw Error('Enter 3–60 ordinary station ID characters to search.');
 const q=new URLSearchParams({select:'id,workspace_id,client_code,payload,updated_at',workspace_id:`eq.${workspaceId}`,client_code:`eq.${client}`,'payload->>stationId':`ilike.*${stationId.trim()}*`,order:'updated_at.desc,id.desc',limit:'30'});
 return q.toString();
}
export function projectStationHistory(rows,{workspaceId,client,stationId}){
 if(!Array.isArray(rows)||rows.length>30)throw Error('Invalid station history response.');
 const term=stationId.trim().toLowerCase(),seen=new Set(),result=[];
 for(const row of rows){
  if(row?.workspace_id!==workspaceId||row?.client_code!==client)throw Error('Cross-workspace/client station response denied.');
  const id=row?.payload?.stationId,name=row?.payload?.stationName;
  if(typeof id!=='string'||typeof name!=='string'||id.length<3||id.length>120||name.length<3||name.length>160)continue;
  if(!id.toLowerCase().includes(term))continue;
  if(seen.has(id.toLowerCase()))continue;
  seen.add(id.toLowerCase());result.push(Object.freeze({stationId:id,stationName:name}));
  if(result.length===8)break;
 }
 return Object.freeze(result);
}
