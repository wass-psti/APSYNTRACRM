import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const url = "http://127.0.0.1:4174";
const api = url + "/api/materials";
const get = async () => {
  const r = await fetch(api);
  assert.equal(r.status, 200);
  return r.json();
};
const write = async (body, status = 200) => {
  const r = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data).slice(0, 300));
  return data;
};
const check = async (name, fn) => {
  await fn();
  console.log("PASS " + name);
};
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 1630, height: 930 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const waitRow = (name) => btn(name).waitFor();
const find = async (name) =>
  (await get()).records.find((r) => r.material.name === name);
const row = (id) => page.locator('tr[data-material-id="' + id + '"]');
let id, copyId;
try {
  await page.goto(url + "/?mode=database");
  await waitRow("VFD4A8ME23ANNAA");
  await check(
    "database mode initial read, independent demo storage",
    async () => {
      assert.equal((await get()).records.length, 7);
      assert.ok(
        await page.getByText("Local database", { exact: true }).isVisible(),
      );
      await page.evaluate(() =>
        localStorage.setItem("material-sourcing.v1.items", JSON.stringify([])),
      );
      await page.reload();
      await waitRow("VFD4A8ME23ANNAA");
    },
  );
  await check(
    "create material from approved form and database price readback",
    async () => {
      await btn("Add Material").click();
      await page.getByLabel("Part number").fill("CP02-QA-MATERIAL");
      await page.getByLabel("Source type").selectOption("Import");
      await page.getByLabel("Brand").fill("QA brand");
      await page
        .getByLabel("Material description")
        .fill("QA reference material");
      await page.getByLabel("Quantity").fill("4");
      await page.getByLabel("Buying price").fill("120.36");
      await page.getByLabel(/^Currency/).selectOption("USD");
      await page.getByLabel("Shipping cost / unit").fill("20");
      await page.getByLabel("Ship. currency").selectOption("USD");
      await btn("+ Add material").click();
      await waitRow("CP02-QA-MATERIAL");
      const rec = await find("CP02-QA-MATERIAL");
      id = rec.material.id;
      assert.equal(rec.costs.totalLanded, "36184.80");
      assert.equal(rec.costs.selling, "15288.08");
      assert.ok(
        rec.material.activity.some((a) => a.text === "Material created"),
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("material-sourcing.v1.draft.database.new"),
        ),
        null,
      );
      await page.reload();
      await waitRow("CP02-QA-MATERIAL");
    },
  );
  await check("drawer edit and inline update persist", async () => {
    await btn("CP02-QA-MATERIAL").click();
    await btn("✎ Edit").click();
    await page.getByLabel("Vendor details").fill("QA persistent vendor");
    await btn("Save changes").click();
    await btn("✎ Edit").waitFor();
    assert.equal(
      (await find("CP02-QA-MATERIAL")).material.vendor,
      "QA persistent vendor",
    );
    await btn("Close details").click();
    await row(id)
      .getByRole("button", { name: "Edit Qty for CP02-QA-MATERIAL" })
      .click();
    await page.getByRole("spinbutton", { name: "Edit Qty" }).fill("5");
    await btn("Save inline edit").click();
    await page
      .getByRole("spinbutton", { name: "Edit Qty" })
      .waitFor({ state: "detached" });
    assert.equal(
      (await find("CP02-QA-MATERIAL")).costs.totalLanded,
      "45231.00",
    );
    await page.reload();
    await waitRow("CP02-QA-MATERIAL");
  });
  await check(
    "tasks, comments and stars remain usable in database mode",
    async () => {
      await row(id)
        .getByRole("button", { name: "Star CP02-QA-MATERIAL" })
        .click();
      await row(id)
        .getByRole("button", { name: "Star CP02-QA-MATERIAL" })
        .waitFor();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Star CP02-QA-MATERIAL"]')
            ?.getAttribute("aria-pressed") === "true",
      );
      await btn("CP02-QA-MATERIAL").click();
      await page.getByRole("button", { name: "Tasks" }).click();
      await page.getByLabel("Task title").fill("QA task");
      await btn("+").click();
      await btn("Working on it").waitFor();
      await btn("Working on it").click();
      await btn("Done").waitFor();
      await page.getByRole("button", { name: "Activity" }).click();
      await page.getByLabel("Comment", { exact: true }).fill("QA discussion");
      await btn("Post").click();
      await page.getByText("Comment: QA discussion", { exact: true }).waitFor();
      await btn("Reply").click();
      await page.getByLabel("Comment", { exact: true }).fill("QA reply");
      await btn("Post").click();
      await page.getByText("Comment: QA reply", { exact: true }).waitFor();
      const rec = await find("CP02-QA-MATERIAL");
      assert.equal(rec.material.starred, true);
      assert.equal(rec.material.tasks[0].status, "Done");
      assert.ok(rec.material.activity.some((a) => a.parentId));
      await btn("Close details").click();
    },
  );
  await check(
    "duplicate independent identity and group relocation",
    async () => {
      await row(id)
        .getByRole("button", { name: "Quick actions CP02-QA-MATERIAL" })
        .click();
      await btn("Quick duplicate").click();
      await page.getByRole("dialog").waitFor();
      const copies = (await get()).records.filter(
        (r) => r.material.name === "CP02-QA-MATERIAL",
      );
      assert.equal(copies.length, 2);
      const copy = copies.find((r) => r.material.id !== id);
      copyId = copy.material.id;
      assert.equal(copy.material.tasks.length, 0);
      assert.equal(copy.material.starred, false);
      assert.equal(copy.costs.totalLanded, "45231.00");
      await btn("⇄ Quotation").click();
      await page
        .getByRole("dialog")
        .getByText("Items for Quotation", { exact: true })
        .waitFor();
      assert.equal(
        (await get()).records.find((r) => r.material.id === copyId).material
          .group,
        "Items for Quotation",
      );
      await btn("Close details").click();
    },
  );
  await check("archive and undo persist with same identity", async () => {
    await row(copyId)
      .getByRole("button", { name: "Quick actions CP02-QA-MATERIAL" })
      .click();
    page.once("dialog", (d) => d.accept());
    await btn("Remove material").click();
    await row(copyId).waitFor({ state: "detached" });
    assert.ok(!(await get()).records.some((r) => r.material.id === copyId));
    await page.reload();
    await btn("Undo").waitFor();
    await btn("Undo").click();
    await row(copyId).waitFor();
    assert.ok((await get()).records.some((r) => r.material.id === copyId));
    await page.reload();
    await row(copyId).waitFor();
  });
  await check("stale revision and atomic batch rollback", async () => {
    const original = (await get()).records.find((r) => r.material.id === id);
    await write({
      action: "update",
      items: [
        {
          material: { ...original.material, vendor: "QA concurrent change" },
          revision: original.revision,
        },
      ],
    });
    await write(
      {
        action: "update",
        items: [
          {
            material: { ...original.material, vendor: "stale" },
            revision: original.revision,
          },
        ],
      },
      409,
    );
    assert.equal(
      (await get()).records.find((r) => r.material.id === id).material.vendor,
      "QA concurrent change",
    );
    const good = {
      ...original.material,
      id: "cp02-atomic-a",
      name: "CP02 atomic valid",
      tasks: [],
      activity: [],
    };
    const bad = { ...good, id: "cp02-atomic-z", quantity: 0 };
    await write({ action: "create", items: [good, bad] }, 400);
    assert.ok(!(await get()).records.some((r) => r.material.id === good.id));
    await page.reload();
    await row(id).waitFor();
  });
  await check(
    "bulk import, bulk source and group changes, archive restore",
    async () => {
      await btn("Bulk Import").click();
      await page
        .getByLabel("Paste material rows")
        .fill(
          "CP02-BULK-A\tRelay\tQA\tLocal\t2\t100\tPHP\nCP02-BULK-B\tSwitch\tQA\tImport\t3\t10\tUSD",
        );
      await btn("Import 2 rows").click();
      await waitRow("CP02-BULK-A");
      await waitRow("CP02-BULK-B");
      const a = await find("CP02-BULK-A"),
        b = await find("CP02-BULK-B");
      assert.ok(a && b);
      await row(a.material.id).getByRole("checkbox").check();
      await row(b.material.id).getByRole("checkbox").check();
      await btn("Move to Quotation").click();
      await page.getByText("2 material(s) updated", { exact: false }).waitFor();
      assert.equal(
        (await find("CP02-BULK-A")).material.group,
        "Items for Quotation",
      );
      assert.equal(
        (await find("CP02-BULK-B")).material.group,
        "Items for Quotation",
      );
      await row(a.material.id).getByRole("checkbox").check();
      await row(b.material.id).getByRole("checkbox").check();
      await page
        .locator(".bulkbar")
        .getByRole("button", { name: "Local", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector(".bulkbar") === null,
      );
      assert.equal((await find("CP02-BULK-B")).material.source, "Local");
      await row(a.material.id).getByRole("checkbox").check();
      await row(b.material.id).getByRole("checkbox").check();
      page.once("dialog", (d) => d.accept());
      await page
        .locator(".bulkbar")
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await row(a.material.id).waitFor({ state: "detached" });
      assert.equal(await find("CP02-BULK-A"), undefined);
      assert.equal(await find("CP02-BULK-B"), undefined);
      await btn("Undo").click();
      await waitRow("CP02-BULK-A");
      await waitRow("CP02-BULK-B");
    },
  );
  await check(
    "stale recovered edit cannot overwrite committed revision",
    async () => {
      await row(id)
        .getByRole("button", { name: "CP02-QA-MATERIAL", exact: true })
        .click();
      await btn("✎ Edit").click();
      await page.getByLabel("Vendor details").fill("Unsaved stale draft");
      const current = (await get()).records.find((r) => r.material.id === id);
      await write({
        action: "update",
        items: [
          {
            material: { ...current.material, vendor: "New committed value" },
            revision: current.revision,
          },
        ],
      });
      await page.reload();
      await row(id)
        .getByRole("button", { name: "CP02-QA-MATERIAL", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Vendor details").inputValue(),
        "Unsaved stale draft",
      );
      await btn("Save changes").click();
      await page
        .getByRole("dialog")
        .getByText(/Material changed since it was loaded/)
        .waitFor();
      assert.equal(
        (await get()).records.find((r) => r.material.id === id).material.vendor,
        "New committed value",
      );
      assert.equal(
        await page.getByLabel("Vendor details").inputValue(),
        "Unsaved stale draft",
      );
      await btn("Cancel").click();
      await btn("Close details").click();
      await btn("Retry database").click();
      await page.getByText("Database refreshed", { exact: false }).waitFor();
    },
  );
  await check(
    "malformed requests and precision overflow are rejected",
    async () => {
      await write(
        { action: "update", items: [{ material: null, revision: "invalid" }] },
        400,
      );
      const current = (await get()).records.find((r) => r.material.id === id);
      await write(
        {
          action: "update",
          items: [
            {
              material: { ...current.material, buyingPrice: 1.1234567 },
              revision: current.revision,
            },
          ],
        },
        400,
      );
      assert.equal(
        (await get()).records.find((r) => r.material.id === id).material
          .buyingPrice,
        current.material.buyingPrice,
      );
    },
  );
  await check(
    "failed save retains draft, retry after connection recovery",
    async () => {
      await btn("Add Material").click();
      await page.getByLabel("Part number").fill("CP02-QA-RECOVER");
      await page.getByLabel("Source type").selectOption("Local");
      await page.getByLabel("Brand").fill("QA brand");
      await page.getByLabel("Material description").fill("QA recovery");
      await page.getByLabel("Quantity").fill("1");
      await page.getByLabel("Buying price").fill("10.075");
      await page.route("**/api/materials", (route) =>
        route.request().method() === "POST" ? route.abort() : route.continue(),
      );
      await btn("+ Add material").click();
      await page
        .getByText(
          "Save not confirmed. Your input is retained. Review database state before retrying.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page.getByLabel("Part number").inputValue(),
        "CP02-QA-RECOVER",
      );
      assert.ok(
        await page.evaluate(() =>
          localStorage.getItem("material-sourcing.v1.draft.database.new"),
        ),
      );
      assert.equal(await find("CP02-QA-RECOVER"), undefined);
      await page.unroute("**/api/materials");
      await btn("Retry database").click();
      await page.getByText("Database refreshed", { exact: false }).waitFor();
      await btn("+ Add material").click();
      await waitRow("CP02-QA-RECOVER");
      assert.equal((await find("CP02-QA-RECOVER")).costs.php, "10.08");
    },
  );
  await check("initial outage no silent demo fallback", async () => {
    await page.route("**/api/materials", (route) => route.abort());
    await page.reload();
    await btn("Retry database").waitFor();
    assert.equal(await page.locator("tr[data-material-id]").count(), 0);
    await page.unroute("**/api/materials");
    await btn("Retry database").click();
    await waitRow("CP02-QA-RECOVER");
  });
  await check("database mode mobile layout and record readback", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await waitRow("CP02-QA-RECOVER");
    await btn("CP02-QA-RECOVER").click();
    assert.equal(
      Math.round(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.getBoundingClientRect().width),
      ),
      390,
    );
    await btn("Close details").click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
  });
  assert.deepEqual(errors, []);
  console.log("PASS no uncaught browser exceptions");
} finally {
  await browser.close();
}
