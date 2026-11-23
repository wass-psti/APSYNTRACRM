import {buildTicketQuery,CLIENTS,clientForMembership,permitted} from './ticket-domain.js';

// Read-only views of ticket history. This is not an authoritative station registry.
export const STATION_HISTORY_PAGE_SIZE=50;
const STATION_ID_SEARCH=/^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$/;

export function buildRecordedStationsQuery({workspaceId,member,client='all',stationId='',page=0}={}){
 if(!permitted(member)||member.workspace_id!==workspaceId)throw Error('Active FuelTrans workspace required.');
 if(client!=='all'&&!CLIENTS.includes(client))throw Error('Unknown station client.');
 const assignedClient=clientForMembership(member);
 if(assignedClient&&client!=='all'&&client!==assignedClient)throw Error('Client is outside this membership.');
 const search=String(stationId||'').trim();
 if(search&&!STATION_ID_SEARCH.test(search))throw Error('Station ID search must contain 1–60 letters, numbers, spaces, hyphens or underscores.');
 if(!Number.isSafeInteger(page)||page<0||page>10000)throw Error('Invalid ticket page.');
 const query=new URLSearchParams(buildTicketQuery({workspaceId,page,limit:STATION_HISTORY_PAGE_SIZE}));
 // Project only station fields, never the rest of the ticket payload (e.g. support credentials).
 query.set('select','id,workspace_id,client_code,ticket_number,status,updated_at,station_id:payload->>stationId,station_name:payload->>stationName');
 // Fetch one extra row to determine whether another page exists. No expensive exact COUNT.
 query.set('limit',String(STATION_HISTORY_PAGE_SIZE+1));
 query.set('payload->>stationId',search?'ilike.*'+search+'*':'not.is.null');
 if(assignedClient||client!=='all')query.set('client_code','eq.'+(assignedClient||client));
 return query.toString();
}

export function projectRecordedStations(rows,{workspaceId,member}={}){
 if(!permitted(member)||member.workspace_id!==workspaceId)throw Error('Active FuelTrans workspace required.');
 if(!Array.isArray(rows)||rows.length>STATION_HISTORY_PAGE_SIZE)throw Error('Invalid station ticket page.');
 const assignedClient=clientForMembership(member);
 const stations=new Map();
 for(const row of rows){
  if(row?.workspace_id!==workspaceId)throw Error('Station response escaped the workspace.');
  if(!CLIENTS.includes(row.client_code)||assignedClient&&assignedClient!==row.client_code)throw Error('Station response escaped the client.');
  const id=typeof row.station_id==='string'?row.station_id.trim():'';
  const name=typeof row.station_name==='string'?row.station_name.trim():'';
  if(id.length<3||id.length>120||name.length<3||name.length>160)continue;
  const key=row.client_code+'\u0000'+id.toUpperCase();
  if(!stations.has(key)){
   stations.set(key,{
    client:row.client_code,stationId:id,stationName:name,
    latestTicketId:String(row.id||''),latestTicketNumber:String(row.ticket_number||row.id||'—'),
    lastTicketUpdated:row.updated_at||null,latestTicketStatus:String(row.status||'Unknown'),
    pageTickets:0
   });
  }
  stations.get(key).pageTickets+=1;
 }
 // Query orders recent tickets first; first occurrence is the latest *on this page*.
 return [...stations.values()];
}
