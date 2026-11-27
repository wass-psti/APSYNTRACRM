import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { actor, RequestError, writeMaterials } from "./materialWrites.ts";

const schema="material_sourcing";
type Revision={id:string;revision:string};
type Receipt={ids:string[];archived:Revision[];replayed:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonical(value:unknown):string {
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value!==null&&typeof value==="object"){
    const record=value as Record<string,unknown>;
    return "{"+Object.keys(record).sort().map(k=>JSON.stringify(k)+":"+canonical(record[k])).join(",")+"}";
  }
  return JSON.stringify(value);
}
function revisions(value:unknown):Revision[]{
  if(!Array.isArray(value)||!value.length||value.length>5000)throw new RequestError("Invalid batch size.");
  const seen=new Set<string>();
  for(const row of value){
    if(!row||typeof row.id!=="string"||!row.id||row.id.length>200||typeof row.revision!=="string"||!row.revision||seen.has(row.id))
      throw new RequestError("Invalid or duplicate material identity or revision.");
    seen.add(row.id);
  }
  return value;
}
async function lockBatch(db:PoolClient,items:Revision[],archived:boolean){
  // Lock every record before changing anything; consistent database ordering.
  const locked=await db.query(`select id,updated_at::text as revision,archived_at,group_id,source_type from ${schema}.materials where id=any($1::text[]) order by id collate "C" for update`,[items.map(i=>i.id)]);
  const expected=new Map(items.map(i=>[i.id,i.revision]));
  if(locked.rowCount!==items.length||locked.rows.some(r=>Boolean(r.archived_at)!==archived||r.revision!==expected.get(r.id)))
    throw new RequestError("Bulk selection changed. Refresh and review before retrying.",409);
  return locked.rows;
}
async function archiveBatch(db:PoolClient,input:Record<string,unknown>){
  const items=revisions(input.items);
  const restore=input.action==="restore";
  await lockBatch(db,items,restore);
  const ids=items.map(i=>i.id);
  await db.query(`update ${schema}.materials set archived_at=${restore?"null":"clock_timestamp()"},updated_at=clock_timestamp() where id=any($1::text[])`,[ids]);
  await db.query(`insert into ${schema}.activity(material_id,body,author_ref) select unnest($1::text[]),$2,$3`,[ids,restore?"Material restored":"Material archived",actor]);
  return ids;
}
async function patchMaterials(db:PoolClient,input:Record<string,unknown>){
  const items=revisions(input.items);
  const patch=input.patch as Record<string,unknown>|null;
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!["source","group"].includes(k)))
    throw new RequestError("Invalid bulk patch.");
  if("source" in patch && !(typeof patch.source==="string"&&["Local","Import"].includes(patch.source)))throw new RequestError("Invalid source.");
  if("group" in patch && !(typeof patch.group==="string"&&["Engineering Services","Items for Quotation"].includes(patch.group)))throw new RequestError("Invalid group.");
  const group=patch.group==="Engineering Services"?"new_group":patch.group==="Items for Quotation"?"topics":null;
  const ids=items.map(i=>i.id);
  const locked=await lockBatch(db,items,false);
  await db.query(`update ${schema}.materials set group_id=coalesce($2,group_id),source_type=coalesce($3,source_type),updated_at=clock_timestamp() where id=any($1::text[])`,[ids,group,patch.source??null]);
  const changes=locked.map(r=>({id:r.id,body:"Bulk material updated: "+([
    group&&group!==r.group_id?"group":null,patch.source&&patch.source!==r.source_type?"source type":null
  ].filter(Boolean).join(", ")||"no field changes")}));
  await db.query(`insert into ${schema}.activity(material_id,body,author_ref) select id,body,$2 from jsonb_to_recordset($1::jsonb) as x(id text,body text)`,[JSON.stringify(changes),actor]);
  return ids;
}
export async function writeBulk(db:PoolClient,input:unknown):Promise<Receipt>{
  if(!input||typeof input!=="object")throw new RequestError("Invalid batch.");
  const command=input as Record<string,unknown>;
  if(typeof command.operationId!=="string"||!uuid.test(command.operationId))throw new RequestError("Invalid batch operation identity.");
  const operationId=command.operationId.toLowerCase();
  const {operationId: _operationId,...payload}=command;
  void _operationId;
  const hash=createHash("sha256").update(canonical(payload)).digest("hex");
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["bulk:"+operationId]);
  const prior=(await db.query(`select payload_hash,material_ids,archived from ${schema}.bulk_operation_receipts where operation_id=$1`,[operationId])).rows[0];
  if(prior){
    if(prior.payload_hash!==hash)throw new RequestError("Batch operation identity already used for a different request.",409);
    return {ids:prior.material_ids,archived:prior.archived,replayed:true};
  }
  const ids=command.action==="bulkPatch"?await patchMaterials(db,command):command.action==="archive"||command.action==="restore"?await archiveBatch(db,command):await writeMaterials(db,command);
  const archived=command.action==="archive"?(await db.query(`select id,updated_at::text as revision from ${schema}.materials where id=any($1::text[]) order by id`,[ids])).rows:[];
  await db.query(`insert into ${schema}.bulk_operation_receipts(operation_id,payload_hash,material_ids,archived) values($1,$2,$3,$4::jsonb)`,[operationId,hash,ids,JSON.stringify(archived)]);
  return {ids,archived,replayed:false};
}
