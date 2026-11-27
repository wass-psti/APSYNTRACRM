import { useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import CommandPalette from "./components/CommandPalette";
import MaterialForm from "./components/MaterialForm";
import DetailDrawer from "./components/DetailDrawer";
import ItemsTable, {
  columns,
  display,
  type Column,
} from "./components/ItemsTable";
import {
  changeSort,
  sortMaterials,
  moveColumn,
  type SortRule,
  type ColumnWidths,
} from "./utils/columns";
import BulkImport from "./components/BulkImport";
import { demoItems } from "./data/demo";
import {
  groups,
  log,
  newMaterial,
  overdue,
  type Material,
  type Group,
  type Source,
} from "./utils/material";
import { useStored } from "./utils/storage";
import { useDatabase } from "./api/useDatabase";
import type { CollaborationAction } from "./api/collaboration";
import type { Revision, BulkCommand } from "./api/localDatabase";
const databaseMode =
  new URLSearchParams(window.location.search).get("mode") === "database";
type View = {
  name: string;
  search: string;
  source: string;
  vendor: string;
  late: boolean;
  stars: boolean;
  visible: Column[];
  sort?: SortRule[];
  widths?: ColumnWidths;
};
const key = "material-sourcing.v1.";
const defaultColumns = columns.map((c) => c[0]);
export default function App() {
  const [demo, setItems, storageError] = useStored(key + "items", demoItems);
  const db = useDatabase(databaseMode);
  const items = useMemo(
    () =>
      databaseMode
        ? db.snapshot.records.map((r) => ({
            ...r.material,
            dbRevision: r.revision,
            savedCosts: r.costs,
            decimalInputs: r.inputs,
          }))
        : demo,
    [db.snapshot.records, demo],
  );
  const [dbUndo, setDbUndo] = useStored<Revision[]>(
    key + "database.undo",
    () => [],
  );
  const revision = (id: string) =>
    db.snapshot.records.find((r) => r.material.id === id)?.revision ?? "";
  const allowed = () => !databaseMode || (db.ready && !db.busy);
  async function refresh() {
    if (databaseMode) {
      if (await db.run()) setNotice("Database refreshed");
    } else setNotice("Local view refreshed · demo rates unchanged");
  }
  const [dark, setDark] = useStored(key + "dark", () => false);
  const [hidden, setHidden] = useStored(key + "metrics", () => false);
  const [visible, setVisible] = useStored<Column[]>(
    key + "columns",
    () => defaultColumns,
  );
  const [groupOrder, setGroupOrder] = useStored<Group[]>(
    key + "group-order",
    () => [...groups],
  );
  const [widths, setWidths] = useStored<ColumnWidths>(
    key + "widths",
    () => ({}),
  );
  const [sort, setSort] = useStored<SortRule[]>(key + "sort", () => []);
  const [exporting, setExporting] = useState(false);
  const [views, setViews] = useStored<View[]>(key + "views", () => []);
  const [tab, setTab] = useState("All Items"),
    [search, setSearch] = useState(""),
    [source, setSource] = useState("All"),
    [vendor, setVendor] = useState(""),
    [late, setLate] = useState(false),
    [stars, setStars] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(""),
    [notice, setNotice] = useState(""),
    [undo, setUndo] = useState<Material[]>([]),
    [palette, setPalette] = useState(false);
  const [draft, setDraft] = useState(newMaterial);
  const bulkKey=key+"database.bulk.pending";
  const [pendingBatch,setPendingBatch]=useState<BulkCommand|null>(()=>{
    if(!databaseMode)return null;
    try{return JSON.parse(localStorage.getItem(bulkKey)||"null");}catch{return null;}
  });
  const [importRaw,setImportRaw]=useStored(key+(databaseMode?"database.import.raw":"demo.import.raw"),()=>"");
  const [batchError,setBatchError]=useState("");
  function clearBatch(){
    try{localStorage.removeItem(bulkKey);setPendingBatch(null);}catch{setBatchError("Batch receipt confirmed but local recovery storage could not be cleared.");}
  }
  async function submitBatch(command:BulkCommand,retry=false):Promise<boolean>{
    if(!allowed()||(!retry&&pendingBatch))return false;
    setBatchError("");
    try{localStorage.setItem(bulkKey,JSON.stringify(command));setPendingBatch(command);}
    catch{setBatchError("Unable to store the recovery request. No batch was submitted. Free browser storage and retry.");return false;}
    const result=await db.run(command);
    if(!result){
      if(db.lastFailure.current>=400&&db.lastFailure.current<500)clearBatch();
      return false;
    }
    if(command.action==="archive"){setDbUndo(result.archived);setOpen(null);setNotice(command.items.length+" material(s) removed. Undo is available.");}
    else if(command.action==="restore"){setDbUndo([]);setNotice("Materials restored");}
    else if(command.action==="create"){setImportRaw("");setTab("All Items");setSearch("");setSource("All");setVendor("");setLate(false);setStars(false);setNotice(command.items.length+" material(s) added");}
    else setNotice(command.items.length+" material(s) updated");
    setSelected([]);clearBatch();
    return true;
  }
  async function importRows(rows:Material[]){
    return databaseMode?submitBatch({action:"create",operationId:crypto.randomUUID(),items:rows}):add(rows);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !document.querySelector("dialog.drawer[open]")
      ) {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (!q ||
          [i.name, i.description, i.brand, i.vendor].some((v) =>
            v.toLowerCase().includes(q),
          )) &&
        (source === "All" || i.source === source) &&
        i.vendor.toLowerCase().includes(vendor.toLowerCase()) &&
        (!late || overdue(i)) &&
        (!stars || i.starred),
    );
    return sortMaterials(list, sort);
  }, [items, search, source, vendor, late, stars, sort]);
  const active = items.find((i) => i.id === open);
  async function update(next: Material): Promise<boolean> {
    if (!allowed()) return false;
    if (databaseMode) {
      const result = await db.run({
        action: "update",
        items: [
          { material: next, revision: next.dbRevision ?? revision(next.id) },
        ],
      });
      if (!result) return false;
      setNotice("Material saved to database");
    } else setItems((old) => old.map((i) => (i.id === next.id ? next : i)));
    return true;
  }
  async function add(
    rows: Material[],
    duplicateFrom?: Revision,
  ): Promise<boolean> {
    if (!allowed()) return false;
    if (databaseMode) {
      if (!(await db.run({ action: "create", items: rows, duplicateFrom })))
        return false;
    } else
      setItems((old) => [
        ...rows.map((i) => ({
          ...i,
          activity: [log("Material created"), ...i.activity],
        })),
        ...old,
      ]);
    setNotice(rows.length + " material(s) added");
    setTab("All Items");
    setSearch("");
    setSource("All");
    setVendor("");
    setLate(false);
    setStars(false);
    setDraft(newMaterial());
    setSelected([]);
    return true;
  }
  async function archive(ids: string[]) {
    if (!allowed()) return;
    if (databaseMode) {
      if(!await submitBatch({action:"archive",operationId:crypto.randomUUID(),items:ids.map(id=>({id,revision:revision(id)}))}))return;
    } else {
      setUndo(items.filter((i) => ids.includes(i.id)));
      setItems((old) => old.filter((i) => !ids.includes(i.id)));
    }
    setSelected([]);
    setOpen(null);
    setNotice(ids.length + " material(s) removed. Undo is available.");
  }
  async function restore() {
    if (!allowed()) return;
    if (databaseMode) {
      if(!await submitBatch({action:"restore",operationId:crypto.randomUUID(),items:dbUndo}))return;
    } else {
      setItems((old) => [
        ...undo.filter((i) => !old.some((x) => x.id === i.id)),
        ...old,
      ]);
      setUndo([]);
    }
    setNotice("Materials restored");
  }
  async function bulk(patch: Partial<Material>) {
    if (!allowed()) return;
    if (databaseMode) {
      if(!await submitBatch({action:"bulkPatch",operationId:crypto.randomUUID(),items:items.filter(i=>selected.includes(i.id)).map(i=>({id:i.id,revision:revision(i.id)})),patch}))return;
    } else
      setItems((old) =>
        old.map((i) =>
          selected.includes(i.id)
            ? { ...i, ...patch, activity: [log("Bulk update"), ...i.activity] }
            : i,
        ),
      );
    setNotice(selected.length + " material(s) updated");
    setSelected([]);
  }
  async function duplicate(item: Material) {
    const copy = {
      ...item,
      id: crypto.randomUUID(),
      dbRevision: undefined,
      created: newMaterial().created,
      starred: false,
      tasks: [],
      activity: [],
    };
    if (
      await add(
        [copy],
        databaseMode ? { id: item.id, revision: revision(item.id) } : undefined,
      )
    )
      setOpen(copy.id);
  }
  function resetFilters() {
    setSearch("");
    setSource("All");
    setVendor("");
    setLate(false);
    setStars(false);
    setSelected([]);
    setSort([]);
  }
  function exportCsv() {
    const rows = selected.length
      ? filtered.filter((i) => selected.includes(i.id))
      : filtered;
    const safe = (s: string) =>
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
    const csv = [
      visible.map((k) => columns.find((c) => c[0] === k)![1]),
      ...rows.map((i) => visible.map((k) => display(i, k))),
    ]
      .map((row) => row.map(safe).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "material-sourcing.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function exportReport(format: "xlsx" | "pdf") {
    const rows = selected.length
      ? filtered.filter((i) => selected.includes(i.id))
      : filtered;
    if (!rows.length) {
      setNotice("No matching materials to export.");
      return;
    }
    setExporting(true);
    try {
      const { exportXlsx, exportPdf } = await import("./utils/exportReports");
      if (format === "xlsx") await exportXlsx(rows, visible);
      else await exportPdf(rows);
      setNotice(
        format.toUpperCase() +
          " report generated for " +
          rows.length +
          " materials.",
      );
    } catch (error) {
      setNotice(
        "Export failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setExporting(false);
    }
  }
  function selectView(v: View) {
    setSearch(v.search);
    setSource(v.source);
    setVendor(v.vendor);
    setLate(v.late);
    setStars(v.stars);
    setVisible(v.visible);
    setSort(v.sort ?? []);
    setWidths(v.widths ?? {});
    setSelected([]);
    setMenu("");
  }
  function changeTab(t: string) {
    setTab(t);
    setMenu("");
    setSelected([]);
  }
  function chooseFilter(s: Source) {
    setSource(source === s ? "All" : s);
    setTab("All Items");
    setSelected([]);
  }
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">▱</span>
            <div>
              <h1>Material Sourcing</h1>
              <p>Procurement tracking &amp; cost management</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="demo-label">
              {databaseMode ? "Local database" : "Frontend demo"}
            </span>
            <a
              className="mode-link"
              href={databaseMode ? "/?mode=demo" : "/?mode=database"}
            >
              {databaseMode ? "Demo mode" : "Database mode"}
            </a>
            <button
              aria-label="Toggle theme"
              className="plain"
              onClick={() => setDark(!dark)}
            >
              {dark ? "☀" : "☾"}
            </button>
            <button
              className="plain"
              aria-label="Refresh local view"
              onClick={() => void refresh()}
            >
              ↻
            </button>
          </div>
        </div>
      </header>
      <main>
        {databaseMode && db.busy && (
          <p role="status" className="notice">
            Synchronizing database…
          </p>
        )}
        {databaseMode && db.error && (
          <div className="notice" role="alert">
            {db.error}
            <button disabled={db.busy} onClick={() => void refresh()}>
              Retry database
            </button>
          </div>
        )}
        {databaseMode && !db.ready && !db.error && !db.busy && (
          <p role="status">Connecting to local database…</p>
        )}
        {databaseMode&&batchError&&<p role="alert" className="error">{batchError}</p>}
        {databaseMode&&pendingBatch&&<div className="notice" role="status">Unconfirmed batch · {pendingBatch.items.length} records. Retry the original request to reconcile it without duplicates.
          <button disabled={!allowed()} onClick={()=>void submitBatch(pendingBatch,true)}>Retry batch</button>
        </div>}
        <Dashboard
          items={items}
          reference={db.snapshot.reference}
          databaseMode={databaseMode}
          hidden={hidden}
          onToggle={() => setHidden(!hidden)}
          onFilter={chooseFilter}
        />
        <nav className="tabs" aria-label="Main sections">
          {["All Items", "Add Material", "Bulk Import"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => changeTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {!databaseMode && storageError && (
          <p className="error" role="alert">
            {storageError}
          </p>
        )}
        {(notice || (databaseMode && dbUndo.length > 0)) &&
          !(databaseMode && db.error) && (
            <div className="notice" role="status">
              {notice ||
                (databaseMode && dbUndo.length > 0
                  ? "Archived materials can be restored."
                  : "")}
              {(databaseMode ? dbUndo.length : undo.length) > 0 && (
                <button disabled={!allowed()} onClick={() => void restore()}>
                  Undo
                </button>
              )}
              <button
                className="plain"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                ✕
              </button>
            </div>
          )}
        {tab === "All Items" && (
          <section className="surface table-surface">
            <div className="toolbar">
              <input
                type="search"
                aria-label="Search materials"
                placeholder="Search materials…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected([]);
                }}
              />
              <select
                aria-label="Filter source"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setSelected([]);
                }}
              >
                {["All", "Local", "Import", "Unknown"].map((s) => (
                  <option key={s} value={s}>
                    {s === "All" ? "All sources" : s}
                  </option>
                ))}
              </select>
              <input
                aria-label="Filter vendor"
                placeholder="Vendor…"
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value);
                  setSelected([]);
                }}
              />
              <button
                aria-pressed={late}
                className={late ? "pressed" : ""}
                onClick={() => {
                  setLate(!late);
                  setSelected([]);
                }}
              >
                ⚠ Overdue{" "}
                <span className="count-red">
                  {items.filter(overdue).length}
                </span>
              </button>
              <button
                aria-pressed={stars}
                className={stars ? "pressed" : ""}
                onClick={() => {
                  setStars(!stars);
                  setSelected([]);
                }}
              >
                ★
              </button>
              <div className="toolbar-spacer" />
              <button onClick={() => setPalette(true)}>⌘K</button>
              <div className="menu-wrap">
                <button
                  onClick={() => setMenu(menu === "columns" ? "" : "columns")}
                >
                  ▥ Columns ({visible.length})
                </button>
                {menu === "columns" && (
                  <div className="dropdown">
                    {[
                      ...visible,
                      ...defaultColumns.filter((k) => !visible.includes(k)),
                    ].map((k) => {
                      const label = columns.find((c) => c[0] === k)![1];
                      return (
                        <div className="column-option" key={k}>
                          <label>
                            <input
                              type="checkbox"
                              checked={visible.includes(k)}
                              disabled={k === "name"}
                              onChange={() =>
                                setVisible((old) =>
                                  old.includes(k)
                                    ? old.filter((x) => x !== k)
                                    : [...old, k],
                                )
                              }
                            />
                            {label}
                          </label>
                          {visible.includes(k) && k !== "name" && (
                            <>
                              <button
                                aria-label={"Move " + label + " left"}
                                disabled={visible.indexOf(k) <= 1}
                                onClick={() =>
                                  setVisible((old) =>
                                    moveColumn(old, k, old[old.indexOf(k) - 1]),
                                  )
                                }
                              >
                                ↑
                              </button>
                              <button
                                aria-label={"Move " + label + " right"}
                                disabled={
                                  visible.indexOf(k) === visible.length - 1
                                }
                                onClick={() =>
                                  setVisible((old) =>
                                    moveColumn(old, k, old[old.indexOf(k) + 1]),
                                  )
                                }
                              >
                                ↓
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => {
                        setVisible(defaultColumns);
                        setWidths({});
                      }}
                    >
                      Reset columns
                    </button>
                  </div>
                )}
              </div>
              <div className="menu-wrap">
                <button
                  onClick={() => setMenu(menu === "views" ? "" : "views")}
                >
                  ♧ Views
                </button>
                {menu === "views" && (
                  <div className="dropdown">
                    <button
                      onClick={() => {
                        const name = window.prompt("View name");
                        if (name?.trim())
                          setViews((old) => [
                            ...old.filter((v) => v.name !== name.trim()),
                            {
                              name: name.trim(),
                              search,
                              source,
                              vendor,
                              late,
                              stars,
                              visible,
                              sort,
                              widths,
                            },
                          ]);
                        setMenu("");
                      }}
                    >
                      Save current view
                    </button>
                    {views.map((v) => (
                      <button key={v.name} onClick={() => selectView(v)}>
                        {v.name}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        resetFilters();
                        setVisible(defaultColumns);
                        setWidths({});
                        setMenu("");
                      }}
                    >
                      Reset view
                    </button>
                  </div>
                )}
              </div>
              <button disabled={exporting} onClick={() => exportReport("pdf")}>
                PDF
              </button>
              <button disabled={exporting} onClick={() => exportReport("xlsx")}>
                Excel
              </button>
              <button onClick={exportCsv}>Excel CSV</button>
              {sort.length > 0 && (
                <button onClick={() => setSort([])}>Clear sort</button>
              )}
              <span className="group-tag">{filtered.length}</span>
            </div>
            {selected.length > 0 && (
              <div className="bulkbar">
                <b>{selected.length} selected</b>
                <button onClick={() => bulk({ group: groups[0] })}>
                  Move to Engineering
                </button>
                <button onClick={() => bulk({ group: groups[1] })}>
                  Move to Quotation
                </button>
                <button onClick={() => bulk({ source: "Local" })}>Local</button>
                <button onClick={() => bulk({ source: "Import" })}>
                  Import
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (window.confirm("Remove selected materials?"))
                      archive(selected);
                  }}
                >
                  Remove
                </button>
                <button onClick={() => setSelected([])}>Clear</button>
              </div>
            )}
            <ItemsTable
              items={filtered}
              visible={visible}
              groupOrder={groupOrder}
              onReorderGroups={() => setGroupOrder((old) => [...old].reverse())}
              widths={widths}
              resetKey={JSON.stringify([
                search,
                source,
                vendor,
                late,
                stars,
                sort,
              ])}
              selected={selected}
              onSelect={(id) =>
                setSelected((old) =>
                  old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
                )
              }
              onOpen={setOpen}
              onStar={(id) => {
                const item = items.find((i) => i.id === id);
                if (item) void update({ ...item, starred: !item.starred });
              }}
              onUpdate={update}
              onDuplicate={duplicate}
              onRemove={(item) => {
                if (window.confirm("Remove this material?")) archive([item.id]);
              }}
              onResize={(key, width) =>
                setWidths((old) => ({ ...old, [key]: width }))
              }
              onMove={(key, target) =>
                setVisible((old) => moveColumn(old, key, target))
              }
              onSelectAll={() => {
                const ids = filtered.map((i) => i.id);
                const idSet = new Set(ids);
                setSelected((old) =>
                  ids.every((id) => old.includes(id))
                    ? old.filter((id) => !idSet.has(id))
                    : [...new Set([...old, ...ids])],
                );
              }}
              sort={sort}
              onSort={(key, multi) =>
                setSort((old) => changeSort(old, key, multi))
              }
            />
          </section>
        )}
        {tab === "Add Material" && (
          <section className="surface add-surface">
            <div className="form-heading">
              <span className="brand-icon">◇</span>
              <div>
                <h2>New Material</h2>
                <p>Fill in the required details</p>
              </div>
            </div>
            <MaterialForm
              initial={
                databaseMode && db.snapshot.reference
                  ? {
                      ...draft,
                      usd: Number(db.snapshot.reference.usd),
                      eur: Number(db.snapshot.reference.eur),
                      decimalInputs: {
                        usd: db.snapshot.reference.usd,
                        eur: db.snapshot.reference.eur,
                      },
                      expectedFxId: db.snapshot.reference.id,
                    }
                  : draft
              }
              reference={databaseMode ? db.snapshot.reference : undefined}
              draftKey={databaseMode ? "database.new" : "new"}
              onSave={(i) => add([i])}
            />
          </section>
        )}
        {tab === "Bulk Import" && (
          <BulkImport
            onImport={importRows}
            raw={importRaw}
            setRaw={setImportRaw}
            pending={databaseMode&&!!pendingBatch}
            reference={databaseMode ? db.snapshot.reference : undefined}
          />
        )}
      </main>
      {active && (
        <DetailDrawer
          key={active.id}
          item={active}
          onClose={() => setOpen(null)}
          onSave={update}
          onCollaborate={
            databaseMode
              ? async (
                  change: CollaborationAction,
                  operationId: string = crypto.randomUUID(),
                ) => {
                  if (!allowed()) return false;
                  return !!(await db.run({
                    action: "collaborate",
                    materialId: active.id,
                    operationId,
                    change,
                  }));
                }
              : undefined
          }
          databaseMode={databaseMode}
          busy={databaseMode && db.busy}
          databaseError={databaseMode ? db.error : ""}
          onRefresh={refresh}
          onDuplicate={() => duplicate(active)}
          onDelete={() => {
            if (window.confirm("Remove this material?")) archive([active.id]);
          }}
        />
      )}
      {palette && (
        <CommandPalette
          items={items}
          onClose={() => setPalette(false)}
          onOpen={setOpen}
          commands={[
            ...["Add Material", "Bulk Import", "All Items"].map((label) => ({
              label,
              action: () => changeTab(label),
            })),
            { label: "Toggle theme", action: () => setDark((v) => !v) },
            {
              label: "Refresh local view",
              action: () => void refresh(),
            },
          ]}
        />
      )}
    </>
  );
}
