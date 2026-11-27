import { useState } from "react";
import type { Collaborate } from "../api/collaboration";
import {
  useCollaborationDraft,
  emptyCommentDraft,
  type CommentEditDraft,
} from "../utils/collaborationDraft";
import { log, type Activity, type Material } from "../utils/material";
const demoPeople = ["Demo user", "Engineering team", "Procurement team"];
export default function CommentsPanel({
  item,
  onUpdate,
  onCollaborate,
  busy = false,
}: {
  item: Material;
  onCollaborate?: Collaborate;
  busy?: boolean;
  onUpdate: (item: Material) => boolean | Promise<boolean>;
}) {
  const [draft, setDraft, draftError] = useCollaborationDraft(
    item.id + ".comment",
    emptyCommentDraft,
    !!onCollaborate,
  );
  const [editDraft, setEditDraft, editError] =
    useCollaborationDraft<CommentEditDraft | null>(
      item.id + ".edit",
      () => null,
      !!onCollaborate,
    );
  const [pending, setPending] = useState(false);
  const comment = draft.text,
    replyTo = draft.parentId,
    editing = editDraft?.id ?? null,
    editText = editDraft?.text ?? "";
  const blocked = busy || pending;
  function setComment(text: string) {
    setDraft({ ...draft, text, id: crypto.randomUUID() });
  }
  function setReplyTo(parentId: string | null) {
    setDraft({ ...draft, parentId, id: crypto.randomUUID() });
  }
  function setEditing(id: string | null) {
    if (id === null) setEditDraft(null);
  }
  function setEditText(text: string) {
    if (editDraft)
      setEditDraft({ ...editDraft, text, operationId: crypto.randomUUID() });
  }
  const people = Array.from(
    new Set([item.requestor, ...demoPeople].filter(Boolean)),
  );
  const mentionMatch = comment.match(/(?:^|\s)@([^@]*)$/);
  const suggestions = mentionMatch
    ? people.filter((p) =>
        p.toLowerCase().startsWith(mentionMatch[1].toLowerCase()),
      )
    : [];
  const mentions = (text: string) =>
    people.filter((p) => text.includes("@" + p));
  function persist(activity: Activity[]) {
    return onUpdate({ ...item, activity });
  }
  async function post() {
    const text = comment.trim();
    if (!text || blocked) return;
    setPending(true);
    try {
      const success = onCollaborate
        ? await onCollaborate(
            {
              kind: "comment.add",
              id: draft.id,
              text,
              parentId: replyTo,
              mentions: mentions(text),
            },
            draft.id,
          )
        : await persist([
            {
              ...log("Comment: " + text),
              id: draft.id,
              kind: "comment",
              parentId: replyTo ?? undefined,
              mentions: mentions(text),
            },
            ...item.activity,
          ]);
      if (success) setDraft(emptyCommentDraft());
    } finally {
      setPending(false);
    }
  }
  async function update(a: Activity, text: string) {
    if (!text.trim() || blocked || !editDraft) return;
    setPending(true);
    try {
      const success = onCollaborate
        ? await onCollaborate(
            {
              kind: "comment.edit",
              id: a.id,
              expected: editDraft.expected,
              text: text.trim(),
              mentions: mentions(text),
            },
            editDraft.operationId,
          )
        : await persist(
            item.activity.map((x) =>
              x.id === a.id
                ? {
                    ...x,
                    text: "Comment: " + text.trim(),
                    kind: "comment",
                    mentions: mentions(text),
                    editedAt: new Date().toISOString(),
                  }
                : x,
            ),
          );
      if (success) setEditDraft(null);
    } finally {
      setPending(false);
    }
  }
  async function remove(a: Activity) {
    if (blocked) return;
    setPending(true);
    try {
      if (onCollaborate)
        await onCollaborate({
          kind: "comment.remove",
          id: a.id,
          expected: a.editedAt ?? null,
        });
      else
        await persist(
          item.activity.map((x) =>
            x.id === a.id
              ? { ...x, deleted: true, text: "Comment removed", mentions: [] }
              : x,
          ),
        );
    } finally {
      setPending(false);
    }
  }
  const byParent = new Map<string, Activity[]>();
  for (const a of item.activity) {
    if (a.parentId) {
      const list = byParent.get(a.parentId) ?? [];
      list.push(a);
      byParent.set(a.parentId, list);
    }
  }
  const isComment = (a: Activity) =>
    a.kind === "comment" || a.text.startsWith("Comment: ");
  function render(a: Activity, depth = 0) {
    const isThread = isComment(a) || a.deleted;
    const replies = byParent.get(a.id) ?? [];
    return (
      <article
        className={"activity " + (depth ? "thread-reply" : "")}
        key={a.id}
      >
        <small>
          {isThread
            ? (a.authorRef === "local-development"
                ? "Local development"
                : (a.authorRef ??
                  (onCollaborate ? "Unknown author" : "Demo user"))) + " · "
            : ""}
          {new Date(a.at).toLocaleString()}
          {a.editedAt ? " · edited" : ""}
        </small>
        {editing === a.id ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              update(a, editText);
            }}
          >
            <input
              aria-label="Edit comment"
              disabled={blocked}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <button className="primary" disabled={blocked}>
              Save comment
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <p>{a.text}</p>
        )}
        {!!a.mentions?.length && (
          <div className="mention-chips">
            {a.mentions.map((p) => (
              <span key={p} className="group-tag">
                @{p}
              </span>
            ))}
          </div>
        )}
        {isThread && !a.deleted && editing !== a.id && (
          <div className="comment-actions">
            <button
              className="plain"
              disabled={blocked}
              onClick={() => {
                setDraft({ ...emptyCommentDraft(), parentId: a.id });
              }}
            >
              Reply
            </button>
            <button
              className="plain"
              disabled={blocked}
              onClick={() => {
                setEditDraft({
                  id: a.id,
                  text: a.text.replace(/^Comment: /, ""),
                  expected: a.editedAt ?? null,
                  operationId: crypto.randomUUID(),
                });
              }}
            >
              Edit comment
            </button>
            <button
              className="plain danger"
              disabled={blocked}
              onClick={() => void remove(a)}
            >
              Delete comment
            </button>
          </div>
        )}
        {replies
          .slice()
          .reverse()
          .map((child) => render(child, depth + 1))}
      </article>
    );
  }
  return (
    <section>
      {(draftError || editError) && (
        <p role="alert" className="error">
          {draftError || editError}
        </p>
      )}
      {editDraft && !item.activity.some((a) => a.id === editDraft.id) && (
        <div className="draft-banner">
          Comment no longer available. Recovered edit: {editDraft.text}{" "}
          <button disabled={blocked} onClick={() => setEditDraft(null)}>
            Discard edit
          </button>
        </div>
      )}
      {replyTo && (
        <div className="draft-banner">
          Replying to a comment{" "}
          <button disabled={blocked} onClick={() => setReplyTo(null)}>
            Cancel reply
          </button>
        </div>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <input
          aria-label="Comment"
          placeholder="Write an update… use @ to mention"
          disabled={blocked}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button className="primary" disabled={!comment.trim() || blocked}>
          Post
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="mention-options" aria-label="Demo mention suggestions">
          {suggestions.map((p) => (
            <button
              key={p}
              disabled={blocked}
              onClick={() =>
                setComment(comment.replace(/@[^@]*$/, "@" + p + " "))
              }
            >
              @{p}
            </button>
          ))}
        </div>
      )}
      <small>
        {onCollaborate ? "Database discussion" : "Local discussion"} · mentions
        do not send notifications.
      </small>
      {!item.activity.length && (
        <p className="empty">
          No activity yet
          <br />
          <small>Updates and changes will appear here.</small>
        </p>
      )}
      {item.activity
        .filter(
          (a) => !a.parentId || !item.activity.some((p) => p.id === a.parentId),
        )
        .map((a) => render(a))}
    </section>
  );
}
