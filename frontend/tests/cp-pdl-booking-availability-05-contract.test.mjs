import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertReceiptMatches,
  parseArguments,
  proofMime,
  requireSubmissionInputs,
  venueDate,
  currentVenueMinute,
} from "../../scripts/cp-pdl-booking-availability-05-production-acceptance.mjs";

const read = (path) => readFileSync(path, "utf8");
const script = read(
  "scripts/cp-pdl-booking-availability-05-production-acceptance.mjs",
);
const rootManifest = JSON.parse(read("package.json"));
const paseoManifest = JSON.parse(
  read("frontend/apps/Paseo/source/package.json"),
);

const validOptions = {
  "submit-production": true,
  "confirm-proof-reviewed": true,
  "court-id": "court-1",
  date: "2026-11-24",
  "start-minute": "480",
  "duration-minutes": "90",
  "payment-method": "gcash",
  "full-name": "CP05 QA Guest",
  email: "cp05@example.test",
  phone: "09170000005",
  "transaction-reference": "GENUINE-REFERENCE-05",
  proof: "/tmp/cp05-proof.pdf",
  "idempotency-key": "a5000000-0000-4000-8000-000000000005",
  "confirm-amount-minor": "22500",
  "confirm-recipient": "ALEX S.",
};

const expectedReceipt = {
  reservationId: "a5000000-0000-4000-8000-000000000006",
  courtId: "court-1",
  date: "2026-11-24",
  startMinute: 480,
  durationMinutes: 90,
  fullName: "CP05 QA Guest",
  email: "cp05@example.test",
  phone: "09170000005",
  amountMinor: 22500,
  currency: "PHP",
  paymentMethod: "gcash",
  bookingStatus: "pending_verification",
  paymentStatus: "submitted",
};

test("production submission is opt-in and parses an explicit one-time command", () => {
  const parsed = parseArguments([
    "--submit-production",
    "--confirm-proof-reviewed",
    "--court-id",
    "court-1",
  ]);
  assert.equal(parsed["submit-production"], true);
  assert.equal(parsed["confirm-proof-reviewed"], true);
  assert.equal(parsed["court-id"], "court-1");
  assert.equal(parseArguments([])["submit-production"], undefined);
});

test("production submission requires a visually reviewed genuine receipt and exact quote confirmations", () => {
  const result = requireSubmissionInputs(validOptions);
  assert.equal(result.startMinute, 480);
  assert.equal(result.durationMinutes, 90);
  assert.equal(result.confirmAmountMinor, 22500);
  assert.throws(
    () =>
      requireSubmissionInputs({
        ...validOptions,
        "confirm-proof-reviewed": undefined,
      }),
    /Inspect the genuine payment receipt/,
  );
  assert.throws(
    () =>
      requireSubmissionInputs({
        ...validOptions,
        "idempotency-key": "not-a-uuid",
      }),
    /Idempotency key/,
  );
  assert.throws(
    () => requireSubmissionInputs({ ...validOptions, "court-id": "court-9" }),
    /Court must be/,
  );
  assert.throws(
    () =>
      requireSubmissionInputs({ ...validOptions, "duration-minutes": "75" }),
    /Duration must be/,
  );
});

test("payment proof validation accepts only matching JPEG, PNG and PDF signatures", () => {
  assert.equal(
    proofMime("receipt.jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    "image/jpeg",
  );
  assert.equal(
    proofMime("receipt.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(
    proofMime("receipt.pdf", Buffer.from("%PDF-1.7")),
    "application/pdf",
  );
  assert.throws(
    () => proofMime("receipt.pdf", Buffer.from("not a PDF")),
    /PDF signature/,
  );
  assert.throws(
    () => proofMime("receipt.txt", Buffer.from("text")),
    /must be a/,
  );
});

test("independent receipt readback must match every persisted booking and payment field", () => {
  assert.doesNotThrow(() =>
    assertReceiptMatches(expectedReceipt, expectedReceipt),
  );
  assert.throws(
    () =>
      assertReceiptMatches(
        { ...expectedReceipt, durationMinutes: 60 },
        expectedReceipt,
      ),
    /60 !== 90/,
  );
  assert.throws(
    () =>
      assertReceiptMatches(
        { ...expectedReceipt, amountMinor: 15000 },
        expectedReceipt,
      ),
    /15000 !== 22500/,
  );
  assert.throws(
    () =>
      assertReceiptMatches(
        { ...expectedReceipt, paymentStatus: "verified" },
        expectedReceipt,
      ),
    /verified.*submitted/s,
  );
});

test("same-key replay and independent receipt readback are implemented without automatic uncertain retry", () => {
  assert.match(script, /replay\.body\?\.replayed[\s\S]*?true/);
  assert.match(script, /readReceipt\(\)/);
  assert.match(script, /OUTCOME_UNCERTAIN/);
  assert.match(script, /Do not use a new idempotency key/);
  assert.doesNotMatch(
    script,
    /setTimeout|while\s*\(\s*true\s*\).*fetch|retry\s*\(/i,
  );
});

test("read-only preflight never creates a quote, reservation, proof object or financial decision", () => {
  assert.match(script, /runReadOnlyPreflight/);
  assert.match(script, /\/v1\/availability/);
  assert.match(script, /\/v1\/payment-methods/);
  assert.match(script, /No quote, reservation, customer, payment-proof object/);
  assert.doesNotMatch(
    script.slice(
      script.indexOf("async function runReadOnlyPreflight"),
      script.indexOf("function requireSubmissionInputs"),
    ),
    /\/v1\/guest-reservations\/quote|method:\s*['"]POST['"]/,
  );
});

test("venue dates and local clock are derived using Asia/Manila", () => {
  assert.match(venueDate(), /^2026-\d{2}-\d{2}$/);
  assert.ok(Number.isInteger(currentVenueMinute()));
  assert.ok(currentVenueMinute() >= 0 && currentVenueMinute() < 1440);
});

test("CP05 adds no machine-learning or model-training dependencies or execution paths", () => {
  const dependencyNames = [
    ...Object.keys(rootManifest.dependencies ?? {}),
    ...Object.keys(rootManifest.devDependencies ?? {}),
    ...Object.keys(paseoManifest.dependencies ?? {}),
    ...Object.keys(paseoManifest.devDependencies ?? {}),
  ];
  assert.ok(
    !dependencyNames.some((name) =>
      /tensorflow|pytorch|(^|[-/])torch($|[-/])|keras|transformers|onnxruntime|scikit-learn/i.test(
        name,
      ),
    ),
  );
  const scriptNames = [
    ...Object.keys(rootManifest.scripts ?? {}),
    ...Object.keys(paseoManifest.scripts ?? {}),
  ];
  assert.ok(
    !scriptNames.some((name) => /^(train|fit|fine.?tune|retrain)/i.test(name)),
  );
  assert.doesNotMatch(
    script,
    /from\s+['"](?:tensorflow|torch|keras|transformers|onnxruntime)|require\(['"](?:tensorflow|torch|keras|transformers|onnxruntime)/i,
  );
  assert.doesNotMatch(
    script,
    /backpropagation|gradient descent|fine.?tun|weight update|optimizer/i,
  );
});
