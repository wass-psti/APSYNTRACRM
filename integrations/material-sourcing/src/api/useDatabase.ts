import { useCallback, useEffect, useRef, useState } from "react";
import {
  databaseRequest,
  DatabaseError,
  type Snapshot,
  type WriteCommand,
} from "./localDatabase";

export function useDatabase(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    records: [],
    archived: [],
    reference: null,
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const lastFailure=useRef(0);
  const run = useCallback(
    async (command?: WriteCommand): Promise<Snapshot | null> => {
      if (pending.current) return null;
      pending.current = true;
      lastFailure.current=0;
      setBusy(true);
      setError("");
      try {
        const next = await databaseRequest(command);
        setSnapshot(next);
        setReady(true);
        return next;
      } catch (e) {
        lastFailure.current=e instanceof DatabaseError?e.status:503;
        setError(e instanceof Error ? e.message : "Database operation failed.");
        setReady(false);
        return null;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    if (enabled) void run();
  }, [enabled, run]);
  return { snapshot, ready, busy, error, run, lastFailure };
}
