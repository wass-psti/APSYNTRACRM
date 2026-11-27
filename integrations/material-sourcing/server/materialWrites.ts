import type { PoolClient } from "pg";
import Decimal from "decimal.js";
import {
  currencies,
  decimalInput,
  type DecimalField,
  groups,
  validate,
  type Material,
} from "../src/utils/material.ts";
import { randomUUID } from "node:crypto";

export class RequestError extends Error {
  constructor(message: string, publicStatus: number = 400) {
    super(message);
    this.status = publicStatus;
  }
  status: number;
}
const schema = "material_sourcing";
export const actor = "local-development";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const textFields = [
  "id",
  "name",
  "description",
  "brand",
  "vendor",
  "rfq",
  "account",
  "supplierPo",
  "requestor",
  "created",
  "requiredDate",
] as const;

function checkMaterial(value: unknown, create: boolean): Material {
  if (!value || typeof value !== "object")
    throw new RequestError("Invalid material.");
  const item = value as Material;
  for (const key of textFields) {
    if (typeof item[key] !== "string" || item[key].length > 20000)
      throw new RequestError("Invalid field: " + key);
  }
  if (
    !item.id ||
    item.id.length > 200 ||
    !groups.includes(item.group) ||
    !["Local", "Import", "Unknown"].includes(item.source) ||
    !currencies.includes(item.currency) ||
    !currencies.includes(item.shipCurrency) ||
    !datePattern.test(item.created) ||
    (item.requiredDate !== "" && !datePattern.test(item.requiredDate))
  )
    throw new RequestError(
      "Invalid material identity, group, currency or date.",
    );
  for (const key of [
    "quantity",
    "buyingPrice",
    "shipping",
    "usd",
    "eur",
  ] as const) {
    if (typeof item[key] !== "number" || !Number.isFinite(item[key]))
      throw new RequestError("Invalid number: " + key);
  }
  if (
    item.usd <= 0 ||
    item.eur <= 0 ||
    item.quantity <= 0 ||
    item.buyingPrice < 0 ||
    item.shipping < 0 ||
    (item.leadWeeks !== null &&
      (typeof item.leadWeeks !== "number" || !Number.isFinite(item.leadWeeks)))
  )
    throw new RequestError("Invalid quantity, cost or rate.");
  // Validate the exact input string before writing; JS number projections are only for UI compatibility.
  for (const key of [
    "quantity",
    "buyingPrice",
    "shipping",
    "leadWeeks",
  ] as const) {
    const raw = item.decimalInputs?.[key];
    if (
      raw !== undefined &&
      (typeof raw !== "string" ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ||
        raw.length > 80)
    )
      throw new RequestError("Invalid decimal input: " + key);
    const value = decimalInput(item, key);
    if (value === null) continue;
    const d = new Decimal(value);
    if (
      !d.isFinite() ||
      d.decimalPlaces() > 6 ||
      d.abs().gte(key === "leadWeeks" ? "10000000000" : "100000000000000")
    )
      throw new RequestError(
        "Field " +
          key +
          " exceeds database numeric precision (six decimal places).",
      );
    if (key === "quantity" ? d.lte(0) : key !== "leadWeeks" && d.lt(0))
      throw new RequestError("Invalid numeric input: " + key);
  }
  if (
    typeof item.starred !== "boolean" ||
    !Array.isArray(item.tasks) ||
    !Array.isArray(item.activity)
  )
    throw new RequestError("Invalid related material data.");
  if (create) {
    const error = validate(item);
    if (error) throw new RequestError(error);
  }
  if (!item.name.trim()) throw new RequestError("Part number is required.");
  for (const t of item.tasks) {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      !["Working on it", "Done", "Stuck"].includes(t.status)
    )
      throw new RequestError("Invalid task.");
  }
  for (const a of item.activity) {
    if (
      !a ||
      typeof a.id !== "string" ||
      !a.id ||
      typeof a.text !== "string" ||
      typeof a.at !== "string" ||
      (a.kind !== undefined && a.kind !== "comment") ||
      (a.parentId !== undefined && typeof a.parentId !== "string") ||
      (a.mentions !== undefined &&
        (!Array.isArray(a.mentions) ||
          a.mentions.some((m) => typeof m !== "string")))
    )
      throw new RequestError("Invalid activity.");
  }
  return item;
}

function groupId(item: Material) {
  return item.group === groups[0] ? "new_group" : "topics";
}
async function event(db: PoolClient, id: string, body: string) {
  await db.query(
    `insert into ${schema}.activity(id,material_id,body,author_ref) values($1,$2,$3,$4)`,
    [randomUUID(), id, body, actor],
  );
}
async function lock(
  db: PoolClient,
  id: string,
  revision: string,
  archived: boolean,
) {
  const result = await db.query(
    `select updated_at::text as revision,archived_at,fx_snapshot_id,created_date::text,${fieldTexts} from ${schema}.materials where id=$1 for update`,
    [id],
  );
  const row = result.rows[0];
  if (!row || Boolean(row.archived_at) !== archived)
    throw new RequestError(
      "Material is no longer in the expected state. Refresh before retrying.",
      409,
    );
  if (row.revision !== revision)
    throw new RequestError(
      "Material changed since it was loaded. Refresh before retrying.",
      409,
    );
  return row;
}
async function syncStar(db: PoolClient, item: Material) {
  if (item.starred)
    await db.query(
      `insert into ${schema}.starred_materials(actor_ref,material_id) values($1,$2) on conflict do nothing`,
      [actor, item.id],
    );
  else
    await db.query(
      `delete from ${schema}.starred_materials where actor_ref=$1 and material_id=$2`,
      [actor, item.id],
    );
}
const fields =
  "group_id,part_number,source_type,description,brand,quantity,buying_price,currency,shipping_cost,shipping_currency,lead_weeks,required_date,vendor,rfq_ref,account_ref,supplier_po_ref";
const fieldTexts = fields
  .split(",")
  .map((f) => f + "::text as " + f)
  .join(",");
const fieldLabels: Record<string, string> = {
  group_id: "group",
  part_number: "part number",
  source_type: "source type",
  description: "description",
  brand: "brand",
  quantity: "quantity",
  buying_price: "buying price",
  currency: "buying currency",
  shipping_cost: "shipping cost",
  shipping_currency: "shipping currency",
  lead_weeks: "lead time",
  required_date: "date required",
  vendor: "vendor",
  rfq_ref: "RFQ reference",
  account_ref: "account",
  supplier_po_ref: "supplier PO",
};
function values(i: Material, current?: Record<string, unknown>) {
  const exact = (key: DecimalField, dbKey: string) => {
    const v = decimalInput(i, key);
    // Legacy callers that do not supply exact input metadata must not alter an unchanged value.
    if (
      typeof v === "number" &&
      current &&
      current[dbKey] !== null &&
      Number(current[dbKey]) === v
    )
      return current[dbKey];
    return v;
  };
  return [
    groupId(i),
    i.name.trim(),
    i.source,
    i.description,
    i.brand,
    exact("quantity", "quantity"),
    exact("buyingPrice", "buying_price"),
    i.currency,
    exact("shipping", "shipping_cost"),
    i.shipCurrency,
    exact("leadWeeks", "lead_weeks"),
    i.requiredDate || null,
    i.vendor,
    i.rfq,
    i.account,
    i.supplierPo,
  ];
}
export type WriteCommand =
  | {
      action: "create";
      items: Material[];
      duplicateFrom?: { id: string; revision: string };
    }
  | { action: "update"; items: { material: Material; revision: string }[] }
  | {
      action: "archive" | "restore";
      items: { id: string; revision: string }[];
    };
export async function writeMaterials(db: PoolClient, input: unknown) {
  if (!input || typeof input !== "object")
    throw new RequestError("Invalid command.");
  const command = input as WriteCommand;
  if (
    !["create", "update", "archive", "restore"].includes(command.action) ||
    !Array.isArray(command.items) ||
    !command.items.length ||
    command.items.length > 5000
  )
    throw new RequestError("Invalid operation or batch size.");
  for (const entry of command.items) {
    if (!entry || typeof entry !== "object")
      throw new RequestError("Invalid batch entry.");
    if (command.action === "update") {
      if (
        !("material" in entry) ||
        !entry.material ||
        typeof entry.material !== "object" ||
        typeof entry.material.id !== "string" ||
        typeof entry.revision !== "string"
      )
        throw new RequestError("Invalid update or revision.");
    } else if (!("id" in entry) || typeof entry.id !== "string") {
      throw new RequestError("Invalid material identity.");
    }
  }
  if(command.action==="create"&&!command.duplicateFrom){
    const items=command.items.map((item,index)=>{
      try{return checkMaterial(item,true);}catch(e){if(e instanceof RequestError)throw new RequestError("Row "+(index+1)+": "+e.message,e.status);throw e;}
    });
    const ids=items.map(i=>i.id);
    if(new Set(ids).size!==ids.length)throw new RequestError("Duplicate material identity.");
    const fx=(await db.query(`select id from ${schema}.fx_snapshots order by observed_at desc,id limit 1`)).rows[0];
    if(!fx)throw new RequestError("No exchange rate snapshot is available.",409);
    if(items.some(i=>i.expectedFxId&&i.expectedFxId!==fx.id))throw new RequestError("Reference exchange rates changed. Refresh and review before saving.",409);
    const fieldNames=fields.split(",");
    const numericFields=new Set(["quantity","buying_price","shipping_cost","lead_weeks"]);
    const definitions=fieldNames.map(f=>f+" "+(numericFields.has(f)?"numeric":f==="required_date"?"date":"text")).join(",");
    const rows=items.map(i=>({id:i.id,created_date:i.created,...Object.fromEntries(fieldNames.map((f,index)=>[f,values(i)[index]]))}));
    // Chunk only the SQL statements, not the transaction. Exact decimals remain strings.
    rows.sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
    for(let start=0;start<rows.length;start+=500){
      await db.query(`insert into ${schema}.materials(id,${fields},fx_snapshot_id,requestor,created_date)
        select id,${fields},$2,$3,created_date from jsonb_to_recordset($1::jsonb) as x(id text,${definitions},created_date date)`,
        [JSON.stringify(rows.slice(start,start+500)),fx.id,"Demo user"]);
    }
    await db.query(`insert into ${schema}.activity(material_id,body,author_ref) select unnest($1::text[]),'Material created',$2`,[ids,actor]);
    return ids;
  }
  const touched: string[] = [];
  // Lock batches in a consistent order, and reject duplicated identities.
  const entries = [...command.items].sort((a, b) =>
    Buffer.compare(Buffer.from("material" in a ? a.material.id : a.id),Buffer.from("material" in b ? b.material.id : b.id)),
  );
  for (const entry of entries) {
    const id = "material" in entry ? entry.material.id : entry.id;
    if (typeof id !== "string" || !id || touched.includes(id))
      throw new RequestError("Invalid or duplicate material identity.");
    touched.push(id);
    if (command.action === "create") {
      const item = checkMaterial(entry, !command.duplicateFrom);
      if (command.duplicateFrom) {
        if (
          command.items.length !== 1 ||
          typeof command.duplicateFrom.id !== "string" ||
          typeof command.duplicateFrom.revision !== "string"
        )
          throw new RequestError("Invalid duplicate source.");
        await lock(
          db,
          command.duplicateFrom.id,
          command.duplicateFrom.revision,
          false,
        );
        // Copy the committed source fields and FX stamp, not a mutable client snapshot.
        await db.query(
          `insert into ${schema}.materials(id,${fields},fx_snapshot_id,requestor,created_date)
          select $1,${fields},fx_snapshot_id,requestor,$2::date from ${schema}.materials where id=$3`,
          [id, item.created, command.duplicateFrom.id],
        );
      } else {
        // Stamp server-selected current reference rates, not client-supplied arbitrary rates.
        const fx = await db.query(
          `select id from ${schema}.fx_snapshots order by observed_at desc,id limit 1`,
        );
        if (!fx.rows[0])
          throw new RequestError(
            "No exchange rate snapshot is available.",
            409,
          );
        if (item.expectedFxId && item.expectedFxId !== fx.rows[0].id)
          throw new RequestError(
            "Reference exchange rates changed. Refresh and review the preview before saving.",
            409,
          );
        await db.query(
          `insert into ${schema}.materials(id,${fields},fx_snapshot_id,requestor,created_date)
          values($1,${values(item)
            .map((_, i) => "$" + (i + 2))
            .join(",")},$18,$19,$20)`,
          [item.id, ...values(item), fx.rows[0].id, "Demo user", item.created],
        );
      }
      await event(
        db,
        id,
        command.duplicateFrom ? "Material duplicated" : "Material created",
      );
    } else if (command.action === "update") {
      if (!("material" in entry) || typeof entry.revision !== "string")
        throw new RequestError("Revision is required.");
      const item = checkMaterial(entry.material, false);
      const current = await lock(db, id, entry.revision, false);
      // Existing FX stamps and source identity are not replaced by ordinary edits.
      if (
        item.source === "Unknown" ||
        (item.leadWeeks !== null && item.leadWeeks < 0)
      ) {
        const prior = await db.query(
          `select source_type,lead_weeks from ${schema}.materials where id=$1`,
          [id],
        );
        if (
          item.source === "Unknown" &&
          prior.rows[0].source_type !== "Unknown"
        )
          throw new RequestError("Select Local or Import.");
        if (
          item.leadWeeks !== null &&
          item.leadWeeks < 0 &&
          Number(prior.rows[0].lead_weeks) !== item.leadWeeks
        )
          throw new RequestError("Lead time must be nonnegative.");
      }

      const updated = await db.query(
        `update ${schema}.materials set ${fields
          .split(",")
          .map((f, i) => f + "=$" + (i + 2))
          .join(
            ",",
          )},updated_at=clock_timestamp() where id=$1 returning ${fieldTexts}`,
        [id, ...values(item, current)],
      );
      const oldStar = (
        await db.query(
          `select exists(select 1 from ${schema}.starred_materials where material_id=$1 and actor_ref=$2) as starred`,
          [id, actor],
        )
      ).rows[0].starred;
      await syncStar(db, item);
      const changed = fields
        .split(",")
        .filter((f) => current[f] !== updated.rows[0][f])
        .map((f) => fieldLabels[f]);
      if (oldStar !== item.starred)
        changed.push(item.starred ? "starred" : "unstarred");
      await event(
        db,
        id,
        changed.length
          ? "Material updated: " + changed.join(", ")
          : "Material updated",
      );
    } else {
      if (!("revision" in entry) || typeof entry.revision !== "string")
        throw new RequestError("Revision is required.");
      await lock(db, id, entry.revision, command.action === "restore");
      await db.query(
        `update ${schema}.materials set archived_at=${command.action === "archive" ? "clock_timestamp()" : "null"},updated_at=clock_timestamp() where id=$1`,
        [id],
      );
      await event(
        db,
        id,
        command.action === "archive"
          ? "Material archived"
          : "Material restored",
      );
    }
  }
  return touched;
}
