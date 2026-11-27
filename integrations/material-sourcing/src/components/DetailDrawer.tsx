import { useEffect, useRef, useState } from "react";
import {
  committedCosts,
  decimalInput,
  groups,
  log,
  money,
  type Material,
  type Task,
} from "../utils/material";
import MaterialForm from "./MaterialForm";
import CommentsPanel from "./CommentsPanel";
import type { Collaborate } from "../api/collaboration";
import {
  useCollaborationDraft,
  emptyTaskDraft,
} from "../utils/collaborationDraft";
import { readDraft } from "../utils/drafts";
export default function DetailDrawer({
  item,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
  databaseMode = false,
  busy = false,
  databaseError = "",
  onRefresh,
  onCollaborate,
}: {
  item: Material;
  onClose: () => void;
  onSave: (item: Material) => boolean | Promise<boolean>;
  databaseMode?: boolean;
  busy?: boolean;
  databaseError?: string;
  onRefresh?: () => void;
  onCollaborate?: Collaborate;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const draftKey = databaseMode ? "database." + item.id : item.id;
  const [tab, setTab] = useState("Details"),
    [editing, setEditing] = useState(() => !!readDraft(draftKey));
  const [taskDraft, setTaskDraft, taskDraftError] = useCollaborationDraft(
    item.id + ".task",
    emptyTaskDraft,
    databaseMode,
  );
  const task = taskDraft.text;
  const [taskPending, setTaskPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function close() {
    onClose();
  }
  const c = committedCosts(item);
  function update(patch: Partial<Material>, message: string) {
    return onSave({
      ...item,
      ...patch,
      activity: [log(message), ...item.activity],
    });
  }
  async function addTask() {
    if (!task.trim() || taskPending || busy) return;
    setTaskPending(true);
    try {
      const success = onCollaborate
        ? await onCollaborate(
            { kind: "task.add", id: taskDraft.id, title: task.trim() },
            taskDraft.id,
          )
        : await update(
            {
              tasks: [
                ...item.tasks,
                {
                  id: taskDraft.id,
                  title: task.trim(),
                  status: "Working on it",
                },
              ],
            },
            "Task added: " + task.trim(),
          );
      if (success) setTaskDraft(emptyTaskDraft());
    } finally {
      setTaskPending(false);
    }
  }
  async function changeTask(t: Task, remove = false) {
    if (busy || taskPending) return;
    setTaskPending(true);
    try {
      const next = states[(states.indexOf(t.status) + 1) % 3];
      if (onCollaborate)
        await onCollaborate(
          remove
            ? { kind: "task.remove", id: t.id, expected: t.status }
            : {
                kind: "task.status",
                id: t.id,
                expected: t.status,
                status: next,
              },
        );
      else
        await update(
          {
            tasks: remove
              ? item.tasks.filter((x) => x.id !== t.id)
              : item.tasks.map((x) =>
                  x.id === t.id ? { ...x, status: next } : x,
                ),
          },
          remove
            ? "Task removed: " + t.title
            : "Task status changed: " + t.title,
        );
    } finally {
      setTaskPending(false);
    }
  }
  async function moveTask(index: number, step: number) {
    if (busy || taskPending) return;
    const tasks = [...item.tasks],
      target = index + step;
    if (target < 0 || target >= tasks.length) return;
    [tasks[index], tasks[target]] = [tasks[target], tasks[index]];
    setTaskPending(true);
    try {
      if (onCollaborate)
        await onCollaborate({
          kind: "task.reorder",
          expected: item.tasks.map((t) => t.id),
          order: tasks.map((t) => t.id),
        });
      else await update({ tasks }, "Tasks reordered");
    } finally {
      setTaskPending(false);
    }
  }
  const states: Task["status"][] = ["Working on it", "Done", "Stuck"];
  const info = (label: string, value: string | number | null) => (
    <div className="info">
      <small>{label}</small>
      <strong>{value === "" || value === null ? "—" : value}</strong>
    </div>
  );
  const elapsed = Math.max(
    0,
    (Date.now() - new Date(item.created + "T00:00:00").getTime()) / 604800000,
  );
  const progress =
    item.leadWeeks && item.leadWeeks > 0
      ? Math.min(100, Math.round((elapsed / item.leadWeeks) * 100))
      : 0;
  return (
    <dialog
      ref={dialog}
      className="drawer"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div className="drawer-inner">
        <header className="drawer-header">
          <div>
            <h2>{item.name}</h2>
            <span className="group-tag">{item.group}</span>
          </div>
          <button className="plain" aria-label="Close details" onClick={close}>
            ✕
          </button>
        </header>
        <nav className="drawer-tabs" aria-label="Item sections">
          {["Details", "Tasks", "Activity"].map((t) => (
            <button
              key={t}
              disabled={editing && t !== "Details"}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "Details" ? "▤ " : t === "Tasks" ? "☷ " : "◷ "}
              {t}
            </button>
          ))}
        </nav>
        <div className="drawer-content">
          {databaseError && (
            <div role="alert" className="notice">
              {databaseError}
              <button disabled={busy} onClick={onRefresh}>
                Retry database
              </button>
            </div>
          )}
          {busy && (
            <p role="status" className="notice">
              Saving to database…
            </p>
          )}
          {tab === "Details" &&
            (editing ? (
              <>
                <div className="editing">✎ Editing · draft saved locally</div>
                <MaterialForm
                  initial={item}
                  draftKey={draftKey}
                  onCancel={() => setEditing(false)}
                  onSave={async (next) => {
                    const success = await update(
                      next,
                      "Material details updated",
                    );
                    if (success) setEditing(false);
                    return success;
                  }}
                />
              </>
            ) : (
              <>
                <section>
                  <h3>◇ Identification</h3>
                  <div className="fields">
                    {info("Part number", item.name)}
                    {info("Source type", item.source)}
                    {info("RFQ ref no", item.rfq)}
                    {info("Requestor", item.requestor)}
                    <div className="wide">
                      {info("Material description", item.description)}
                    </div>
                    {info("Brand", item.brand)}
                    {info("Quantity", decimalInput(item, "quantity"))}
                  </div>
                </section>
                <section>
                  <h3>▤ Supplier &amp; schedule</h3>
                  <div className="fields">
                    {info("Vendor details", item.vendor)}
                    {info("Date required", item.requiredDate)}
                    {info("Account", item.account)}
                    {info("Supplier PO", item.supplierPo)}
                  </div>
                </section>
                <section>
                  <h3>＄ Pricing &amp; cost</h3>
                  <div className="fields">
                    {info(
                      "Buying price",
                      money(decimalInput(item, "buyingPrice")),
                    )}
                    {info("Currency", item.currency)}
                    {info(
                      "Shipping cost / unit",
                      money(decimalInput(item, "shipping")),
                    )}
                    {info("Ship. currency", item.shipCurrency)}
                    {info("Selling price (VAT-ex)", money(c.selling))}
                    {info("PHP equivalent", money(c.php))}
                  </div>
                </section>
                <section>
                  <h3>▧ Calculated totals</h3>
                  <div className="cost-preview">
                    {info("Landed buying cost", money(c.landed))}
                    {info("Total landed buying", money(c.totalLanded))}
                    {info("Total VAT-in", money(c.vatIn))}
                  </div>
                </section>
                <section>
                  <h3>◷ Logistics</h3>
                  {info("Lead time (weeks)", decimalInput(item, "leadWeeks"))}
                  <small>Lead time progress (from creation)</small>
                  <progress max={100} value={progress} />
                  <div className="progress-label">
                    <span>
                      {elapsed.toFixed(1)} of {item.leadWeeks ?? "—"} weeks
                    </span>
                    <b>{progress}%</b>
                  </div>
                </section>
              </>
            ))}
          {tab === "Tasks" && (
            <section>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTask();
                }}
              >
                <input
                  aria-label="Task title"
                  placeholder="Add a task…"
                  value={task}
                  disabled={busy || taskPending}
                  onChange={(e) =>
                    setTaskDraft({ ...emptyTaskDraft(), text: e.target.value })
                  }
                />
                <button
                  className="primary"
                  disabled={!task.trim() || busy || taskPending}
                >
                  +
                </button>
              </form>
              {taskDraftError && (
                <p className="error" role="alert">
                  {taskDraftError}
                </p>
              )}
              {!item.tasks.length && (
                <p className="empty">No tasks yet. Add one above.</p>
              )}
              {item.tasks.map((t, index) => (
                <div className="task" key={t.id}>
                  <span>{t.title}</span>
                  {onCollaborate && (
                    <>
                      <button
                        aria-label={"Move task up " + t.title}
                        disabled={busy || taskPending || index === 0}
                        onClick={() => void moveTask(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={"Move task down " + t.title}
                        disabled={
                          busy || taskPending || index === item.tasks.length - 1
                        }
                        onClick={() => void moveTask(index, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <button
                    disabled={busy || taskPending}
                    onClick={() => void changeTask(t)}
                  >
                    {t.status}
                  </button>
                  <button
                    disabled={busy || taskPending}
                    aria-label={"Delete task " + t.title}
                    onClick={() => void changeTask(t, true)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "Activity" && (
            <CommentsPanel
              item={item}
              onUpdate={onSave}
              onCollaborate={onCollaborate}
              busy={busy}
            />
          )}
        </div>
        {tab === "Details" && !editing && (
          <footer className="actions drawer-actions">
            <button className="primary" onClick={() => setEditing(true)}>
              ✎ Edit
            </button>
            <button onClick={onDuplicate}>▣ Duplicate</button>
            <button
              onClick={() =>
                update(
                  { group: groups.find((g) => g !== item.group)! },
                  "Moved to " + groups.find((g) => g !== item.group),
                )
              }
            >
              ⇄ {item.group === groups[0] ? "Quotation" : "Engineering"}
            </button>
            <button className="danger" onClick={onDelete}>
              Delete
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
