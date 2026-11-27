import { useEffect, useRef, useState } from "react";
import type { Material } from "../utils/material";
type Command = { label: string; action: () => void };
function match(text: string, query: string) {
  const haystack = text.toLowerCase(),
    needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (needle.split(/\s+/).every((term) => haystack.includes(term))) return true;
  let next = 0;
  for (const letter of haystack) {
    if (letter === needle[next]) next++;
    if (next === needle.length) return true;
  }
  return false;
}
export default function CommandPalette({
  items,
  commands,
  onOpen,
  onClose,
}: {
  items: Material[];
  commands: Command[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);
  const results = [
    ...commands.filter((c) => match(c.label, query)),
    ...items
      .filter((i) =>
        match([i.name, i.description, i.brand, i.vendor].join(" "), query),
      )
      .slice(0, 8)
      .map((i) => ({
        label: i.name + " · " + i.brand,
        action: () => onOpen(i.id),
      })),
  ];
  function run(i: number) {
    if (!results[i]) return;
    results[i].action();
    onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="palette surface">
        <div className="inline-form">
          <input
            ref={input}
            aria-label="Search commands or materials"
            placeholder="Search materials or commands…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) =>
                  Math.min(results.length - 1, Math.max(0, i + 1)),
                );
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                run(index);
              }
            }}
          />
          <button aria-label="Close command palette" onClick={onClose}>
            ✕
          </button>
        </div>
        <small>↑ / ↓ Navigate · Enter Open · Esc Close</small>
        {results.map((r, i) => (
          <button
            key={i + ":" + r.label}
            className={i === index ? "pressed" : ""}
            onMouseEnter={() => setIndex(i)}
            onClick={() => run(i)}
          >
            {r.label}
          </button>
        ))}
        {!results.length && (
          <p className="empty">No matching materials or commands.</p>
        )}
      </div>
    </dialog>
  );
}
