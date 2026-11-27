import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Pool, type PoolClient } from "pg";
import { createMaterialRepository } from "./materialRepository.ts";
import { actor, RequestError, writeMaterials } from "./materialWrites.ts";
import { writeBulk } from "./bulkWrites.ts";
import { writeCollaboration } from "./collaborationWrites.ts";
import type { MaterialRecord } from "../src/api/materialRepository.ts";

// Local-only development transport. No hosted endpoints or credentials in client code.
const database = process.env.MS_LOCAL_DATABASE ?? "postgres";
if (database !== "postgres" && !/^ms_cp02_test_[0-9]+$/.test(database))
  throw new Error("Expected dedicated local database.");
const port = Number(process.env.MS_API_PORT ?? 5181);
const pool = new Pool({
  host: "127.0.0.1",
  port: 55322,
  user: "postgres",
  password: process.env.MS_LOCAL_DB_PASSWORD ?? "postgres",
  database,
  connectionTimeoutMillis: 3000,
  statement_timeout: 15000,
});
pool.on("error", () => console.error("Local database connection interrupted."));
const origins = new Set([
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
]);
function respond(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new RequestError("Expected JSON.", 415);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 32 * 1024 * 1024)
      throw new RequestError("Request too large.", 413);
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Invalid JSON.");
  }
}
async function snapshot(db: PoolClient) {
  const repository = createMaterialRepository(db);
  const records: MaterialRecord[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await repository.list({
      actorRef: actor,
      offset,
      limit: 1000,
    });
    records.push(...page.records);
    offset = page.nextOffset;
  }
  return records;
}
const server = createServer(async (req, res) => {
  let db: PoolClient | undefined;
  let committed=false;
  try {
    if (req.headers.origin && !origins.has(req.headers.origin))
      throw new RequestError("Unexpected local origin.", 403);
    if (
      !["127.0.0.1:" + port, "localhost:" + port].includes(
        req.headers.host ?? "",
      )
    )
      throw new RequestError("Unexpected host.", 403);
    if (req.url !== "/api/materials") throw new RequestError("Not found.", 404);
    if (req.method !== "GET" && req.method !== "POST")
      throw new RequestError("Method not allowed.", 405);
    const command = req.method === "POST" ? await readBody(req) : null;
    if(req.method==="POST"&&(!command||typeof command!=="object"||Array.isArray(command)))throw new RequestError("Invalid command.");
    const collaboration = command?.action === "collaborate";
    const bulk = !collaboration && command?.operationId !== undefined;
    db = await pool.connect();
    await db.query(
      req.method === "GET"
        ? "begin isolation level repeatable read read only"
        : collaboration || bulk
          ? "begin isolation level read committed"
          : "begin isolation level repeatable read",
    );
    const receipt=bulk?await writeBulk(db,command):null;
    const ids = receipt?receipt.ids:
      command === null
        ? []
        : collaboration || bulk
          ? await writeCollaboration(db, command)
          : await writeMaterials(db, command);
    const archived = receipt ? receipt.archived : ids.length ? (await db.query("select id,updated_at::text as revision from material_sourcing.materials where id=any($1::text[]) and archived_at is not null",[ids])).rows : [];
    if(command!==null){await db.query("commit");committed=true;await db.query("begin isolation level repeatable read read only");}
    const records = await snapshot(db);
    const reference =
      (
        await db.query(
          'select id,usd::text,eur::text,observed_at as "observedAt",provider,is_demo as "isDemo" from material_sourcing.fx_snapshots order by observed_at desc,id limit 1',
        )
      ).rows[0] ?? null;
    await db.query("commit");
    respond(res, 200, { records, archived, reference, ...(receipt?{replayed:receipt.replayed}: {}) });
  } catch (error) {
    if (db) await db.query("rollback").catch(() => {});
    const e = error as { code?: string; message?: string };
    const status =
      committed ? 503 : error instanceof RequestError
        ? error.status
        : e.code === "23505" || e.code === "40001" || e.code === "40P01"
          ? 409
          : e.code?.startsWith("22") || e.code === "23514" || e.code === "23503"
            ? 400
            : 503;
    const message =
      error instanceof RequestError
        ? error.message
        : status === 409
          ? "Record conflict. Refresh before retrying."
          : status === 400
            ? "Database rejected invalid material data."
            : "Database unavailable or operation could not be confirmed. Refresh before retrying.";
    if (status === 503) console.error("Local API error:", e.code ?? e.message);
    respond(res, status, { error: message });
  } finally {
    db?.release();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log("Material Sourcing local API ready on 127.0.0.1:" + port),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    }),
  );
