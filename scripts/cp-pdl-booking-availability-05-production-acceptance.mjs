import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API_BASE =
  "https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/pdl-guest-api";
const VENUE_TIME_ZONE = "Asia/Manila";
const COURTS = ["court-1", "court-2", "court-3"];
const DURATIONS = [60, 90, 120];
const PAYMENT_METHODS = ["gcash", "maya", "bpi"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      argument === "--submit-production" ||
      argument === "--confirm-proof-reviewed" ||
      argument === "--help"
    ) {
      options[argument.slice(2)] = true;
      continue;
    }
    if (!argument.startsWith("--") || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    options[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  return options;
}

function venueDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + offsetDays,
    ),
  );
  return date.toISOString().slice(0, 10);
}

function currentVenueMinute() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}

function proofMime(filePath, bytes) {
  if (
    filePath.toLowerCase().endsWith(".jpg") ||
    filePath.toLowerCase().endsWith(".jpeg")
  ) {
    assert.ok(
      bytes.length > 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff,
      "Payment proof does not contain a JPEG signature",
    );
    return "image/jpeg";
  }
  if (filePath.toLowerCase().endsWith(".png")) {
    assert.ok(
      bytes.length >= 8 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, index) => bytes[index] === value,
        ),
      "Payment proof does not contain a PNG signature",
    );
    return "image/png";
  }
  if (filePath.toLowerCase().endsWith(".pdf")) {
    assert.ok(
      bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-",
      "Payment proof does not contain a PDF signature",
    );
    return "application/pdf";
  }
  throw new Error("Payment proof must be a .jpg, .jpeg, .png or .pdf file");
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { accept: "application/json", ...(options.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(options.method === "POST" ? 30000 : 20000),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function assertAvailableResponse(data, courtId, date, durationMinutes) {
  assert.equal(
    data?.source,
    "server",
    `${courtId}/${date}/${durationMinutes}: availability must be server-backed`,
  );
  assert.equal(
    data?.bookingEnabled,
    true,
    `${courtId}/${date}/${durationMinutes}: booking must be enabled`,
  );
  assert.ok(
    Array.isArray(data?.slots),
    `${courtId}/${date}/${durationMinutes}: slots must be an array`,
  );
}

function assertReceiptMatches(receipt, expected) {
  assert.equal(receipt?.reservationId, expected.reservationId);
  assert.equal(receipt?.courtId, expected.courtId);
  assert.equal(receipt?.date, expected.date);
  assert.equal(receipt?.startMinute, expected.startMinute);
  assert.equal(receipt?.durationMinutes, expected.durationMinutes);
  assert.equal(receipt?.fullName, expected.fullName);
  assert.equal(receipt?.email, expected.email);
  assert.equal(receipt?.phone, expected.phone);
  assert.equal(receipt?.amountMinor, expected.amountMinor);
  assert.equal(receipt?.currency, "PHP");
  assert.equal(receipt?.paymentMethod, expected.paymentMethod);
  assert.equal(receipt?.bookingStatus, "pending_verification");
  assert.equal(receipt?.paymentStatus, "submitted");
}

async function runReadOnlyPreflight() {
  const health = await jsonRequest("/v1/health");
  assert.equal(
    health.response.status,
    200,
    "Production API health check failed",
  );
  assert.equal(health.body?.service, "pdl-guest-api");
  assert.equal(health.body?.projectShared, true);

  const paymentResult = await jsonRequest("/v1/payment-methods");
  assert.equal(
    paymentResult.response.status,
    200,
    "Production payment methods are unavailable",
  );
  const methods = paymentResult.body?.methods;
  assert.ok(Array.isArray(methods), "Payment methods response is invalid");
  for (const method of PAYMENT_METHODS) {
    const configured = methods.find((item) => item.method === method);
    assert.ok(configured, `${method} payment method is missing`);
    assert.ok(
      typeof configured.recipient === "string" && configured.recipient.trim(),
      `${method} recipient is missing`,
    );
    assert.ok(
      typeof configured.imageUrl === "string" &&
        configured.imageUrl.startsWith(API_BASE),
      `${method} QR image endpoint is missing or points outside the existing project`,
    );
    const imageResponse = await fetch(configured.imageUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(imageResponse.status, 200, `${method} QR image read failed`);
    const mime = imageResponse.headers.get("content-type")?.split(";")[0] ?? "";
    assert.ok(
      ["image/jpeg", "image/png"].includes(mime),
      `${method} QR image has invalid content type`,
    );
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    assert.ok(bytes.length > 8, `${method} QR image is empty`);
  }

  const tomorrow = venueDate(1);
  let futureChecks = 0;
  for (const courtId of COURTS) {
    for (const durationMinutes of DURATIONS) {
      const query = new URLSearchParams({
        courtId,
        date: tomorrow,
        durationMinutes: String(durationMinutes),
      });
      const result = await jsonRequest(`/v1/availability?${query}`);
      assert.equal(
        result.response.status,
        200,
        `${courtId}/${durationMinutes}: future availability request failed`,
      );
      assertAvailableResponse(result.body, courtId, tomorrow, durationMinutes);
      assert.ok(
        result.body.slots.some((slot) => slot.status === "available"),
        `${courtId}/${durationMinutes}: no available future slot`,
      );
      futureChecks += 1;
    }
  }

  const today = venueDate();
  const minute = currentVenueMinute();
  let sameDayChecks = 0;
  for (const courtId of COURTS) {
    for (const durationMinutes of DURATIONS) {
      const query = new URLSearchParams({
        courtId,
        date: today,
        durationMinutes: String(durationMinutes),
      });
      const result = await jsonRequest(`/v1/availability?${query}`);
      assert.equal(
        result.response.status,
        200,
        `${courtId}/${durationMinutes}: same-day availability request failed`,
      );
      assertAvailableResponse(result.body, courtId, today, durationMinutes);
      for (const slot of result.body.slots) {
        assert.ok(
          Number.isInteger(slot.startMinute),
          `${courtId}/${durationMinutes}: invalid start minute`,
        );
        assert.ok(
          slot.startMinute > minute,
          `${courtId}/${durationMinutes}: past same-day slot ${slot.startMinute} was advertised`,
        );
      }
      sameDayChecks += 1;
    }
  }

  console.log(
    `PASS production read-only preflight: API health; ${PAYMENT_METHODS.length}/3 QR assets; ${futureChecks}/9 future availability checks; ${sameDayChecks}/9 same-day past-slot checks.`,
  );
  console.log(
    `Venue date: ${today}; current Manila minute: ${minute}; future availability date: ${tomorrow}.`,
  );
  console.log(
    `Payment methods: ${methods.map((item) => item.method).join(", ")}. Automated payment processor status: ${health.body.paymentsLive === true ? "live" : "not connected; manual QR and receipt workflow only"}.`,
  );
  console.log(
    "No quote, reservation, customer, payment-proof object, payment verification, cancellation or refund was created.",
  );
  return { health: health.body, methods, tomorrow };
}

function requireSubmissionInputs(options) {
  const required = [
    "court-id",
    "date",
    "start-minute",
    "duration-minutes",
    "payment-method",
    "full-name",
    "email",
    "phone",
    "transaction-reference",
    "proof",
    "idempotency-key",
    "confirm-amount-minor",
    "confirm-recipient",
  ];
  for (const key of required) {
    if (typeof options[key] !== "string" || !options[key].trim()) {
      throw new Error(
        `Missing required production submission argument: --${key}`,
      );
    }
  }
  assert.ok(
    options["confirm-proof-reviewed"],
    "Inspect the genuine payment receipt and pass --confirm-proof-reviewed",
  );
  assert.ok(
    UUID_PATTERN.test(options["idempotency-key"]),
    "Idempotency key must be a UUID and must be retained for reconciliation",
  );
  assert.ok(
    COURTS.includes(options["court-id"]),
    "Court must be one of the three configured production courts",
  );
  assert.ok(
    PAYMENT_METHODS.includes(options["payment-method"]),
    "Payment method must be GCash, Maya or BPI",
  );
  const date = options.date;
  assert.ok(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date,
    "Booking date must be a valid YYYY-MM-DD date",
  );
  const startMinute = Number(options["start-minute"]);
  const durationMinutes = Number(options["duration-minutes"]);
  const confirmAmountMinor = Number(options["confirm-amount-minor"]);
  assert.ok(
    Number.isInteger(startMinute) &&
      startMinute >= 0 &&
      startMinute % 30 === 0 &&
      startMinute < 1440,
    "Start minute must be a valid 30-minute schedule boundary",
  );
  assert.ok(
    DURATIONS.includes(durationMinutes) &&
      startMinute + durationMinutes <= 1440,
    "Duration must be 60, 90 or 120 minutes and fit within the venue day",
  );
  assert.ok(
    Number.isInteger(confirmAmountMinor) && confirmAmountMinor > 0,
    "Confirmed amount must be a positive integer in PHP minor units",
  );
  assert.ok(
    options["full-name"].trim().length >= 2 &&
      options["full-name"].length <= 100,
    "Customer name is invalid",
  );
  assert.ok(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email),
    "Customer email is invalid",
  );
  assert.ok(
    options.phone.length >= 7 && options.phone.length <= 30,
    "Customer phone is invalid",
  );
  assert.ok(
    options["transaction-reference"].length <= 100,
    "Transaction reference is too long",
  );
  return { startMinute, durationMinutes, confirmAmountMinor };
}

async function submitOneProductionReservation(options) {
  const values = requireSubmissionInputs(options);
  const preflight = await runReadOnlyPreflight();
  const method = preflight.methods.find(
    (item) => item.method === options["payment-method"],
  );
  assert.equal(
    method.recipient,
    options["confirm-recipient"],
    "Configured payment recipient does not exactly match the operator-confirmed recipient",
  );

  const schedule = {
    courtId: options["court-id"],
    date: options.date,
    startMinute: values.startMinute,
    durationMinutes: values.durationMinutes,
  };
  const availabilityQuery = new URLSearchParams({
    courtId: schedule.courtId,
    date: schedule.date,
    durationMinutes: String(schedule.durationMinutes),
  });
  const availability = await jsonRequest(
    `/v1/availability?${availabilityQuery}`,
  );
  assert.equal(
    availability.response.status,
    200,
    "Selected production availability could not be read",
  );
  assertAvailableResponse(
    availability.body,
    schedule.courtId,
    schedule.date,
    schedule.durationMinutes,
  );
  assert.ok(
    availability.body.slots.some(
      (slot) =>
        slot.status === "available" &&
        slot.startMinute === schedule.startMinute,
    ),
    "The exact selected production slot is not currently available",
  );

  const quoteQuery = new URLSearchParams({
    ...schedule,
    startMinute: String(schedule.startMinute),
    durationMinutes: String(schedule.durationMinutes),
  });
  const quoteResult = await jsonRequest(
    `/v1/guest-reservations/quote?${quoteQuery}`,
  );
  assert.equal(
    quoteResult.response.status,
    200,
    `Production quote failed: ${JSON.stringify(quoteResult.body)}`,
  );
  const quote = quoteResult.body;
  assert.equal(quote.courtId, schedule.courtId);
  assert.equal(quote.date, schedule.date);
  assert.equal(quote.startMinute, schedule.startMinute);
  assert.equal(quote.durationMinutes, schedule.durationMinutes);
  assert.equal(quote.currency, "PHP");
  assert.ok(
    typeof quote.quoteToken === "string" && quote.quoteToken.length >= 16,
  );
  assert.ok(
    Date.parse(quote.expiresAt) > Date.now(),
    "Production quote is already expired",
  );
  assert.equal(
    quote.amountMinor,
    values.confirmAmountMinor,
    "Server quote amount does not match the amount visually confirmed on the genuine payment receipt",
  );

  const proofPath = options.proof;
  const proofBytes = await readFile(proofPath);
  assert.ok(
    proofBytes.length >= 5 && proofBytes.length <= 5 * 1024 * 1024,
    "Payment proof must be between 5 bytes and 5 MB",
  );
  const mime = proofMime(proofPath, proofBytes);
  const expected = {
    ...schedule,
    fullName: options["full-name"].trim(),
    email: options.email.trim(),
    phone: options.phone.trim(),
    amountMinor: quote.amountMinor,
    paymentMethod: options["payment-method"],
  };
  const idempotencyKey = options["idempotency-key"];
  const createForm = () => {
    const form = new FormData();
    form.set("quoteToken", quote.quoteToken);
    form.set("fullName", expected.fullName);
    form.set("email", expected.email);
    form.set("phone", expected.phone);
    form.set("paymentMethod", expected.paymentMethod);
    form.set("transactionReference", options["transaction-reference"]);
    form.set(
      "proof",
      new Blob([proofBytes], { type: mime }),
      basename(proofPath),
    );
    return form;
  };

  console.log(
    `Submitting exactly one controlled production reservation: ${schedule.courtId}, ${schedule.date}, ${schedule.startMinute}, ${schedule.durationMinutes} minutes, PHP ${(quote.amountMinor / 100).toFixed(2)}.`,
  );
  console.log(
    "The payment proof file signature is valid. File signature validation does not independently prove that funds settled; administrator reconciliation remains required.",
  );

  let first;
  try {
    first = await jsonRequest("/v1/guest-reservations", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: createForm(),
    });
  } catch (error) {
    throw new Error(
      `OUTCOME_UNCERTAIN: production submission did not return a response (${error.message}). Do not use a new idempotency key or submit again until the reservation queue has been reconciled.`,
    );
  }
  if (!first.response.ok) {
    const uncertain =
      first.response.status === 503 ||
      first.body?.error === "reservation_outcome_uncertain_retry_same_key";
    throw new Error(
      `${uncertain ? "OUTCOME_UNCERTAIN" : "SUBMISSION_REJECTED"}: HTTP ${first.response.status}, ${JSON.stringify(first.body)}. ${uncertain ? "Do not submit with a new key; reconcile the reservation queue first." : "No successful reservation receipt was returned."}`,
    );
  }

  const initialReceipt = first.body;
  assert.ok(
    typeof initialReceipt.reservationId === "string" &&
      initialReceipt.reservationId.length >= 8,
    "Submission response did not contain a reservation identifier",
  );
  assert.ok(
    typeof initialReceipt.receiptAccessToken === "string" &&
      initialReceipt.receiptAccessToken.length >= 16,
    "Submission response did not contain a receipt access token",
  );
  console.log(
    `Production submission returned reservation ID: ${initialReceipt.reservationId}`,
  );
  assertReceiptMatches(initialReceipt, {
    ...expected,
    reservationId: initialReceipt.reservationId,
  });

  const readReceipt = async () => {
    const result = await jsonRequest(
      `/v1/guest-reservations/${encodeURIComponent(initialReceipt.reservationId)}/receipt`,
      {
        headers: {
          authorization: `Bearer ${initialReceipt.receiptAccessToken}`,
        },
      },
    );
    assert.equal(
      result.response.status,
      200,
      `Independent receipt readback failed: HTTP ${result.response.status}`,
    );
    assertReceiptMatches(result.body, {
      ...expected,
      reservationId: initialReceipt.reservationId,
    });
    return result.body;
  };

  const independentReceipt = await readReceipt();
  let replayResult = null;
  if (initialReceipt.replayed !== true) {
    let replay;
    try {
      replay = await jsonRequest("/v1/guest-reservations", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: createForm(),
      });
    } catch (error) {
      throw new Error(
        `INITIAL_RESERVATION_VERIFIED_BUT_REPLAY_CHECK_UNCERTAIN: ${error.message}. Do not retry automatically.`,
      );
    }
    assert.equal(
      replay.response.status,
      200,
      `Idempotent replay did not return HTTP 200: ${JSON.stringify(replay.body)}`,
    );
    assert.equal(
      replay.body?.replayed,
      true,
      "Same-key submission was not identified as a replay",
    );
    assert.equal(
      replay.body?.reservationId,
      initialReceipt.reservationId,
      "Idempotent replay returned a different reservation",
    );
    replayResult = replay.body;
    await readReceipt();
  }

  console.log(
    `PASS production reservation persisted: ${initialReceipt.reservationId}`,
  );
  console.log(
    `PASS independent live receipt readback: ${independentReceipt.bookingStatus}/${independentReceipt.paymentStatus}; PHP ${(independentReceipt.amountMinor / 100).toFixed(2)}; ${independentReceipt.durationMinutes} minutes.`,
  );
  console.log(
    `PASS idempotency: ${initialReceipt.replayed === true ? "existing same-key replay reconciled" : "same-key replay returned the original reservation without duplication"}.`,
  );
  if (replayResult)
    console.log(
      `PASS replay reservation ID unchanged: ${replayResult.reservationId}`,
    );
  console.log(
    "PENDING MANUAL ADMINISTRATOR PAYMENT REVIEW AND RESERVATION RECONCILIATION. No payment was verified, no cancellation was issued and no refund was initiated.",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Read-only: node scripts/cp-pdl-booking-availability-05-production-acceptance.mjs",
    );
    console.log(
      "Controlled one-time submission: add --submit-production, --confirm-proof-reviewed, --court-id, --date, --start-minute, --duration-minutes, --payment-method, --full-name, --email, --phone, --transaction-reference, --proof, --idempotency-key, --confirm-amount-minor and --confirm-recipient.",
    );
    process.exit(0);
  }
  if (options["submit-production"]) {
    await submitOneProductionReservation(options);
    return;
  }
  await runReadOnlyPreflight();
}

export {
  assertReceiptMatches,
  currentVenueMinute,
  parseArguments,
  proofMime,
  requireSubmissionInputs,
  runReadOnlyPreflight,
  venueDate,
};

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main().catch((error) => {
    console.error(`CP05 ACCEPTANCE FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
