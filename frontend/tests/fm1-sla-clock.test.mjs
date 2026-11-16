import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSupportIntervals,
  supportSecondsBetween,
  mergeIntervals,
  calculateSlaDeadline,
  calculateSlaElapsed,
  metricAllowsHold,
  getSlaTarget,
} from "../fm1/domain/sla-clock.js";

const local = (value) => new Date(value).toISOString();

test("P1 clocks use elapsed time across weekends and closed hours", () => {
  const receipt = "2027-01-15T23:50:00+08:00";
  const response = calculateSlaDeadline({
    receivedAt: receipt,
    priority: "P1",
    metric: "response",
  });
  const start = calculateSlaDeadline({
    receivedAt: receipt,
    priority: "P1",
    metric: "engineeringStart",
  });
  const restore = calculateSlaDeadline({
    receivedAt: receipt,
    priority: "P1",
    metric: "restoration",
  });
  assert.equal(response.dueAt, local("2027-01-16T00:20:00+08:00"));
  assert.equal(start.dueAt, local("2027-01-16T00:50:00+08:00"));
  assert.equal(restore.dueAt, local("2027-01-16T03:50:00+08:00"));
});

test("P3 Friday support-hour deadline carries through the weekend", () => {
  const receipt = "2027-01-15T16:00:00+08:00";
  assert.equal(
    calculateSlaDeadline({
      receivedAt: receipt,
      priority: "P3",
      metric: "response",
    }).dueAt,
    local("2027-01-18T11:00:00+08:00"),
  );
  assert.equal(
    calculateSlaDeadline({
      receivedAt: receipt,
      priority: "P3",
      metric: "engineeringStart",
    }).dueAt,
    local("2027-01-18T15:00:00+08:00"),
  );
  assert.equal(
    calculateSlaDeadline({
      receivedAt: receipt,
      priority: "P3",
      metric: "restoration",
    }).dueAt,
    local("2027-01-20T16:00:00+08:00"),
  );
});

test("P3 received outside routine support hours begins consumption at next opening", () => {
  const due = calculateSlaDeadline({
    receivedAt: "2027-01-16T10:00:00+08:00",
    priority: "P3",
    metric: "response",
  });
  assert.equal(due.dueAt, local("2027-01-18T12:00:00+08:00"));
});

test("approved holiday fixture moves the support deadline by one business day", () => {
  const due = calculateSlaDeadline({
    receivedAt: "2027-01-15T16:00:00+08:00",
    priority: "P3",
    metric: "response",
    holidays: ["2027-01-18"],
  });
  assert.equal(due.dueAt, local("2027-01-19T11:00:00+08:00"));
});

test("overlapping hold intervals are merged and response clocks are not hold-eligible", () => {
  const holds = mergeIntervals([
    { start: "2027-01-15T10:10:00+08:00", end: "2027-01-15T10:40:00+08:00" },
    { start: "2027-01-15T10:20:00+08:00", end: "2027-01-15T10:50:00+08:00" },
  ]);
  assert.equal(holds.length, 1);
  assert.equal((holds[0].end - holds[0].start) / 1000, 40 * 60);
  assert.equal(metricAllowsHold("response"), false);
  assert.equal(metricAllowsHold("engineeringStart"), true);
  const response = calculateSlaDeadline({
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "response",
    holds,
  });
  assert.equal(response.dueAt, local("2027-01-15T10:30:00+08:00"));
});

test("routine support intervals are bounded to weekdays 08:00–17:00 Asia/Manila", () => {
  const intervals = buildSupportIntervals(
    "2027-01-16T00:00:00+08:00",
    "2027-01-19T00:00:00+08:00",
  );
  assert.equal(intervals.length, 1);
  assert.equal(
    supportSecondsBetween(intervals[0].start, intervals[0].end),
    9 * 3600,
  );
});

test("all calculated values are explicitly preview-only, not contractual results", () => {
  const result = calculateSlaDeadline({
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "response",
  });
  assert.equal(result.status, "PREVIEW_ONLY");
  assert.equal(result.authority, "CLIENT_PREVIEW_NOT_CONTRACTUAL");
});

test("engineering-start hold extends only the eligible metric deadline", () => {
  const holds = [
    { start: "2027-01-15T10:10:00+08:00", end: "2027-01-15T10:40:00+08:00" },
  ];
  const response = calculateSlaDeadline({
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "response",
    holds,
  });
  const engineering = calculateSlaDeadline({
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "engineeringStart",
    holds,
  });
  assert.equal(response.dueAt, local("2027-01-15T10:30:00+08:00"));
  assert.equal(engineering.dueAt, local("2027-01-15T11:30:00+08:00"));
});

test("overlapping restoration holds exclude their union once, not the sum of intervals", () => {
  const holds = [
    { start: "2027-01-15T10:10:00+08:00", end: "2027-01-15T10:40:00+08:00" },
    { start: "2027-01-15T10:20:00+08:00", end: "2027-01-15T10:50:00+08:00" },
  ];
  const due = calculateSlaDeadline({
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "restoration",
    holds,
  });
  assert.equal(due.dueAt, local("2027-01-15T14:40:00+08:00"));
});

test("P3/P4 public-update targets remain explicitly proposed support-hour values", () => {
  assert.deepEqual(
    [
      getSlaTarget("P3", "publicUpdate").mode,
      getSlaTarget("P3", "publicUpdate").seconds,
      getSlaTarget("P3", "publicUpdate").proposed,
    ],
    ["support", 9 * 3600, true],
  );
  assert.deepEqual(
    [
      getSlaTarget("P4", "publicUpdate").mode,
      getSlaTarget("P4", "publicUpdate").seconds,
      getSlaTarget("P4", "publicUpdate").proposed,
    ],
    ["support", 45 * 3600, true],
  );
});

test("public-update obligations continue while a restoration hold is active", () => {
  const holds = [
    {
      start: "2027-01-15T10:10:00+08:00",
      end: "2027-01-15T10:40:00+08:00",
    },
  ];
  const due = calculateSlaDeadline({
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "publicUpdate",
    holds,
  });
  assert.equal(metricAllowsHold("publicUpdate"), false);
  assert.equal(due.dueAt, local("2027-01-15T11:00:00+08:00"));
});

test("an exact deadline is met and one second later is exceeded", () => {
  const input = {
    receivedAt: "2027-01-15T10:00:00+08:00",
    priority: "P1",
    metric: "response",
  };
  const exact = calculateSlaElapsed({
    ...input,
    asOf: "2027-01-15T10:30:00+08:00",
  });
  const late = calculateSlaElapsed({
    ...input,
    asOf: "2027-01-15T10:30:01+08:00",
  });
  assert.equal(exact.objectiveExceeded, false);
  assert.equal(late.objectiveExceeded, true);
});
