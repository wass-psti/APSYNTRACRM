import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  currencies,
  groups,
  log,
  validate,
  withDecimalInput,
  type Material,
} from "../utils/material";
import {
  cell,
  columns,
  defaultWidths,
  display,
  type Column,
  type ColumnWidths,
  type SortRule,
} from "../utils/columns";
export { columns, cell, display, type Column } from "../utils/columns";

const ROW = 56;
const GROUP = 40;
const HEADER = 46;
const OVERSCAN = 8;
type Entry =
  | {
      kind: "group";
      group: Material["group"];
      count: number;
      top: number;
      height: number;
    }
  | { kind: "item"; item: Material; top: number; height: number };
type Props = {
  groupOrder: Material["group"][];
  onReorderGroups: () => void;
  items: Material[];
  visible: Column[];
  widths: ColumnWidths;
  selected: string[];
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onStar: (id: string) => void;
  onUpdate: (item: Material) => boolean | Promise<boolean>;
  onDuplicate: (item: Material) => void;
  onRemove: (item: Material) => void;
  onSelectAll: () => void;
  sort: SortRule[];
  onSort: (key: Column, multi: boolean) => void;
  onResize: (key: Column, width: number) => void;
  onMove: (key: Column, target: Column) => void;
  resetKey: string;
};
const editable: Column[] = [
  "name",
  "description",
  "brand",
  "source",
  "rfq",
  "vendor",
  "account",
  "supplierPo",
  "quantity",
  "buyingPrice",
  "currency",
  "shipping",
  "shipCurrency",
  "leadWeeks",
  "requiredDate",
];
const numberFields: Column[] = [
  "quantity",
  "buyingPrice",
  "shipping",
  "leadWeeks",
];
function lowerBound(entries: Entry[], position: number) {
  let low = 0,
    high = entries.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (entries[mid].top + entries[mid].height <= position) low = mid + 1;
    else high = mid;
  }
  return low;
}
export default function ItemsTable({
  items,
  groupOrder,
  onReorderGroups,
  visible,
  widths,
  selected,
  onSelect,
  onOpen,
  onStar,
  onUpdate,
  onDuplicate,
  onRemove,
  onSelectAll,
  sort,
  onSort,
  onResize,
  onMove,
  resetKey,
}: Props) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [narrow, setNarrow] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    key: Column;
    value: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const menuScroll = useRef({ x: 0, y: 0, tableX: 0, tableY: 0 });
  const [focusId, setFocusId] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const resize = useRef<{ key: Column; start: number; width: number } | null>(
    null,
  );
  const drag = useRef<Column | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const selection = useMemo(() => new Set(selected), [selected]);
  const entries = useMemo(() => {
    const list: Entry[] = [];
    let top = 0;
    for (const group of groupOrder) {
      const rows = items.filter((i) => i.group === group);
      if (!rows.length) continue;
      list.push({
        kind: "group",
        group,
        count: rows.length,
        top,
        height: GROUP,
      });
      top += GROUP;
      if (!collapsed.includes(group))
        for (const item of rows) {
          list.push({ kind: "item", item, top, height: ROW });
          top += ROW;
        }
    }
    return list;
  }, [items, collapsed, groupOrder]);
  const totalHeight = entries.length
    ? entries[entries.length - 1].top + entries[entries.length - 1].height
    : 0;
  const start = lowerBound(entries, Math.max(0, scrollTop - OVERSCAN * ROW));
  const end = Math.min(
    entries.length,
    lowerBound(entries, scrollTop + height + OVERSCAN * ROW) + 1,
  );
  const shown = entries.slice(start, end);
  const top = shown[0]?.top ?? 0;
  const bottom = shown.length
    ? totalHeight - shown[shown.length - 1].top - shown[shown.length - 1].height
    : 0;
  const count = visible.length + 4;
  const width = (k: Column) =>
    widths[k] ?? (k === "name" && narrow ? 175 : (defaultWidths[k] ?? 140));
  useEffect(() => {
    if (!scroll.current) return;
    const node = scroll.current;
    const observer = new ResizeObserver(() => {
      setHeight(node.clientHeight);
      setNarrow(node.clientWidth < 550);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = 0;
      setScrollTop(0);
      setEditing(null);
      setMenu(null);
      setError("");
    }
  }, [resetKey]);
  useLayoutEffect(() => {
    if (!scroll.current) return;
    const max = Math.max(0, totalHeight + HEADER - scroll.current.clientHeight);
    if (scroll.current.scrollTop > max) scroll.current.scrollTop = max;
    setScrollTop(scroll.current.scrollTop);
  }, [totalHeight]);
  useLayoutEffect(() => {
    if (focusId) {
      rowRefs.current.get(focusId)?.focus({ preventScroll: true });
      setFocusId(null);
    }
  }, [focusId, start, end]);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: globalThis.PointerEvent) => {
      const target = e.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !menuTrigger.current?.contains(target)
      )
        setMenu(null);
    };
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        menuTrigger.current?.focus();
      }
    };
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    const pageScroll = () => {
      if (
        window.scrollX !== menuScroll.current.x ||
        window.scrollY !== menuScroll.current.y
      )
        dismiss();
    };
    window.addEventListener("scroll", pageScroll);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", pageScroll);
    };
  }, [menu]);
  useLayoutEffect(() => {
    if (menu)
      menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [menu]);
  function openMenu(id: string, trigger: HTMLButtonElement) {
    if (menu === id) {
      setMenu(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    menuTrigger.current = trigger;
    menuScroll.current = {
      x: window.scrollX,
      y: window.scrollY,
      tableX: scroll.current?.scrollLeft ?? 0,
      tableY: scroll.current?.scrollTop ?? 0,
    };
    setMenuPosition({
      left: Math.max(8, Math.min(rect.right - 230, window.innerWidth - 238)),
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260)),
    });
    setMenu(id);
  }
  function beginResize(e: PointerEvent<HTMLSpanElement>, key: Column) {
    e.preventDefault();
    e.stopPropagation();
    resize.current = { key, start: e.clientX, width: width(key) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function resizeMove(e: PointerEvent<HTMLSpanElement>) {
    const r = resize.current;
    if (r)
      onResize(
        r.key,
        Math.max(90, Math.min(520, r.width + e.clientX - r.start)),
      );
  }
  function edit(item: Material, key: Column) {
    if (!editable.includes(key)) return;
    setError("");
    setMenu(null);
    setEditing({ id: item.id, key, value: String(cell(item, key) ?? "") });
  }
  async function commit(item: Material) {
    if (!editing || editing.id !== item.id) return;
    const { key, value } = editing;
    let nextValue: string | number | null = value.trim();
    if (numberFields.includes(key)) {
      if (!value.trim() && key !== "leadWeeks") {
        setError("Enter a number.");
        return;
      }
      nextValue = value.trim() === "" ? null : Number(value);
    }
    const next = numberFields.includes(key)
      ? withDecimalInput(
          item,
          key as "quantity" | "buyingPrice" | "shipping" | "leadWeeks",
          value.trim(),
        )
      : { ...item, [key]: nextValue };
    const problem = validate({
      ...next,
      source:
        key !== "source" && next.source === "Unknown" ? "Local" : next.source,
    });
    if (problem) {
      setError(problem);
      return;
    }
    const success = await onUpdate({
      ...next,
      activity: [
        log("Inline edit: " + (columns.find((c) => c[0] === key)?.[1] ?? key)),
        ...item.activity,
      ],
    });
    if (success) {
      setEditing(null);
      setError("");
    } else setError("Save not confirmed. Refresh database before retrying.");
  }
  function navigate(e: KeyboardEvent<HTMLButtonElement>, item: Material) {
    if (e.key === "F2") {
      e.preventDefault();
      edit(item, "name");
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const index = entries.findIndex(
      (x) => x.kind === "item" && x.item.id === item.id,
    );
    const step = e.key === "ArrowDown" ? 1 : -1;
    let i = index + step;
    while (i >= 0 && i < entries.length && entries[i].kind !== "item")
      i += step;
    const target = entries[i];
    if (!target || target.kind !== "item" || !scroll.current) return;
    const node = scroll.current;
    if (target.top < node.scrollTop) node.scrollTop = target.top;
    else if (target.top + ROW > node.scrollTop + node.clientHeight - HEADER)
      node.scrollTop = target.top + ROW - node.clientHeight + HEADER;
    setScrollTop(node.scrollTop);
    setFocusId(target.item.id);
  }
  function editor(item: Material, k: Column) {
    if (!editing) return null;
    const opts =
      k === "source"
        ? ["Local", "Import"]
        : k === "currency" || k === "shipCurrency"
          ? currencies
          : null;
    const common = {
      value: editing.value,
      "aria-label": "Edit " + (columns.find((c) => c[0] === k)?.[1] ?? k),
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      ) => {
        setEditing({ ...editing, value: e.target.value });
        setError("");
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(item);
        }
        if (e.key === "Escape") {
          setEditing(null);
          setError("");
        }
      },
    };
    return (
      <div className="cell-editor" onClick={(e) => e.stopPropagation()}>
        {opts ? (
          <select autoFocus {...common}>
            {opts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            type={
              numberFields.includes(k)
                ? "number"
                : k === "requiredDate"
                  ? "date"
                  : "text"
            }
            step="any"
            {...common}
          />
        )}
        <button aria-label="Save inline edit" onClick={() => commit(item)}>
          ✓
        </button>
        <button
          aria-label="Cancel inline edit"
          onClick={() => {
            setEditing(null);
            setError("");
          }}
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div
        className="table-scroll windowed"
        ref={scroll}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
          if (
            e.currentTarget.scrollTop !== menuScroll.current.tableY ||
            e.currentTarget.scrollLeft !== menuScroll.current.tableX
          )
            setMenu(null);
        }}
      >
        <table
          style={{
            tableLayout: "fixed",
            width: 76 + visible.reduce((n, k) => n + width(k), 0) + 150,
          }}
        >
          <colgroup>
            <col style={{ width: 38 }} />
            <col style={{ width: 38 }} />
            {visible.map((k) => (
              <col key={k} style={{ width: width(k) }} />
            ))}
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  aria-label="Select all matching materials"
                  checked={
                    items.length > 0 && items.every((i) => selection.has(i.id))
                  }
                  onChange={onSelectAll}
                />
              </th>
              <th className="star-col">★</th>
              {visible.map((k) => {
                const rank = sort.findIndex((r) => r.key === k);
                return (
                  <th
                    key={k}
                    className={k === "name" ? "sticky-name" : ""}
                    aria-sort={
                      rank === 0
                        ? sort[rank].asc
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag.current) onMove(drag.current, k);
                      drag.current = null;
                    }}
                  >
                    <button
                      className="plain sort-header"
                      title="Click to sort; Shift+click to add a sort; drag to reorder"
                      draggable={k !== "name"}
                      onDragStart={(e) => {
                        drag.current = k;
                        e.dataTransfer.setData("text/plain", k);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => onSort(k, e.shiftKey)}
                    >
                      {columns.find((c) => c[0] === k)?.[1]}
                      {rank >= 0
                        ? (sort[rank].asc ? " ↑" : " ↓") +
                          (sort.length > 1 ? " " + (rank + 1) : "")
                        : ""}
                    </button>
                    <span
                      className="resize-handle"
                      role="separator"
                      aria-label={
                        "Resize " + columns.find((c) => c[0] === k)?.[1]
                      }
                      aria-orientation="vertical"
                      tabIndex={0}
                      onPointerDown={(e) => beginResize(e, k)}
                      onPointerMove={resizeMove}
                      onPointerUp={() => (resize.current = null)}
                      onPointerCancel={() => (resize.current = null)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          onResize(
                            k,
                            Math.max(
                              90,
                              Math.min(
                                520,
                                width(k) + (e.key === "ArrowRight" ? 10 : -10),
                              ),
                            ),
                          );
                        }
                      }}
                    />
                  </th>
                );
              })}
              <th>Updates</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {top > 0 && (
              <tr className="virtual-spacer" aria-hidden="true">
                <td colSpan={count} style={{ height: top }} />
              </tr>
            )}
            {shown.map((entry) =>
              entry.kind === "group" ? (
                <tr key={entry.group} className="group-row">
                  <td colSpan={count}>
                    <button
                      className="plain"
                      onClick={() =>
                        setCollapsed((old) =>
                          old.includes(entry.group)
                            ? old.filter((g) => g !== entry.group)
                            : [...old, entry.group],
                        )
                      }
                      aria-expanded={!collapsed.includes(entry.group)}
                    >
                      {collapsed.includes(entry.group) ? "›" : "⌄"}　◇　
                      {entry.group}{" "}
                      <span className="group-tag">{entry.count}</span>
                    </button>
                    {groupOrder.length > 1 && (
                      <button
                        className="plain group-order"
                        aria-label={
                          "Move " +
                          entry.group +
                          (groupOrder.indexOf(entry.group) === 0
                            ? " down"
                            : " up")
                        }
                        onClick={onReorderGroups}
                      >
                        {groupOrder.indexOf(entry.group) === 0 ? "↓" : "↑"}
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                <tr
                  key={entry.item.id}
                  data-material-id={entry.item.id}
                  className={selection.has(entry.item.id) ? "selected" : ""}
                  onClick={() => onOpen(entry.item.id)}
                >
                  <td
                    className="select-col"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={"Select " + entry.item.name}
                      checked={selection.has(entry.item.id)}
                      onChange={() => onSelect(entry.item.id)}
                    />
                  </td>
                  <td className="star-col" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={
                        "plain star " + (entry.item.starred ? "starred" : "")
                      }
                      aria-label={"Star " + entry.item.name}
                      aria-pressed={entry.item.starred}
                      onClick={() => onStar(entry.item.id)}
                    >
                      {entry.item.starred ? "★" : "☆"}
                    </button>
                  </td>
                  {visible.map((k) => {
                    const item = entry.item;
                    return (
                      <td
                        key={k}
                        className={k === "name" ? "sticky-name" : ""}
                        title={display(item, k)}
                      >
                        {editing?.id === item.id && editing.key === k ? (
                          editor(item, k)
                        ) : k === "name" ? (
                          <div className="name-cell">
                            <button
                              className="plain item-name"
                              ref={(el) => {
                                if (el) rowRefs.current.set(item.id, el);
                                else rowRefs.current.delete(item.id);
                              }}
                              onKeyDown={(e) => navigate(e, item)}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpen(item.id);
                              }}
                            >
                              {item.name}
                            </button>
                            <button
                              className="plain row-more"
                              aria-label={"Quick actions " + item.name}
                              aria-expanded={menu === item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openMenu(item.id, e.currentTarget);
                              }}
                            >
                              ⋯
                            </button>
                          </div>
                        ) : k === "source" ? (
                          <span
                            className={"source " + item.source.toLowerCase()}
                          >
                            ● {item.source}
                          </span>
                        ) : k === "shipCurrency" ? (
                          <select
                            aria-label={"Shipping currency " + item.name}
                            value={item.shipCurrency}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              onUpdate({
                                ...item,
                                shipCurrency: e.target
                                  .value as Material["shipCurrency"],
                                activity: [
                                  log("Shipping currency changed"),
                                  ...item.activity,
                                ],
                              })
                            }
                          >
                            {currencies.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        ) : (
                          display(item, k)
                        )}
                        {editable.includes(k) &&
                          k !== "shipCurrency" &&
                          !(editing?.id === item.id && editing.key === k) && (
                            <button
                              className="plain inline-edit"
                              aria-label={
                                "Edit " +
                                columns.find((c) => c[0] === k)?.[1] +
                                " for " +
                                item.name
                              }
                              title="Inline edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                edit(item, k);
                              }}
                            >
                              ✎
                            </button>
                          )}
                      </td>
                    );
                  })}
                  <td>▢ {entry.item.activity.length || ""}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="plain"
                      aria-label={"Actions " + entry.item.name}
                      aria-expanded={menu === entry.item.id}
                      onClick={(e) => openMenu(entry.item.id, e.currentTarget)}
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              ),
            )}
            {bottom > 0 && (
              <tr className="virtual-spacer" aria-hidden="true">
                <td colSpan={count} style={{ height: bottom }} />
              </tr>
            )}
            {!entries.length && (
              <tr>
                <td colSpan={count} className="empty">
                  No materials match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {menu && items.some((i) => i.id === menu) && (
        <div
          ref={menuRef}
          className="row-actions-panel"
          style={menuPosition}
          role="group"
          aria-label="Row quick actions"
        >
          {(() => {
            const item = items.find((i) => i.id === menu)!;
            return (
              <>
                <strong>{item.name}</strong>
                <button
                  onClick={() => {
                    onOpen(item.id);
                    setMenu(null);
                  }}
                >
                  Open details
                </button>
                <button
                  onClick={() => {
                    onDuplicate(item);
                    setMenu(null);
                  }}
                >
                  Quick duplicate
                </button>
                <button
                  onClick={() => {
                    onUpdate({
                      ...item,
                      group: groups.find((g) => g !== item.group)!,
                      activity: [log("Group moved"), ...item.activity],
                    });
                    setMenu(null);
                  }}
                >
                  Move group
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    onRemove(item);
                    setMenu(null);
                  }}
                >
                  Remove material
                </button>
                <button
                  onClick={() => {
                    setMenu(null);
                    menuTrigger.current?.focus();
                  }}
                >
                  Close
                </button>
              </>
            );
          })()}
        </div>
      )}
      <div className="table-footer">
        <span>
          {items.length.toLocaleString()} matching materials · virtual scrolling
        </span>
        <small>
          Shift+click: multi-sort · ↑/↓: navigate · F2: edit part number
        </small>
      </div>
    </>
  );
}
