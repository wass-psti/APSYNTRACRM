import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const api = (process.env.CP02_API_BASE_URL ?? "").replace(/\/$/, "");
const project = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const database = process.env.DATABASE_URL ?? "";
const web = process.env.CP02_WEB_BASE_URL ?? "";
assert.ok(api && project && serviceKey && database && web, "Missing CP02 local environment");
assert.match(api, /^http:\/\/(127\.0\.0\.1|localhost):/);
assert.match(project, /^http:\/\/(127\.0\.0\.1|localhost):/);

async function request(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: { accept: "application/json", ...(options.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(options.method === "POST" ? 30000 : 20000),
  });
  return { response, body: await response.json().catch(() => null) };
}
function db(sql) {
  return execFileSync("psql", [database, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" }).trim();
}
function manilaDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Date.UTC(+v.year, +v.month - 1, +v.day + offset)).toISOString().slice(0, 10);
}
function manilaMinute() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return +v.hour * 60 + +v.minute;
}
function makeForm(schedule, quoteToken, name, proof, mime) {
  const body = new FormData();
  for (const [key, value] of Object.entries({
    courtId: schedule.courtId, date: schedule.date,
    startMinute: String(schedule.startMinute), durationMinutes: String(schedule.durationMinutes),
    fullName: name, email: "cp-pdl-guest02@example.test", phone: "09170000002",
    paymentMethod: "gcash", transactionReference: "CP02-SYNTHETIC-ONLY", quoteToken,
  })) body.set(key, value);
  body.set("proof", new Blob([proof], { type: mime }), "cp02-payment-proof.pdf");
  return body;
}

async function main() {
  const health = await request("/v1/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body?.service, "pdl-guest-api");
  assert.equal(health.body?.paymentsLive, false);

  const payment = await request("/v1/payment-methods");
  assert.equal(payment.response.status, 200);
  const methods = payment.body?.methods ?? [];
  assert.deepEqual(methods.map((m) => m.method).sort(), ["bpi", "gcash", "maya"]);
  for (const method of methods) {
    assert.match(method.recipient, /^CP02 TEST /);
    assert.ok(method.imageUrl);
    const image = await fetch(api + `/v1/payment-methods/${method.method}/image`, { cache: "no-store" });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type")?.split(";")[0], "image/png");
    assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10]);
  }

  const courts = ["court-1", "court-2", "court-3"];
  const durations = [60, 90, 120];
  const tomorrow = manilaDate(1);
  let future = 0;
  for (const courtId of courts) for (const durationMinutes of durations) {
    const q = new URLSearchParams({ courtId, date: tomorrow, durationMinutes: String(durationMinutes) });
    const result = await request(`/v1/availability?${q}`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body?.source, "server");
    assert.equal(result.body?.bookingEnabled, true);
    assert.ok(result.body.slots.some((slot) => slot.status === "available"));
    future++;
  }

  const today = manilaDate();
  const minute = manilaMinute();
  let sameDay = 0;
  for (const courtId of courts) for (const durationMinutes of durations) {
    const q = new URLSearchParams({ courtId, date: today, durationMinutes: String(durationMinutes) });
    const result = await request(`/v1/availability?${q}`);
    assert.equal(result.response.status, 200);
    for (const slot of result.body.slots) {
      if (slot.status === "available") assert.ok(slot.startMinute > minute);
    }
    sameDay++;
  }

  const schedule = { courtId: "court-1", date: tomorrow, startMinute: 480, durationMinutes: 90 };
  const quoteQuery = new URLSearchParams({
    ...schedule, startMinute: String(schedule.startMinute), durationMinutes: String(schedule.durationMinutes),
  });
  const quoted = await request(`/v1/guest-reservations/quote?${quoteQuery}`);
  assert.equal(quoted.response.status, 200, JSON.stringify(quoted.body));
  const quote = quoted.body;
  assert.equal(quote.amountMinor, 22500);
  assert.equal(quote.currency, "PHP");
  assert.ok(Date.parse(quote.expiresAt) > Date.now());

  const key = randomUUID();
  const proof = Buffer.from("%PDF-1.4\\n1 0 obj\\n<< /Type /Catalog >>\\nendobj\\n%%EOF\\n");
  const digest = createHash("sha256").update(proof).digest("hex");
  const proofPath = `${key}/${digest}.pdf`;
  const first = await request("/v1/guest-reservations", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: makeForm(schedule, quote.quoteToken, "CP02 Disposable Guest", proof, "application/pdf"),
  });
  assert.equal(first.response.status, 201, JSON.stringify(first.body));
  const receipt = first.body;
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.bookingStatus, "pending_verification");
  assert.equal(receipt.paymentStatus, "submitted");
  assert.equal(receipt.amountMinor, 22500);
  assert.match(receipt.receiptAccessToken, /^[0-9a-f-]{72}$/i);

  const readReceipt = (token = receipt.receiptAccessToken) => request(
    `/v1/guest-reservations/${receipt.reservationId}/receipt`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const independent = await readReceipt();
  assert.equal(independent.response.status, 200);
  assert.equal(independent.body.reservationId, receipt.reservationId);
  assert.equal(independent.body.paymentStatus, "submitted");

  const replay = await request("/v1/guest-reservations", {
    method: "POST", headers: { "Idempotency-Key": key },
    body: makeForm(schedule, quote.quoteToken, "CP02 Disposable Guest", proof, "application/pdf"),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.reservationId, receipt.reservationId);

  const conflict = await request("/v1/guest-reservations", {
    method: "POST", headers: { "Idempotency-Key": key },
    body: makeForm(schedule, quote.quoteToken, "Changed CP02 Guest", proof, "application/pdf"),
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body?.error, "idempotency_conflict");
  assert.equal((await readReceipt("0".repeat(72))).response.status, 404);

  const overlapQuery = new URLSearchParams({
    courtId: "court-1", date: tomorrow, startMinute: "540", durationMinutes: "60",
  });
  const overlap = await request(`/v1/guest-reservations/quote?${overlapQuery}`);
  assert.equal(overlap.response.status, 409);
  assert.equal(overlap.body?.error, "slot_unavailable");

  const invalidQuoteQuery = new URLSearchParams({
    courtId: "court-2", date: tomorrow, startMinute: "480", durationMinutes: "60",
  });
  const invalidQuote = await request(`/v1/guest-reservations/quote?${invalidQuoteQuery}`);
  assert.equal(invalidQuote.response.status, 200);
  const invalidKey = randomUUID();
  const invalid = await request("/v1/guest-reservations", {
    method: "POST", headers: { "Idempotency-Key": invalidKey },
    body: makeForm(
      { courtId: "court-2", date: tomorrow, startMinute: 480, durationMinutes: 60 },
      invalidQuote.body.quoteToken, "CP02 Invalid Proof", Buffer.from("not a PDF"), "application/pdf",
    ),
  });
  assert.ok([400, 422].includes(invalid.response.status));

  const object = await fetch(`${project}/storage/v1/object/pdl-payment-proofs/${proofPath}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    cache: "no-store",
  });
  assert.equal(object.status, 200);
  assert.deepEqual(Buffer.from(await object.arrayBuffer()), proof);
  assert.equal(db(`select count(*)::text || '|' || min(booking_status) || '|' || min(payment_status) from pdl_booking.reservations where idempotency_key='${key}'::uuid`),
    "1|pending_verification|submitted");
  assert.equal(db(`select count(*) from pdl_booking.reservations where idempotency_key='${invalidKey}'::uuid`), "0");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const loaded = await page.goto(web, { waitUntil: "domcontentloaded" });
    assert.equal(loaded?.status(), 200);
    await page.locator("#root").waitFor();
    assert.ok((await page.locator("#root").innerHTML()).length > 100);
    const browserResult = await page.evaluate(async (saved) => {
      async function json(path, options = {}) {
        const response = await fetch(path, { cache: "no-store", ...options });
        return { status: response.status, body: await response.json().catch(() => null) };
      }
      const health = await json("/api/v1/health");
      const methods = await json("/api/v1/payment-methods");
      const receipt = await json(
        `/api/v1/guest-reservations/${saved.reservationId}/receipt`,
        { headers: { Authorization: `Bearer ${saved.receiptAccessToken}` } },
      );
      const images = [];
      for (const method of ["gcash", "maya", "bpi"]) {
        const response = await fetch(`/api/v1/payment-methods/${method}/image`, { cache: "no-store" });
        images.push({ status: response.status, type: response.headers.get("content-type")?.split(";")[0],
          bytes: (await response.arrayBuffer()).byteLength });
      }
      return { health, methods, receipt, images };
    }, receipt);
    assert.equal(browserResult.health.status, 200);
    assert.equal(browserResult.methods.status, 200);
    assert.equal(browserResult.methods.body?.methods?.length, 3);
    assert.equal(browserResult.receipt.status, 200);
    assert.equal(browserResult.receipt.body?.reservationId, receipt.reservationId);
    assert.equal(browserResult.receipt.body?.paymentStatus, "submitted");
    for (const image of browserResult.images) {
      assert.equal(image.status, 200);
      assert.equal(image.type, "image/png");
      assert.ok(image.bytes > 8);
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }

  console.log("PASS 3/3 synthetic QR assets; 9/9 future and 9/9 same-day availability checks.");
  console.log("PASS server quote, multipart proof upload, independent receipt, same-key replay and changed-payload conflict.");
  console.log("PASS overlap rejection, invalid-token denial, private proof-byte readback and exact one-row database result.");
  console.log("PASS Chromium frontend proxy and independent receipt readback; zero uncaught page errors.");
  console.log("PASS payment remains pending_verification/submitted; no production or real payment mutation.");
}
main().catch((error) => {
  console.error(`CP02 ACCEPTANCE FAILED: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
