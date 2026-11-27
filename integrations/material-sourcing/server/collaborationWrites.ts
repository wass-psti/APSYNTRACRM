import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { actor, RequestError } from "./materialWrites.ts";
import type { CollaborationCommand } from "../src/api/collaboration.ts";

const schema = "material_sourcing";
const states = ["Working on it", "Done", "Stuck"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value: unknown, label: string, max = 20000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new RequestError("Invalid " + label + ".");
  return value.trim();
}
function status(value: unknown) {
  if (typeof value !== "string" || !states.includes(value))
    throw new RequestError("Invalid task status.");
  return value;
}
function conflict(message: string): never {
  throw new RequestError(message + " Refresh and review before retrying.", 409);
}
function mentionList(value: unknown) {
  if (!Array.isArray(value) || value.length > 100)
    throw new RequestError("Invalid mentions.");
  return [...new Set(value.map((v) => text(v, "mention", 200)))];
}
function ids(value: unknown) {
  if (!Array.isArray(value) || value.length > 5000)
    throw new RequestError("Invalid task order.");
  const list = value.map((v) => text(v, "task identity", 200));
  if (new Set(list).size !== list.length)
    throw new RequestError("Duplicate task identity.");
  return list;
}
function expectedVersion(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new RequestError("Invalid comment revision.");
  return value;
}
function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Same-material operations serialize on the parent row. A READ COMMITTED transaction
// sees the preceding writer's committed child rows after obtaining this lock.
export async function writeCollaboration(
  db: PoolClient,
  input: unknown,
): Promise<string[]> {
  if (!input || typeof input !== "object")
    throw new RequestError("Invalid collaboration command.");
  const command = input as CollaborationCommand;
  const materialId = text(command.materialId, "material identity", 200);
  if (
    typeof command.operationId !== "string" ||
    !uuid.test(command.operationId)
  )
    throw new RequestError("Invalid operation identity.");
  const c = command.change;
  if (!c || typeof c !== "object")
    throw new RequestError("Invalid collaboration change.");
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    command.operationId,
  ]);
  const material = await db.query(
    `select id from ${schema}.materials where id=$1 and archived_at is null for update`,
    [materialId],
  );
  if (!material.rowCount) conflict("Material is unavailable.");
  // An immutable server-generated activity event is also the acknowledgement receipt.
  // The hash distinguishes accidental reuse of an operation ID for another payload.
  const prefix = "collab:" + command.operationId + ":";
  const receipt =
    prefix +
    createHash("sha256")
      .update(JSON.stringify({ materialId, change: c }))
      .digest("hex");
  const prior = await db.query(
    `select id,material_id from ${schema}.activity where id like $1`,
    [prefix + "%"],
  );
  if (prior.rowCount) {
    if (
      prior.rows.length === 1 &&
      prior.rows[0].id === receipt &&
      prior.rows[0].material_id === materialId
    )
      return [materialId];
    conflict("Operation identity was already used.");
  }
  let message: string;
  if (c.kind === "task.add") {
    const id = text(c.id, "task identity", 200),
      title = text(c.title, "task title");
    await db.query(
      `insert into ${schema}.tasks(id,material_id,title,status,position)
      select $1,$2,$3,'Working on it',coalesce(max(position)+1,0) from ${schema}.tasks where material_id=$2`,
      [id, materialId, title],
    );
    message = "Task added: " + title;
  } else if (c.kind === "task.status" || c.kind === "task.remove") {
    const id = text(c.id, "task identity", 200),
      expected = status(c.expected);
    const row = (
      await db.query(
        `select title,status from ${schema}.tasks where id=$1 and material_id=$2`,
        [id, materialId],
      )
    ).rows[0];
    if (!row || row.status !== expected)
      conflict("Task changed or was removed.");
    if (c.kind === "task.status") {
      const next = status(c.status);
      await db.query(
        `update ${schema}.tasks set status=$3 where id=$1 and material_id=$2`,
        [id, materialId, next],
      );
      message =
        "Task status changed: " +
        row.title +
        " (" +
        row.status +
        " → " +
        next +
        ")";
    } else {
      await db.query(
        `delete from ${schema}.tasks where id=$1 and material_id=$2`,
        [id, materialId],
      );
      message = "Task removed: " + row.title;
    }
  } else if (c.kind === "task.reorder") {
    const expected = ids(c.expected),
      order = ids(c.order);
    const current = (
      await db.query(
        `select id from ${schema}.tasks where material_id=$1 order by position,id`,
        [materialId],
      )
    ).rows.map((r) => r.id as string);
    if (
      !same(current, expected) ||
      !same([...current].sort(), [...order].sort())
    )
      conflict("Task order changed.");
    await db.query(
      `update ${schema}.tasks t set position=o.pos-1 from unnest($2::text[]) with ordinality o(id,pos) where t.material_id=$1 and t.id=o.id`,
      [materialId, order],
    );
    message = "Tasks reordered";
  } else if (c.kind === "comment.add") {
    const id = text(c.id, "comment identity", 200),
      body = text(c.text, "comment"),
      mentions = mentionList(c.mentions);
    if (id.startsWith("collab:"))
      throw new RequestError("Invalid comment identity.");
    const parent =
      c.parentId === null
        ? null
        : text(c.parentId, "parent comment identity", 200);
    if (parent) {
      const result = await db.query(
        `select id from ${schema}.activity where id=$1 and material_id=$2 and kind='comment' and not deleted`,
        [parent, materialId],
      );
      if (!result.rowCount) conflict("Parent comment is unavailable.");
    }
    await db.query(
      `insert into ${schema}.activity(id,material_id,kind,body,author_ref,parent_id,mentions)
      values($1,$2,'comment',$3,$4,$5,$6)`,
      [id, materialId, body, actor, parent, mentions],
    );
    message = parent ? "Comment reply posted" : "Comment posted";
  } else if (c.kind === "comment.edit" || c.kind === "comment.remove") {
    const id = text(c.id, "comment identity", 200),
      expected = expectedVersion(c.expected);
    const body =
      c.kind === "comment.edit" ? text(c.text, "comment") : "Comment removed";
    const mentions = c.kind === "comment.edit" ? mentionList(c.mentions) : [];
    const changed = await db.query(
      `update ${schema}.activity set body=$3,mentions=$4,deleted=$5,edited_at=clock_timestamp()
      where id=$1 and material_id=$2 and kind='comment' and not deleted and edited_at is not distinct from $6::timestamptz returning id`,
      [id, materialId, body, mentions, c.kind === "comment.remove", expected],
    );
    if (!changed.rowCount) conflict("Comment changed or was removed.");
    message =
      c.kind === "comment.edit"
        ? "Discussion comment edited"
        : "Discussion comment deleted";
  } else throw new RequestError("Unsupported collaboration operation.");
  await db.query(
    `insert into ${schema}.activity(id,material_id,body,author_ref) values($1,$2,$3,$4)`,
    [receipt, materialId, message, actor],
  );
  return [materialId];
}
