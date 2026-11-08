// Read-only snapshot, NOT a backup service or restoration facility.
// Uses the existing ticket-list endpoint and RLS; no elevated credentials.
export async function collectReadOnlySnapshot({workspaceId,readPage,readCount,generatedAt=new Date().toISOString(),maxRecords=10000}){
 if(!/^[0-9a-f-]{36}$/i.test(workspaceId))throw Error('Invalid workspace.');
 if(typeof readPage!=='function'||typeof readCount!=='function')throw Error('Snapshot data source missing.');
 const before=await readCount(workspaceId);
 if(!Number.isSafeInteger(before)||before<0||before>maxRecords)throw Error('Snapshot size exceeds safe export limit.');
 const records=[],seen=new Set();let offset=0;
 while(offset<before){
  const batch=await readPage(workspaceId,offset,Math.min(100,before-offset));
  if(!Array.isArray(batch)||!batch.length)throw Error('Snapshot pagination incomplete.');
  for(const row of batch){
   if(row.workspace_id!==workspaceId||!row.id||seen.has(row.id))throw Error('Snapshot scope or uniqueness validation failed.');
   records.push(row);seen.add(row.id);
  }
  offset+=batch.length;
  if(records.length>before)throw Error('Snapshot count exceeded initial server count.');
 }
 const after=await readCount(workspaceId);
 if(after!==before||records.length!==before)throw Error('Ticket count changed during export; retry.');
 return {format:'fueltrans-tickets-readonly-v1',workspaceId,generatedAt,recordCount:records.length,records,restoreSupported:false,scopedBy:'authenticated RLS'};
}
export async function snapshotSha256(snapshot,subtle=globalThis.crypto?.subtle){
 if(!subtle)throw Error('Browser SHA-256 unavailable; snapshot not exported.');
 const raw=new TextEncoder().encode(JSON.stringify(snapshot));
 const hash=await subtle.digest('SHA-256',raw);
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
