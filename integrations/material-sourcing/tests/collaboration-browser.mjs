import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
const url = "http://127.0.0.1:4174",
  api = url + "/api/materials";
const get = async () => {
  const r = await fetch(api);
  assert.equal(r.status, 200);
  return r.json();
};
const send = async (cmd, expected = 200) => {
  const r = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data).slice(0, 200));
  return data;
};
const check = async (name, fn) => {
  await fn();
  console.log("PASS " + name);
};
const initial = (await get()).records[0],
  id = initial.material.id;
const other = (await get()).records[1].material.id;
const command = (change, materialId = id, operationId = randomUUID()) => ({
  action: "collaborate",
  materialId,
  operationId,
  change,
});
const current = async () =>
  (await get()).records.find((r) => r.material.id === id);
const taskA = randomUUID(),
  taskB = randomUUID(),
  root = randomUUID(),
  replyA = randomUUID(),
  replyB = randomUUID();
await check(
  "simultaneous task additions and same-operation replay",
  async () => {
    const a = command({
      kind: "task.add",
      id: taskA,
      title: "CP04 parallel A",
    });
    const b = command({
      kind: "task.add",
      id: taskB,
      title: "CP04 parallel B",
    });
    await Promise.all([send(a), send(b), send(a)]);
    const tasks = (await current()).material.tasks;
    assert.equal(tasks.filter((t) => [taskA, taskB].includes(t.id)).length, 2);
    const activity = (await current()).material.activity;
    assert.equal(
      activity.filter((a) => a.text === "Task added: CP04 parallel A").length,
      1,
    );
    await send({ ...a, change: { ...a.change, title: "Changed replay" } }, 409);
    await send({ ...a, materialId: other }, 409);
  },
);
await check("task reorder, transitions and stale state rejection", async () => {
  let tasks = (await current()).material.tasks;
  const order = tasks.map((t) => t.id);
  await send(
    command({
      kind: "task.reorder",
      expected: order,
      order: [...order].reverse(),
    }),
  );
  assert.deepEqual(
    (await current()).material.tasks.map((t) => t.id),
    [...order].reverse(),
  );
  await send(command({ kind: "task.reorder", expected: order, order }), 409);
  await send(
    command({
      kind: "task.status",
      id: taskA,
      expected: "Working on it",
      status: "Done",
    }),
  );
  await send(
    command({
      kind: "task.status",
      id: taskA,
      expected: "Working on it",
      status: "Stuck",
    }),
    409,
  );
  await send(
    command({
      kind: "task.status",
      id: taskA,
      expected: "Done",
      status: "Stuck",
    }),
  );
  await send(
    command({
      kind: "task.status",
      id: taskA,
      expected: "Stuck",
      status: "Working on it",
    }),
  );
  await send(
    command({ kind: "task.remove", id: taskB, expected: "Working on it" }),
  );
  assert.ok(!(await current()).material.tasks.some((t) => t.id === taskB));
});
await check("parallel threaded replies and server attribution", async () => {
  const rootCommand = command({
    kind: "comment.add",
    id: root,
    text: "CP04 root",
    parentId: null,
    mentions: ["Procurement team"],
  });
  await send(rootCommand);
  await Promise.all([
    send(
      command({
        kind: "comment.add",
        id: replyA,
        text: "CP04 reply A",
        parentId: root,
        mentions: [],
      }),
    ),
    send(
      command({
        kind: "comment.add",
        id: replyB,
        text: "CP04 reply B",
        parentId: root,
        mentions: [],
      }),
    ),
  ]);
  const a = (await current()).material.activity;
  assert.equal(a.filter((x) => x.parentId === root).length, 2);
  assert.equal(a.find((x) => x.id === root).authorRef, "local-development");
  assert.ok(Number.isFinite(Date.parse(a.find((x) => x.id === root).at)));
  await send(
    command(
      {
        kind: "comment.add",
        id: randomUUID(),
        text: "invalid cross link",
        parentId: root,
        mentions: [],
      },
      other,
    ),
    409,
  );
  await send(
    command({
      kind: "comment.add",
      id: randomUUID(),
      text: "invalid missing link",
      parentId: randomUUID(),
      mentions: [],
    }),
    409,
  );
});
await check(
  "competing edit revisions, deletion tombstone and reply retention",
  async () => {
    const first = command({
      kind: "comment.edit",
      id: root,
      expected: null,
      text: "CP04 revised",
      mentions: [],
    });
    await send(first);
    await send(first);
    await send(
      command({
        kind: "comment.edit",
        id: root,
        expected: null,
        text: "stale replacement",
        mentions: [],
      }),
      409,
    );
    let a = (await current()).material.activity.find((x) => x.id === root);
    assert.equal(a.text, "Comment: CP04 revised");
    assert.ok(a.editedAt);
    await send(
      command({ kind: "comment.remove", id: root, expected: a.editedAt }),
    );
    const activity = (await current()).material.activity;
    assert.ok(activity.find((x) => x.id === root).deleted);
    assert.equal(activity.filter((x) => x.parentId === root).length, 2);
    await send(
      command({
        kind: "comment.edit",
        id: root,
        expected: a.editedAt,
        text: "resurrection",
        mentions: [],
      }),
      409,
    );
  },
);
await check(
  "ordinary stale relation arrays cannot erase or forge activity",
  async () => {
    const before = await current();
    await send({
      action: "update",
      items: [
        {
          material: {
            ...before.material,
            tasks: [],
            activity: [
              {
                id: randomUUID(),
                text: "CP04 forged event",
                at: "2000-01-01T00:00:00Z",
              },
            ],
            vendor: "CP04 material edit",
          },
          revision: before.revision,
        },
      ],
    });
    const after = await current();
    assert.deepEqual(after.material.tasks, before.material.tasks);
    assert.equal(
      after.material.activity.filter((a) => a.parentId === root).length,
      2,
    );
    assert.ok(
      !after.material.activity.some((a) => a.text === "CP04 forged event"),
    );
    assert.deepEqual(after.costs, before.costs);
  },
);
await check(
  "archived material rejects collaboration and rejected mutations are atomic",
  async () => {
    const rec = await current();
    const archived = await send({
      action: "archive",
      items: [{ id, revision: rec.revision }],
    });
    await send(
      command({
        kind: "task.add",
        id: randomUUID(),
        title: "not allowed while archived",
      }),
      409,
    );
    await send({ action: "restore", items: archived.archived });
    const after = await current();
    assert.ok(
      !after.material.tasks.some(
        (t) => t.title === "not allowed while archived",
      ),
    );
  },
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1630, height: 930 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (n) => page.getByRole("button", { name: n, exact: true });
const dialog = () => page.getByRole("dialog");
const name = initial.material.name;
async function open(tab) {
  await page.goto(url + "/?mode=database");
  await button(name).click();
  await page.getByRole("button", { name: tab }).click();
}
try {
  await check(
    "task draft survives reload and failed acknowledgement retries exactly once",
    async () => {
      await open("Tasks");
      await page.getByLabel("Task title").fill("CP04 recovered task");
      await open("Tasks");
      assert.equal(
        await page.getByLabel("Task title").inputValue(),
        "CP04 recovered task",
      );
      // Commit on the server, then discard the HTTP acknowledgement.
      await page.route("**/api/materials", async (route) => {
        if (route.request().method() === "POST") {
          await route.fetch();
          await route.abort();
        } else await route.continue();
      });
      await button("+").click();
      await dialog().getByRole("alert").waitFor();
      assert.equal(
        await page.getByLabel("Task title").inputValue(),
        "CP04 recovered task",
      );
      await page.unroute("**/api/materials");
      await open("Tasks");
      await button("+").click();
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Task title"]').value === "",
      );
      assert.equal(
        (await current()).material.tasks.filter(
          (t) => t.title === "CP04 recovered task",
        ).length,
        1,
      );
    },
  );
  await check("task ordering via browser persists across reload", async () => {
    const before = (await current()).material.tasks.map((t) => t.id);
    await page
      .getByRole("button", { name: "Move task up CP04 recovered task" })
      .click();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Task title"]').disabled,
    );
    const after = (await current()).material.tasks.map((t) => t.id);
    assert.notDeepEqual(after, before);
    await open("Tasks");
    const ui = await page.locator(".task > span").allTextContents();
    assert.deepEqual(
      ui,
      (await current()).material.tasks.map((t) => t.title),
    );
  });
  await check(
    "comment draft, reply target and edit draft survive refresh",
    async () => {
      await open("Activity");
      await page.getByLabel("Comment", { exact: true }).fill("CP04 root draft");
      await open("Activity");
      assert.equal(
        await page.getByLabel("Comment", { exact: true }).inputValue(),
        "CP04 root draft",
      );
      await button("Post").click();
      await page
        .getByText("Comment: CP04 root draft", { exact: true })
        .waitFor();
      const article = page
        .locator("article.activity")
        .filter({
          has: page.getByText("Comment: CP04 root draft", { exact: true }),
        });
      await article.getByRole("button", { name: "Reply", exact: true }).click();
      await page
        .getByLabel("Comment", { exact: true })
        .fill("CP04 recovered reply");
      await open("Activity");
      assert.equal(
        await page.getByLabel("Comment", { exact: true }).inputValue(),
        "CP04 recovered reply",
      );
      await page.getByText("Replying to a comment", { exact: false }).waitFor();
      await button("Post").click();
      await page
        .getByText("Comment: CP04 recovered reply", { exact: true })
        .waitFor();
      const child = page
        .locator("article.thread-reply")
        .filter({
          has: page.getByText("Comment: CP04 recovered reply", { exact: true }),
        });
      await child
        .getByRole("button", { name: "Edit comment", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Edit comment", exact: true })
        .fill("CP04 recovered edit");
      await open("Activity");
      assert.equal(
        await page
          .getByRole("textbox", { name: "Edit comment", exact: true })
          .inputValue(),
        "CP04 recovered edit",
      );
      await button("Save comment").click();
      await page
        .getByText("Comment: CP04 recovered edit", { exact: true })
        .waitFor();
      assert.ok(
        (await current()).material.activity.some(
          (a) =>
            a.text === "Comment: CP04 recovered edit" &&
            a.parentId &&
            a.editedAt,
        ),
      );
    },
  );
  assert.deepEqual(errors, []);
  console.log("PASS no uncaught collaboration browser errors");
} finally {
  await browser.close();
}
