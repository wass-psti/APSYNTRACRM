import type { CollaborationCommand } from "./collaboration";
import type { MaterialRecord } from "./materialRepository";
import type { Material, FxReference } from "../utils/material";

export type Revision = { id: string; revision: string };
export type Snapshot = {
  records: MaterialRecord[];
  archived: Revision[];
  reference: FxReference | null;
};
export type BulkCommand = (
  | {action:"create";items:Material[]}
  | {action:"bulkPatch";items:Revision[];patch:Partial<Pick<Material,"source"|"group">>}
  | {action:"archive"|"restore";items:Revision[]}
) & {operationId:string};
export type WriteCommand =
  | BulkCommand
  | CollaborationCommand
  | { action: "create"; items: Material[]; duplicateFrom?: Revision }
  | { action: "update"; items: { material: Material; revision: string }[] }
  | { action: "archive" | "restore"; items: Revision[] };

export class DatabaseError extends Error {
  constructor(message:string, status:number){super(message);this.status=status;}
  status:number;
}
export async function databaseRequest(
  command?: WriteCommand,
): Promise<Snapshot> {
  let response: Response;
  try {
    response = await fetch("/api/materials", {
      method: command ? "POST" : "GET",
      ...(command
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          }
        : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new Error(
      "Database connection unavailable. Refresh before retrying; no demo fallback.",
    );
  }
  const data = await response.json().catch(() => null);
  if (
    !response.ok ||
    !data ||
    !Array.isArray(data.records) ||
    !Array.isArray(data.archived) ||
    !("reference" in data) ||
    data.records.some((r: MaterialRecord) => !r.costs || !r.inputs)
  )
    throw new DatabaseError(
      data?.error ??
        "Database response could not be confirmed. Refresh before retrying.",
      data?.error && response.status>=400 && response.status<500?response.status:503,
    );
  return data;
}
