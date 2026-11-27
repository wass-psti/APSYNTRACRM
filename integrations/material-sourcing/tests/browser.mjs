import assert from "node:assert/strict";
import { chromium } from "playwright-core";

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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const check = async (name, fn) => {
  await fn();
  console.log("PASS " + name);
};
try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
  await check("dashboard + initial table", async () => {
    await page
      .getByRole("heading", { name: "Material Sourcing", exact: true })
      .waitFor();
    await button("VFD4A8ME23ANNAA").waitFor();
    assert.equal(await page.locator(".metric").count(), 7);
    assert.equal(await page.locator("tbody tr:not(.group-row)").count(), 7);
    await page.screenshot({ path: "tests/desktop-preview.png" });
  });
  await check("filter and detail calculation", async () => {
    await page.getByLabel("Search materials", { exact: true }).fill("ME300");
    assert.equal(await page.locator("tbody tr:not(.group-row)").count(), 1);
    await button("VFD4A8ME23ANNAA").click();
    await page.getByRole("dialog").waitFor();
    assert.ok(
      (await page.getByRole("dialog").innerText()).includes("36,184.80"),
    );
    await page.screenshot({ path: "tests/detail-preview.png" });
  });
  await check("edit, task and activity", async () => {
    await button("✎ Edit").click();
    await page
      .getByLabel("Vendor details", { exact: true })
      .fill("QA supplier");
    await button("Save changes").click();
    await page.getByRole("button", { name: "Tasks" }).click();
    await page.getByLabel("Task title").fill("Check RFQ");
    await button("+").click();
    await button("Working on it").click();
    await button("Done").waitFor();
    await page.getByRole("button", { name: "Activity" }).click();
    await page.getByLabel("Comment", { exact: true }).fill("QA update");
    await button("Post").click();
    assert.ok(
      (await page.getByRole("dialog").innerText()).includes("QA update"),
    );
    await button("Close details").click();
  });
  await check("persistence after refresh", async () => {
    await page.reload();
    await button("VFD4A8ME23ANNAA").click();
    assert.ok(
      (await page.getByRole("dialog").innerText()).includes("QA supplier"),
    );
    await page.getByRole("button", { name: "Tasks" }).click();
    await button("Done").waitFor();
    await button("Close details").click();
  });
  await check("add material", async () => {
    await button("Add Material").click();
    await page.getByLabel("Part number").fill("QA-001");
    await page.getByLabel("Source type").selectOption("Local");
    await page.getByLabel("Brand").fill("QA brand");
    await page.getByLabel("Material description").fill("QA control relay");
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Buying price").fill("100");
    await button("+ Add material").click();
    await button("QA-001").waitFor();
  });
  await check("bulk import, selection and undo", async () => {
    await button("Bulk Import").click();
    await button("Use example").click();
    await button("Import 1 rows").click();
    await button("PART-001").waitFor();
    await page.getByLabel("Select PART-001", { exact: true }).check();
    await button("Move to Quotation").click();
    await page.getByLabel("Select PART-001", { exact: true }).check();
    page.once("dialog", (d) => d.accept());
    await button("Remove").click();
    assert.equal(await button("PART-001").count(), 0);
    await button("Undo").click();
    await button("PART-001").waitFor();
  });
  await check("CSV export and dark theme", async () => {
    const downloadPromise = page.waitForEvent("download");
    await button("Excel CSV").click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "material-sourcing.csv");
    await button("Toggle theme").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  });
  await check("mobile viewport and drawer", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await button("QA-001").click();
    await page.getByRole("dialog").waitFor();
    const width = await page
      .getByRole("dialog")
      .evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(width <= 390);
    await page.screenshot({ path: "tests/mobile-preview.png" });
    await button("Close details").click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
  });
  assert.deepEqual(errors, []);
  console.log("PASS no uncaught browser errors");
} finally {
  await browser.close();
}
