import test from "node:test";
import assert from "node:assert/strict";
import { newMaterial } from "../src/utils/material.ts";
import { changeSort, moveColumn, sortMaterials } from "../src/utils/columns.ts";
import { reportTotals } from "../src/utils/exportReports.ts";
test("multi-column sort is stable and nulls stay last", () => {
  const rows = [
    { ...newMaterial(), id: "a", brand: "A", quantity: 5, leadWeeks: null },
    { ...newMaterial(), id: "b", brand: "B", quantity: 2, leadWeeks: 3 },
    { ...newMaterial(), id: "c", brand: "A", quantity: 2, leadWeeks: 1 },
    { ...newMaterial(), id: "d", brand: "A", quantity: 2, leadWeeks: 2 },
  ];
  assert.deepEqual(
    sortMaterials(rows, [
      { key: "brand", asc: true },
      { key: "quantity", asc: true },
    ]).map((i) => i.id),
    ["c", "d", "a", "b"],
  );
  assert.deepEqual(
    sortMaterials(rows, [{ key: "leadWeeks", asc: false }]).map((i) => i.id),
    ["b", "d", "c", "a"],
  );
  assert.deepEqual(
    rows.map((i) => i.id),
    ["a", "b", "c", "d"],
  );
});
test("sort rule toggling and pinned-column reorder", () => {
  let rules = changeSort([], "brand", false);
  rules = changeSort(rules, "quantity", true);
  rules = changeSort(rules, "brand", true);
  assert.deepEqual(rules, [
    { key: "brand", asc: false },
    { key: "quantity", asc: true },
  ]);
  const cols = ["name", "brand", "quantity"];
  assert.deepEqual(moveColumn(cols, "brand", "quantity"), [
    "name",
    "quantity",
    "brand",
  ]);
  assert.deepEqual(moveColumn(cols, "name", "quantity"), cols);
  assert.deepEqual(moveColumn(cols, "quantity", "name"), cols);
});
test("report totals include landed cost and distinguish unknown VAT-in", () => {
  const base = {
    ...newMaterial(),
    quantity: 4,
    buyingPrice: 120.36,
    currency: "USD",
    shipping: 20,
    shipCurrency: "USD",
    source: "Import",
  };
  const totals = reportTotals([
    base,
    { ...base, quantity: 1, source: "Unknown" },
  ]);
  assert.deepEqual(totals, {
    count: 2,
    quantity: 5,
    landed: 45231,
    vat: 68490.6,
    unknown: 1,
  });
});
