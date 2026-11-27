import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { readSheet } from "read-excel-file/node";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1630, height: 930 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = process.env.APP_URL || "http://127.0.0.1:5173/";
const button = (name) => page.getByRole("button", { name, exact: true });
const row = (name) =>
  page.locator("tr[data-material-id]").filter({ has: button(name) });
const check = async (name, fn) => {
  await fn();
  console.log("PASS " + name);
};
const stored = (key) =>
  page.evaluate(
    (k) => JSON.parse(localStorage.getItem("material-sourcing.v1." + k)),
    key,
  );
try {
  await page.goto(url);
  await button("VFD4A8ME23ANNAA").waitFor();
  await check("multi-sort and column order persistence", async () => {
    await page.getByRole("button", { name: "Brand", exact: true }).click();
    await page
      .getByRole("button", { name: "Qty", exact: true })
      .click({ modifiers: ["Shift"] });
    assert.deepEqual(await stored("sort"), [
      { key: "brand", asc: true },
      { key: "quantity", asc: true },
    ]);
    await page.reload();
    await button("Clear sort").waitFor();
    assert.deepEqual(await stored("sort"), [
      { key: "brand", asc: true },
      { key: "quantity", asc: true },
    ]);
    await button("Clear sort").click();
    await page.getByRole("button", { name: /Columns \(/ }).click();
    await button("Move Brand left").click();
    const order = await stored("columns");
    assert.ok(order.indexOf("brand") < order.indexOf("description"));
    await page.getByRole("button", { name: /Columns \(/ }).click();
    const handle = page.getByRole("separator", { name: "Resize Part number" });
    await handle.focus();
    await handle.press("ArrowRight");
    assert.equal((await stored("widths")).name, 230);
    await page.reload();
    await button("VFD4A8ME23ANNAA").waitFor();
    assert.equal((await stored("widths")).name, 230);
    assert.deepEqual(await stored("columns"), order);
    const actual = await page
      .locator("th.sticky-name")
      .evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(Math.abs(actual - 230) < 2, "width " + actual);
  });
  await check("pointer resize, drag reorder and group order", async () => {
    const handle = page.getByRole("separator", { name: "Resize Part number" });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    assert.equal((await stored("widths")).name, 255);
    await page
      .getByRole("button", { name: "Created", exact: true })
      .dragTo(
        page.getByRole("button", {
          name: "Selling price (VAT-ex)",
          exact: true,
        }),
      );
    assert.ok(
      (await stored("columns")).indexOf("created") >
        (await stored("columns")).indexOf("selling"),
    );
    await button("Move Engineering Services down").click();
    assert.equal((await stored("group-order"))[0], "Items for Quotation");
    await page.reload();
    assert.ok(
      (await page.locator(".group-row").first().innerText())
        .toLowerCase()
        .includes("items for quotation"),
    );
    await button("Move Items for Quotation down").click();
    assert.equal((await stored("group-order"))[0], "Engineering Services");
  });
  await check(
    "keyboard command palette and fuzzy material search",
    async () => {
      await page.keyboard.press("Control+k");
      await page.getByRole("dialog", { name: "Command palette" }).waitFor();
      const query = page.getByLabel("Search commands or materials");
      await query.fill("ME300 Delta");
      await query.press("Enter");
      await page.getByRole("dialog").waitFor();
      assert.ok(
        (await page.getByRole("dialog").innerText()).includes(
          "VFD4A8ME23ANNAA",
        ),
      );
      await button("Close details").click();
      await page.keyboard.press("Control+k");
      await page.getByLabel("Search commands or materials").fill("theme");
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "dark",
      );
      await button("Toggle theme").click();
    },
  );
  await check(
    "inline editing, validation and keyboard navigation",
    async () => {
      const material = row("VFD4A8ME23ANNAA");
      const edit = material.getByRole("button", {
        name: "Edit Qty for VFD4A8ME23ANNAA",
      });
      await edit.focus();
      await edit.click();
      await page.getByRole("spinbutton", { name: "Edit Qty" }).fill("0");
      await button("Save inline edit").click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Quantity must be greater than zero" })
        .waitFor();
      await page.getByRole("spinbutton", { name: "Edit Qty" }).fill("5");
      await button("Save inline edit").click();
      assert.equal(
        (await stored("items")).find((x) => x.id === "demo-0").quantity,
        5,
      );
      await button("VFD4A8ME23ANNAA").focus();
      await button("VFD4A8ME23ANNAA").press("ArrowDown");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "6ES7131-4BB01-0AB0",
      );
      await page.keyboard.press("F2");
      await page.getByRole("textbox", { name: "Edit Part number" }).waitFor();
      await page.keyboard.press("Escape");
      await page.reload();
      assert.equal(
        (await stored("items")).find((x) => x.id === "demo-0").quantity,
        5,
      );
    },
  );
  await check("quick actions and undo", async () => {
    await button("Quick actions VFD4A8ME23ANNAA").click();
    await button("Quick duplicate").click();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      (await stored("items")).filter((i) => i.name === "VFD4A8ME23ANNAA")
        .length,
      2,
    );
    page.once("dialog", (d) => d.accept());
    await button("Delete").click();
    await button("Undo").click();
    assert.equal(
      (await stored("items")).filter((i) => i.name === "VFD4A8ME23ANNAA")
        .length,
      2,
    );
    await page
      .locator("tr[data-material-id]")
      .filter({ has: button("VFD4A8ME23ANNAA") })
      .first()
      .getByRole("button", { name: "Quick actions VFD4A8ME23ANNAA" })
      .click();
    await button("Move group").click();
    assert.equal(
      (await stored("items")).filter(
        (i) =>
          i.name === "VFD4A8ME23ANNAA" && i.group === "Items for Quotation",
      ).length,
      1,
    );
  });
  await check("new material draft recovery and discard", async () => {
    await button("Add Material").click();
    await page.getByLabel("Part number").fill("UNSAVED-DRAFT");
    await page.getByLabel("Brand").fill("QA Brand");
    await page.reload();
    await button("Add Material").click();
    assert.equal(
      await page.getByLabel("Part number").inputValue(),
      "UNSAVED-DRAFT",
    );
    assert.equal(await page.getByLabel("Brand").inputValue(), "QA Brand");
    await button("Discard draft").first().click();
    assert.equal(await page.getByLabel("Part number").inputValue(), "");
    await button("All Items").click();
  });
  await check("drawer draft recovery, save and clear", async () => {
    await page
      .locator('tr[data-material-id="demo-0"]')
      .getByRole("button", { name: "VFD4A8ME23ANNAA", exact: true })
      .click();
    await button("✎ Edit").click();
    await page
      .getByLabel("Vendor details", { exact: true })
      .fill("Recovered supplier");
    await page.reload();
    await page
      .locator('tr[data-material-id="demo-0"]')
      .getByRole("button", { name: "VFD4A8ME23ANNAA", exact: true })
      .click();
    await page.getByLabel("Vendor details", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Vendor details", { exact: true }).inputValue(),
      "Recovered supplier",
    );
    await button("Save changes").click();
    assert.equal(await stored("draft.demo-0"), null);
    assert.equal(
      (await stored("items")).find((i) => i.id === "demo-0").vendor,
      "Recovered supplier",
    );
  });
  await check(
    "thread replies, mentions, editing and deletion persistence",
    async () => {
      await page.getByRole("button", { name: "Activity" }).click();
      await page.getByLabel("Comment", { exact: true }).fill("@Proc");
      await button("@Procurement team").click();
      await page.getByLabel("Comment", { exact: true }).press("End");
      await page
        .getByLabel("Comment", { exact: true })
        .pressSequentially("Check RFQ");
      await button("Post").click();
      await button("Reply").click();
      await page.getByLabel("Comment", { exact: true }).fill("Reply QA");
      await button("Post").click();
      assert.equal(await page.locator(".thread-reply").count(), 1);
      await page
        .locator(".thread-reply")
        .getByRole("button", { name: "Edit comment" })
        .click();
      await page.getByLabel("Edit comment").fill("Edited reply");
      await button("Save comment").click();
      await page
        .locator(".activity")
        .filter({ hasText: "Check RFQ" })
        .first()
        .getByRole("button", { name: "Delete comment" })
        .first()
        .click();
      assert.ok(
        (await page.locator(".thread-reply").innerText()).includes(
          "Edited reply",
        ),
      );
      await page.reload();
      await page
        .locator('tr[data-material-id="demo-0"]')
        .getByRole("button", { name: "VFD4A8ME23ANNAA", exact: true })
        .click();
      await page.getByRole("button", { name: "Activity" }).click();
      assert.ok(
        (await page.locator(".thread-reply").innerText()).includes(
          "Edited reply",
        ),
      );
      const activity = (await stored("items")).find(
        (i) => i.id === "demo-0",
      ).activity;
      assert.ok(activity.some((a) => a.deleted && a.kind === "comment"));
      assert.ok(activity.some((a) => a.parentId && a.editedAt));
      await button("Close details").click();
    },
  );
  await check("native XLSX download readback and numeric summary", async () => {
    await page
      .locator('tr[data-material-id="demo-0"]')
      .getByRole("checkbox")
      .check();
    const pending = page.waitForEvent("download");
    await button("Excel").click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "material-sourcing.xlsx");
    const file = await download.path();
    const rows = await readSheet(file, "Materials");
    const summary = await readSheet(file, "Summary");
    assert.equal(rows.length, 2);
    assert.equal(rows[1][rows[0].indexOf("Total landed")], 45231);
    assert.equal(
      summary.find((r) => r[0] === "Total landed buying (PHP)")[1],
      45231,
    );
    assert.equal(
      summary.find((r) => r[0] === "Total VAT-in (PHP, known sources)")[1],
      85613.25,
    );
  });
  await check("native PDF download and computed totals", async () => {
    await button("PDF").waitFor();
    const pending = page.waitForEvent("download");
    await button("PDF").click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "material-sourcing.pdf");
    const data = await readFile(await download.path());
    assert.ok(data.subarray(0, 5).toString() === "%PDF-");
    const text = data.toString("latin1");
    assert.ok(text.includes("45,231.00") && text.includes("85,613.25"));
    assert.ok(text.includes("VFD4A8ME23ANNAA"));
    assert.ok(text.includes("Records: 1 |"));
    await download.saveAs("tests/catalog-preview.pdf");
    await button("Clear").click();
  });
  await check(
    "5,000-record virtual scrolling and filter integrity",
    async () => {
      await page.evaluate(() => {
        const key = "material-sourcing.v1.items",
          template = JSON.parse(localStorage.getItem(key))[0];
        const rows = Array.from({ length: 5000 }, (_, i) => ({
          ...template,
          id: "qa-" + i,
          name: "QA-" + String(i).padStart(5, "0"),
          description: "Synthetic material " + i,
          group: i < 2500 ? "Engineering Services" : "Items for Quotation",
          source: i % 2 ? "Local" : "Import",
          quantity: i + 1,
          activity: [],
          tasks: [],
          starred: false,
        }));
        localStorage.setItem(key, JSON.stringify(rows));
        localStorage.setItem("material-sourcing.v1.sort", "[]");
        localStorage.setItem(
          "material-sourcing.v1.group-order",
          JSON.stringify(["Engineering Services", "Items for Quotation"]),
        );
      });
      const start = performance.now();
      await page.reload();
      await button("QA-00000").waitFor();
      const ready = performance.now() - start;
      const scroller = page.locator(".windowed");
      const first = await page.locator("tr[data-material-id]").count();
      assert.ok(first < 50, "initial rendered rows " + first);
      await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await button("QA-04999").waitFor();
      const last = await page.locator("tr[data-material-id]").count();
      assert.ok(last < 50, "end rendered rows " + last);
      assert.ok(await button("QA-04999").isVisible());
      await scroller.evaluate((el) => (el.scrollTop = 0));
      await button("QA-00000").waitFor();
      await page
        .getByLabel("Search materials", { exact: true })
        .fill("QA-04999");
      await button("QA-04999").waitFor();
      assert.equal(await page.locator("tr[data-material-id]").count(), 1);
      await page.getByLabel("Search materials", { exact: true }).fill("");
      await button("QA-00000").waitFor();
      await page.getByLabel("Select all matching materials").check();
      assert.equal(
        await page.locator(".bulkbar b").innerText(),
        "5000 selected",
      );
      await button("Clear").click();
      console.log(
        "METRIC records=5000 initialDOM=" +
          first +
          " endDOM=" +
          last +
          " reloadToFirstRowMs=" +
          Math.round(ready),
      );
      await page.screenshot({ path: "tests/advanced-desktop-preview.png" });
    },
  );
  await check(
    "large XLSX full dataset readback and multi-page PDF",
    async () => {
      const start = performance.now();
      let pending = page.waitForEvent("download");
      await button("Excel").click();
      let download = await pending;
      const rows = await readSheet(await download.path(), "Materials");
      assert.equal(rows.length, 5001);
      assert.equal(rows[5000][rows[0].indexOf("Part number")], "QA-04999");
      console.log(
        "METRIC XLSX_5000_download_and_readback_ms=" +
          Math.round(performance.now() - start),
      );
      await page.getByLabel("Search materials", { exact: true }).fill("QA-000");
      pending = page.waitForEvent("download");
      await button("PDF").click();
      download = await pending;
      const raw = (await readFile(await download.path())).toString("latin1");
      assert.ok(raw.includes("Records: 100 |"));
      const pages = raw.match(/\/Type \/Page\b/g) || [];
      assert.ok(pages.length > 1, "Expected multiple PDF pages");
      assert.ok(raw.includes("QA-00000") && raw.includes("QA-00099"));
      console.log("METRIC PDF_100_records_pages=" + pages.length);
      await page.getByLabel("Search materials", { exact: true }).fill("");
      await button("QA-00000").waitFor();
    },
  );
  await check("mobile virtual table and drawer", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await button("QA-00000").click();
    assert.equal(
      Math.round(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.getBoundingClientRect().width),
      ),
      390,
    );
    await button("Close details").click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
  });
  assert.deepEqual(errors, []);
  console.log("PASS no uncaught advanced browser errors");
} finally {
  await browser.close();
}
