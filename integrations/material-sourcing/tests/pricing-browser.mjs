import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { readSheet } from "read-excel-file/node";
import Decimal from "decimal.js";
import {
  previewCosts,
  committedCosts,
  money,
  exactSum,
} from "../src/utils/material.ts";
import { sortMaterials } from "../src/utils/columns.ts";
const database = process.env.MS_LOCAL_DATABASE;
assert.match(database ?? "", /^ms_cp02_test_\d+$/);
const sql = (q) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_material-sourcing-local",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: q, encoding: "utf8" },
  ).trim();
const url = "http://127.0.0.1:4174",
  api = url + "/api/materials";
const get = async () => {
  const r = await fetch(api);
  assert.equal(r.status, 200);
  return r.json();
};
const post = async (command, status = 200) => {
  const r = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await r.json();
  assert.equal(r.status, status, JSON.stringify(body).slice(0, 250));
  return body;
};
const initial = await get();
assert.equal(initial.records.length, 7);
const old = initial.records[0];
sql(`
insert into material_sourcing.fx_snapshots(id,usd,eur,observed_at,provider,is_demo) values ('cp03-fx',65.12345678,72.98765432,now()+interval '1 day','CP03 synthetic',true);
insert into material_sourcing.materials(id,group_id,part_number,source_type,description,brand,quantity,buying_price,currency,shipping_cost,shipping_currency,fx_snapshot_id)
select 'cp03-'||s||'-'||c||'-'||h||'-'||v,'new_group','CP03-'||s||'-'||c||'-'||h||'-'||v,s,'Pricing matrix','Test',q,b,c,p,h,'cp03-fx'
from unnest(array['Local','Import','Unknown']) s cross join unnest(array['PHP','USD','EUR']) c cross join unnest(array['PHP','USD','EUR']) h
cross join (values ('a',1.234567::numeric,10.075::numeric,0.005::numeric),('b',0.000001,0.005,0.015),('c',4.5,0,0)) x(v,q,b,p);
insert into material_sourcing.materials(id,group_id,part_number,source_type,description,brand,quantity,buying_price,currency,shipping_cost,shipping_currency,fx_snapshot_id)
values ('cp03-extreme','new_group','CP03-EXTREME','Local','Precision fixture','Test',2.000001,99999999999999.999999,'PHP',0,'PHP','cp03-fx');
`);
let data = await get();
assert.equal(data.reference.id, "cp03-fx");
const matrix = data.records.filter(
  (r) => r.material.id.startsWith("cp03-") && r.material.id !== "cp03-extreme",
);
assert.equal(matrix.length, 81);
for (const r of matrix) {
  const m = { ...r.material, decimalInputs: r.inputs, savedCosts: r.costs };
  assert.deepEqual(previewCosts(m), r.costs, r.material.id);
  if (m.source === "Unknown") {
    assert.equal(r.costs.selling, null);
    assert.equal(r.costs.vatIn, null);
  }
}
console.log(
  "PASS 81 matrix cases (9 currency pairs x 3 sources x 3 boundary sets)",
);
const extreme = data.records.find((r) => r.material.id === "cp03-extreme");
assert.equal(extreme.inputs.buyingPrice, "99999999999999.999999");
assert.equal(extreme.costs.totalLanded, "200000100000000.00");
assert.deepEqual(
  previewCosts({ ...extreme.material, decimalInputs: extreme.inputs }),
  extreme.costs,
);
const sorted = sortMaterials(
  [
    { ...extreme.material, savedCosts: extreme.costs },
    { ...old.material, savedCosts: old.costs },
  ],
  [{ key: "totalLanded", asc: false }],
);
assert.equal(sorted[0].id, extreme.material.id);
console.log("PASS maximum stored input and exact financial ordering");
const changed = await post({
  action: "update",
  items: [
    {
      material: { ...old.material, vendor: "CP03 updated" },
      revision: old.revision,
    },
  ],
});
const preserved = changed.records.find(
  (r) => r.material.id === old.material.id,
);
assert.deepEqual(preserved.costs, old.costs);
assert.equal(preserved.inputs.usd, old.inputs.usd);
await post(
  {
    action: "create",
    items: [
      {
        ...old.material,
        id: "cp03-stale-fx",
        name: "CP03 stale rate",
        expectedFxId: initial.reference.id,
      },
    ],
  },
  409,
);
console.log(
  "PASS historical stamp retained; stale new-material FX reference rejected",
);
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
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (n) => page.getByRole("button", { name: n, exact: true });
const search = page
  .getByRole("searchbox", { name: "Search materials" })
  .or(page.getByLabel("Search materials", { exact: true }));
try {
  await page.goto(url + "/?mode=database");
  await page.getByText("Local database", { exact: true }).waitFor();
  await page
    .locator(".forex")
    .getByText("USD → ₱65.12", { exact: true })
    .waitFor();
  const totals = JSON.parse(
    sql(
      `select json_build_object('landed',sum(total_landed)::text,'vat',sum(vat_in)::text,'unknown',count(*) filter(where selling is null)) from material_sourcing.material_costs where archived_at is null;`,
    ),
  );
  assert.equal(
    await page
      .locator(".metric")
      .filter({ hasText: "Total buying" })
      .locator("strong")
      .getAttribute("title"),
    money(totals.landed),
  );
  console.log("PASS dashboard exact aggregate equals independent SQL sum");
  await search.fill("CP03-EXTREME");
  await btn("CP03-EXTREME").waitFor();
  const r = page.locator('tr[data-material-id="cp03-extreme"]');
  assert.ok((await r.innerText()).includes(money(extreme.costs.totalLanded)));
  await btn("CP03-EXTREME").click();
  assert.ok(
    (await page.getByRole("dialog").innerText()).includes(
      money(extreme.costs.totalLanded),
    ),
  );
  await btn("✎ Edit").click();
  assert.equal(
    await page.getByRole("dialog").getByLabel("Buying price").inputValue(),
    extreme.inputs.buyingPrice,
  );
  await page
    .getByLabel("Vendor details")
    .fill("Exact input survives unrelated edit");
  await btn("Save changes").click();
  await btn("✎ Edit").waitFor();
  const after = (await get()).records.find(
    (r) => r.material.id === extreme.material.id,
  );
  assert.equal(after.inputs.buyingPrice, extreme.inputs.buyingPrice);
  assert.deepEqual(after.costs, extreme.costs);
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  console.log(
    "PASS table, detail and unrelated edit preserve exact database amount",
  );
  await search.fill("CP03-");
  await btn("Excel").waitFor();
  let pending = page.waitForEvent("download");
  await btn("Excel").click();
  let dl = await pending;
  let rows = await readSheet(await dl.path(), "Materials"),
    summary = await readSheet(await dl.path(), "Summary");
  assert.equal(rows.length, 83);
  const header = rows[0],
    actual = rows.find(
      (row) => row[header.indexOf("Part number")] === "CP03-EXTREME",
    );
  assert.equal(
    actual[header.indexOf("Buying price")],
    extreme.inputs.buyingPrice,
  );
  assert.equal(
    String(actual[header.indexOf("Total landed")]),
    String(200000100000000),
  );
  const subset = JSON.parse(
    sql(
      `select json_build_object('landed',sum(total_landed)::text,'vat',sum(vat_in)::text,'unknown',count(*) filter(where selling is null)) from material_sourcing.material_costs where id like 'cp03-%';`,
    ),
  );
  const Decimal80 = Decimal.clone({ precision: 80 });
  for (const [label, value] of [
    ["Total landed buying (PHP)", subset.landed],
    ["Total VAT-in (PHP, known sources)", subset.vat],
  ]) {
    const v = summary.find((r) => r[0] === label)[1];
    assert.ok(new Decimal80(v).eq(value), label);
  }
  assert.equal(
    summary.find(
      (r) => r[0] === "Unknown-source records excluded from VAT-in",
    )[1],
    27,
  );
  for (const row of rows.slice(1)) {
    const ref = data.records.find(
      (r) => r.material.name === row[header.indexOf("Part number")],
    );
    assert.ok(ref);
    for (const [col, key] of [
      ["Total landed", "totalLanded"],
      ["Selling price (VAT-ex)", "selling"],
      ["Total VAT-in (PHP)", "vatIn"],
    ]) {
      const v = row[header.indexOf(col)];
      if (ref.costs[key] === null) assert.equal(v, null);
      else
        assert.ok(
          new Decimal80(v).eq(ref.costs[key]),
          ref.material.id + " " + key,
        );
    }
  }
  console.log(
    "PASS XLSX 82 rows, exact text for precision overflow, totals and unknown values reconcile",
  );
  pending = page.waitForEvent("download");
  await btn("PDF").click();
  dl = await pending;
  const pdf = (await readFile(await dl.path())).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-"));
  assert.ok(
    pdf.includes(money(subset.landed)) && pdf.includes(money(subset.vat)),
    "PDF summary totals missing",
  );
  assert.ok(pdf.includes("Unknown-source records excluded from VAT-in: 27"));
  console.log("PASS PDF aggregate readback and unknown source disclosure");
  await btn("Add Material").click();
  await page.getByLabel("Part number").fill("CP03-FORM");
  await page.getByLabel("Source type").selectOption("Import");
  await page.getByLabel("Brand").fill("QA");
  await page.getByLabel("Material description").fill("Live preview test");
  await page.getByLabel("Quantity").fill("1.234567");
  await page.getByLabel("Buying price").fill("10.075");
  await page.getByLabel(/^Currency/).selectOption("USD");
  await page.getByLabel("Shipping cost / unit").fill("0.005");
  await page.getByLabel("Ship. currency").selectOption("EUR");
  const expected = previewCosts({
    ...old.material,
    source: "Import",
    quantity: 1.234567,
    buyingPrice: 10.075,
    shipping: 0.005,
    currency: "USD",
    shipCurrency: "EUR",
    usd: Number(data.reference.usd),
    eur: Number(data.reference.eur),
    decimalInputs: { usd: data.reference.usd, eur: data.reference.eur },
  });
  assert.ok(
    (await page.locator(".cost-preview").innerText()).includes(
      money(expected.totalLanded),
    ),
  );
  await btn("+ Add material").click();
  await search.fill("CP03-FORM");
  await btn("CP03-FORM").waitFor();
  const saved = (await get()).records.find(
    (r) => r.material.name === "CP03-FORM",
  );
  assert.deepEqual(saved.costs, expected);
  console.log(
    "PASS new-material preview uses latest stored FX and matches committed prices",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
