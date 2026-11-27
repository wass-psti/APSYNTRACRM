import test from "node:test";
import assert from "node:assert/strict";
import { calculate, newMaterial, validate } from "../src/utils/material.ts";
const fixture = {
  quantity: 4,
  buyingPrice: 120.36,
  currency: "USD",
  shipping: 20,
  shipCurrency: "USD",
  usd: 64.45,
  eur: 71,
  source: "Import",
};
test("import pricing matches screenshot unit rounding", () => {
  const c = calculate(fixture);
  assert.equal(c.php, 7757.2);
  assert.equal(c.shipPhp, 1289);
  assert.equal(c.landed, 9046.2);
  assert.equal(c.totalLanded, 36184.8);
  assert.equal(c.selling, 15288.08);
  assert.equal(c.vatIn, 68490.6);
});
test("local and independent shipping currency", () => {
  assert.deepEqual(
    calculate({
      ...fixture,
      quantity: 2,
      buyingPrice: 100,
      currency: "PHP",
      shipping: 2,
      shipCurrency: "EUR",
      source: "Local",
    }),
    {
      php: 100,
      shipPhp: 142,
      landed: 242,
      totalLanded: 484,
      selling: 314.6,
      vatIn: 704.7,
    },
  );
});
test("unknown source does not invent markup", () =>
  assert.equal(calculate({ ...fixture, source: "Unknown" }).selling, null));
test("form validation", () => {
  const item = {
    ...newMaterial(),
    name: "A",
    description: "B",
    brand: "C",
    source: "Local",
    quantity: 1,
  };
  assert.equal(validate(item), "");
  assert.notEqual(validate({ ...item, quantity: 0 }), "");
  assert.notEqual(validate({ ...item, shipping: -1 }), "");
});

test("half-cent monetary boundaries agree with PostgreSQL numeric rounding", () => {
  const result = calculate({ ...fixture, buyingPrice: 10.075, shipping: 0, currency: "PHP", shipCurrency: "PHP", source: "Local", quantity: 1 });
  assert.deepEqual(result, {php:10.08,shipPhp:0,landed:10.08,totalLanded:10.08,selling:13.10,vatIn:14.67});
});
