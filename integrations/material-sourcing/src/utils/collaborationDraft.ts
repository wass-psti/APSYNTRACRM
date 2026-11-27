import { useState } from "react";

// Persist unsent input and operation identities, never a complete material snapshot.
export function useCollaborationDraft<T>(
  key: string,
  initial: () => T,
  enabled: boolean,
) {
  const storageKey = "material-sourcing.v1.collaboration." + key;
  const [value, setValue] = useState<T>(() => {
    if (enabled)
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw) as T;
      } catch {}
    return initial();
  });
  const [error, setError] = useState("");
  function save(next: T) {
    setValue(next);
    if (enabled)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setError("");
      } catch {
        setError("Draft could not be stored in this browser.");
      }
  }
  return [value, save, error] as const;
}
export const emptyTaskDraft = () => ({ text: "", id: crypto.randomUUID() });
export const emptyCommentDraft = () => ({
  text: "",
  id: crypto.randomUUID(),
  parentId: null as string | null,
});
export type CommentEditDraft = {
  id: string;
  text: string;
  expected: string | null;
  operationId: string;
};
