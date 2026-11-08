// Checkpoint 19: source CreateTicketTab additional station behavior.
// Explicitly non-atomic until a single server-side transaction is certified.
import {captureUncertainReceipt} from './ticket-reconcile21.js';
export const MAX_BATCH_STATIONS = 10;
const stationRE = /^[A-Za-z0-9][A-Za-z0-9 _-]{2,119}$/;
export function validateBatchStations(primary, additions = []) {
  if (!primary || !Array.isArray(additions) || additions.length >= MAX_BATCH_STATIONS) throw Error('A batch contains 1–10 stations.');
  const stations = [primary, ...additions];
  const ids = new Set();
  return stations.map((s, index) => {
    if (!s || typeof s.stationId !== 'string' || typeof s.stationName !== 'string') throw Error(`Station ${index+1} has invalid fields.`);
    const stationId = s.stationId.trim(), stationName = s.stationName.trim();
    if (!stationRE.test(stationId) || stationName.length < 3 || stationName.length > 160 || /[\x00-\x1f\x7f]/.test(stationName)) throw Error(`Station ${index+1} requires a valid ID and name.`);
    const normalized = stationId.toUpperCase();
    if (ids.has(normalized)) throw Error(`Repeated station ID: ${stationId}.`);
    ids.add(normalized);
    return Object.freeze({stationId,stationName});
  });
}
export function stationTicketTitle(title, station) {
  if (typeof title !== 'string' || !station || typeof station.stationName !== 'string') throw Error('Invalid batch ticket title.');
  const result = title.replaceAll('[Station]', station.stationName);
  if (result.trim().length < 5 || result.length > 160) throw Error('Per-station ticket title must be 5–160 characters.');
  return result;
}
// Never retries a submission automatically. A thrown INSERT may have succeeded remotely.
// Confirmation is attached to exactly one station. Failure stops the remaining batch.
export async function runSequentialTicketBatch({stations, prepare, insert, afterInsert=async()=>null, onProgress=()=>{}}) {
  if (!Array.isArray(stations) || stations.length < 1 || stations.length > MAX_BATCH_STATIONS || !stations.every(s=>s?.stationId&&s?.stationName) || typeof prepare !== 'function' || typeof insert !== 'function') throw Error('Invalid ticket batch plan.');
  const confirmed=[], postInsertWarnings=[];
  let failure=null;
  for (let index=0; index<stations.length; index++) {
    let row;
    try { row=await prepare(stations[index],index); }
    catch (error) { failure={index,stage:'prepare',stationId:stations[index].stationId,message:String(error?.message||error)};break; }
    try {
      const saved=await insert(row,index);
      if (!saved || saved.id!==row.id || saved.workspace_id!==row.workspace_id || saved.created_by!==row.created_by) throw Error('Ticket INSERT confirmation did not match the intended station.');
      confirmed.push(Object.freeze({index,stationId:stations[index].stationId,ticketId:saved.id,ticketNumber:saved.ticket_number||row.ticket_number}));
      onProgress(confirmed.at(-1));
      try { const warning=await afterInsert(saved,stations[index],index);if(warning)postInsertWarnings.push({index,stationId:stations[index].stationId,message:String(warning)}); }
      catch(error) { postInsertWarnings.push({index,stationId:stations[index].stationId,message:String(error?.message||error)}); }
    } catch(error) {
      failure={index,stage:'insert_uncertain',stationId:stations[index].stationId,message:String(error?.message||error),receipt:captureUncertainReceipt(row,stations[index])};
      break;
    }
  }
  return Object.freeze({confirmed,postInsertWarnings,failure,remaining:stations.length-confirmed.length-(failure?1:0),planned:stations.length});
}
export function batchOutcomeMessage(result) {
  if (!result || !Array.isArray(result.confirmed) || !Array.isArray(result.postInsertWarnings)) throw Error('Invalid batch result.');
  const count=result.confirmed.length;
  let msg=`${count} of ${result.planned} ticket(s) confirmed.`;
  if(result.failure)msg+=` Stopped at station ${result.failure.stationId} (${result.failure.stage==='insert_uncertain'?'INSERT result uncertain; do not retry without inspecting Ticket Queue':'preparation failed'}): ${result.failure.message}.`;
  if(result.postInsertWarnings.length)msg+=` ${result.postInsertWarnings.length} attachment or post-creation warning(s). Inspect each confirmed Ticket Details page for uploads.`;
  if(result.remaining>0)msg+=` ${result.remaining} later station(s) were not submitted.`;
  return msg;
}
