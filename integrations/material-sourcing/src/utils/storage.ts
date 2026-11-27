import { useEffect, useState } from "react";
export function useStored<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial();
    } catch {
      return initial();
    }
  });
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setError("");
    } catch {
      setError(
        "Browser storage is unavailable. Changes may not survive refresh.",
      );
    }
  }, [key, value]);
  return [value, setValue, error] as const;
}
