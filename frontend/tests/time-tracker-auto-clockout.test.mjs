import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  renderTimeTrackerNative,
  syncTimeTrackerClock,
} from "../time-tracker-ui.js";
import {
  TT_AUTO_CLOCKOUT_POLICY,
  timeTrackerNineHourThreshold,
  evaluateTimeTrackerAutoClockout,
  formatTimeTrackerAutoClockoutTime,
} from "../time-tracker-auto-clockout.js";

const owner = "cloud:20000000-0000-4000-8000-000000000001";
const pht = (value) =>
  new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString();

test("nine-hour threshold uses credited work and deducts the existing PHT lunch interval", () => {
  const clockIn = "2026-11-20T00:00:00.000Z"; // 08:00 PHT
  const threshold = timeTrackerNineHourThreshold(clockIn);
  assert.equal(threshold, "2026-11-20T10:00:00.000Z"); // 18:00 PHT
  assert.equal(
    Date.parse(threshold) - Date.parse(clockIn),
    10 * 60 * 60 * 1000,
  );
  assert.equal(
    timeTrackerNineHourThreshold("2026-11-20T06:00:00.000Z"),
    "2026-11-20T15:00:00.000Z",
  ); // 14:00–23:00 PHT, no lunch overlap
  assert.equal(timeTrackerNineHourThreshold("invalid"), null);
});

test("approved overtime covering the threshold is visible as an active extension before nine hours", () => {
  const request = {
    id: "ot-early",
    ownerId: owner,
    date: "2026-11-20",
    start: "17:00",
    end: "19:00",
    status: "Approved",
    decidedAt: "2026-11-20T08:30:00.000Z",
  };
  const result = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [request],
    now: "2026-11-20T09:00:00.000Z",
  });
  assert.equal(result.status, "OVERTIME");
  assert.equal(result.nextAt, "2026-11-20T11:00:00.000Z");
});

test("monitoring starts from the original session timestamp and enters grace at nine credited hours", () => {
  const clockIn = "2026-11-20T00:00:00.000Z";
  const before = evaluateTimeTrackerAutoClockout({
    clockIn,
    ownerId: owner,
    now: "2026-11-20T09:59:59.999Z",
  });
  assert.equal(before.status, "MONITORING");
  assert.equal(before.thresholdAt, "2026-11-20T10:00:00.000Z");
  const atThreshold = evaluateTimeTrackerAutoClockout({
    clockIn,
    ownerId: owner,
    now: "2026-11-20T10:00:00.000Z",
  });
  assert.equal(atThreshold.status, "GRACE");
  assert.equal(atThreshold.graceDeadlineAt, "2026-11-20T10:30:00.000Z");
  const atDeadline = evaluateTimeTrackerAutoClockout({
    clockIn,
    ownerId: owner,
    now: "2026-11-20T10:30:00.000Z",
  });
  assert.equal(atDeadline.status, "DUE");
  assert.equal(atDeadline.cutoffAt, "2026-11-20T10:30:00.000Z");
  assert.equal(atDeadline.reason, "nine_hour_threshold_grace_expired");
});

test("approved overtime before threshold bypasses grace and sets its endpoint as cutoff", () => {
  const request = {
    id: "ot-1",
    ownerId: owner,
    date: "2026-11-20",
    start: "18:00",
    end: "19:00",
    status: "Approved",
    decidedAt: "2026-11-20T09:30:00.000Z",
  };
  const result = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [request],
    now: "2026-11-20T10:00:00.000Z",
  });
  assert.equal(result.status, "OVERTIME");
  assert.equal(result.graceDeadlineAt, "2026-11-20T10:30:00.000Z");
  assert.equal(result.overtimeCutoffAt, "2026-11-20T11:00:00.000Z");
  assert.deepEqual(result.overtimeRequestIds, ["ot-1"]);
  const atEnd = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [request],
    now: "2026-11-20T11:00:00.000Z",
  });
  assert.equal(atEnd.status, "DUE");
  assert.equal(atEnd.reason, "approved_overtime_ended");
});

test("approval during grace cancels pending expiration only when approval timestamp is inside grace", () => {
  const approvedDuringGrace = {
    id: "ot-grace",
    ownerId: owner,
    date: "2026-11-20",
    start: "18:00",
    end: "19:00",
    status: "Approved",
    decidedAt: "2026-11-20T10:20:00.000Z",
  };
  const result = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [approvedDuringGrace],
    now: "2026-11-20T10:29:59.000Z",
  });
  assert.equal(result.status, "OVERTIME");
  assert.equal(result.overtimeCutoffAt, "2026-11-20T11:00:00.000Z");

  const approvedAfterGrace = {
    ...approvedDuringGrace,
    decidedAt: "2026-11-20T10:30:01.000Z",
  };
  const expired = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [approvedAfterGrace],
    now: "2026-11-20T10:31:00.000Z",
  });
  assert.equal(expired.status, "DUE");
  assert.equal(expired.cutoffAt, "2026-11-20T10:30:00.000Z");
});

test("pending, rejected, cancelled, expired, foreign-owner and OT starting after grace do not bypass grace", () => {
  const base = {
    id: "ot-invalid",
    ownerId: owner,
    date: "2026-11-20",
    start: "18:00",
    end: "19:00",
    decidedAt: "2026-11-20T09:30:00.000Z",
  };
  for (const status of [
    "Submitted",
    "Rejected",
    "Cancelled",
    "Expired",
    "Draft",
  ]) {
    const result = evaluateTimeTrackerAutoClockout({
      clockIn: "2026-11-20T00:00:00.000Z",
      ownerId: owner,
      overtimeRequests: [{ ...base, status }],
      now: "2026-11-20T10:10:00.000Z",
    });
    assert.equal(result.status, "GRACE", status);
  }
  const foreign = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [
      { ...base, status: "Approved", ownerId: "cloud:foreign" },
    ],
    now: "2026-11-20T10:10:00.000Z",
  });
  assert.equal(foreign.status, "GRACE");
  const gap = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [{ ...base, status: "Approved", start: "18:31" }],
    now: "2026-11-20T10:10:00.000Z",
  });
  assert.equal(gap.status, "GRACE");
});

test("approved overtime ending before or exactly at grace deadline does not shorten the grace period", () => {
  for (const end of ["18:25", "18:30"]) {
    const request = { id: "ot-short-" + end, ownerId: owner, date: "2026-11-20",
      start: "18:20", end, status: "Approved",
      decidedAt: "2026-11-20T10:15:00.000Z" };
    const result = evaluateTimeTrackerAutoClockout({ clockIn: "2026-11-20T00:00:00.000Z",
      ownerId: owner, overtimeRequests: [request], now: "2026-11-20T10:20:00.000Z" });
    assert.equal(result.status, "GRACE");
    assert.equal(result.nextAt, "2026-11-20T10:30:00.000Z");
  }
});

test("approved overtime beginning inside grace can bridge the threshold and uses its scheduled endpoint", () => {
  const request = {
    id: "ot-bridge",
    ownerId: owner,
    date: "2026-11-20",
    start: "18:20",
    end: "19:20",
    status: "Approved",
    decidedAt: "2026-11-20T10:15:00.000Z",
  };
  const result = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [request],
    now: "2026-11-20T10:20:00.000Z",
  });
  assert.equal(result.status, "OVERTIME");
  assert.equal(result.overtimeCutoffAt, "2026-11-20T11:20:00.000Z");
});

test("approved overtime can extend continuously through a second request approved before the current cutoff", () => {
  const requests = [
    {
      id: "ot-1",
      ownerId: owner,
      date: "2026-11-20",
      start: "18:00",
      end: "19:00",
      status: "Approved",
      decidedAt: "2026-11-20T10:10:00.000Z",
    },
    {
      id: "ot-2",
      ownerId: owner,
      date: "2026-11-20",
      start: "19:00",
      end: "20:00",
      status: "Approved",
      decidedAt: "2026-11-20T10:45:00.000Z",
    },
  ];
  const extended = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: requests,
    now: "2026-11-20T11:10:00.000Z",
  });
  assert.equal(extended.status, "OVERTIME");
  assert.equal(extended.overtimeCutoffAt, "2026-11-20T12:00:00.000Z");
  const lateApproval = evaluateTimeTrackerAutoClockout({
    clockIn: "2026-11-20T00:00:00.000Z",
    ownerId: owner,
    overtimeRequests: [
      requests[0],
      { ...requests[1], decidedAt: "2026-11-20T11:00:01.000Z" },
    ],
    now: "2026-11-20T11:10:00.000Z",
  });
  assert.equal(lateApproval.status, "DUE");
  assert.equal(lateApproval.cutoffAt, "2026-11-20T11:00:00.000Z");
});

test("invalid context never produces a clock-out deadline and display times use PHT", () => {
  assert.equal(
    evaluateTimeTrackerAutoClockout({ clockIn: "invalid", ownerId: owner })
      .status,
    "UNMONITORED",
  );
  assert.equal(
    evaluateTimeTrackerAutoClockout({
      clockIn: "2026-11-20T00:00:00Z",
      ownerId: "",
      now: new Date(),
    }).status,
    "UNMONITORED",
  );
  assert.equal(
    formatTimeTrackerAutoClockoutTime("2026-11-20T10:30:00.000Z"),
    "06:30 PM",
  );
  assert.equal(TT_AUTO_CLOCKOUT_POLICY.gracePeriodMs, 30 * 60 * 1000);
});

test("Clock view shows the computed grace deadline and a live countdown without issuing writes", () => {
  const result = {
    status: "VERIFIED_READ",
    access: { moduleRole: "Employee", attendanceWritesAccepted: true },
    records: [],
    active: {
      id: "session-1",
      ownerId: owner,
      clockIn: "2026-11-20T00:00:00.000Z",
      location: "Office-Base Duty",
      department: "Information Technology",
      status: "Active",
    },
    autoClockout: {
      recordId: "session-1",
      status: "GRACE",
      thresholdAt: "2026-11-20T10:00:00.000Z",
      graceStartedAt: "2026-11-20T10:00:00.000Z",
      graceDeadlineAt: "2026-11-20T10:30:00.000Z",
      overtimeCutoffAt: null,
      nextAt: "2026-11-20T10:30:00.000Z",
    },
    otRequests: [],
  };
  const html = renderTimeTrackerNative({
    result,
    view: "clock",
    now: "2026-11-20T10:10:00.000Z",
  });
  assert.match(html, /Grace period active/);
  assert.match(html, /6:30 PM/);
  assert.match(html, /data-tt-auto-clockout-countdown/);
  assert.match(html, /data-deadline=\"2026-11-20T10:30:00.000Z\"/);
});

test("database migration persists monitoring, serializes OT decisions and activates the server worker", () => {
  const sql = readFileSync(
    new URL(
      "../../supabase/migrations/20261119200735_cp_tt_auto_clockout_01_conditional_session_expiration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE private\.tt_auto_clockout_sessions/);
  assert.match(
    sql,
    /AFTER INSERT OR UPDATE OF value ON public\.module_state_entries/,
  );
  assert.match(sql, /v_clock_in<v_activated_at/);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION private\.tt_process_auto_clockouts/,
  );
  assert.match(sql, /'30 seconds'/);
  assert.match(sql, /'nine_hour_threshold_grace_expired'/);
  assert.match(sql, /'approved_overtime_ended'/);
  assert.match(sql, /'status','not_captured'/);
  assert.match(sql, /'source','server-auto-clockout'/);
  assert.match(sql, /false,'automatic'/);
  assert.match(sql, /public\.timetracker_ot_decide/);
  assert.match(sql, /public\.timetracker_auto_clockout_snapshot/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /FOR SHARE OF r/);
  const snapshotMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20261119203633_cp_tt_auto_clockout_01_snapshot_overtime_cutoff_fix.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    snapshotMigration,
    /WHEN s\.overtime_cutoff_at IS NOT NULL\s+THEN 'OVERTIME'/,
  );
  assert.match(
    snapshotMigration,
    /WHEN s\.overtime_cutoff_at IS NOT NULL THEN s\.overtime_cutoff_at/,
  );
  const boundaryMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20261119204157_cp_tt_auto_clockout_01_grace_overtime_boundary.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(boundaryMigration, /v_ot_end>v_grace_deadline/);
  assert.doesNotMatch(boundaryMigration, /v_ot_end>v_threshold/);
});

test("clock ticker resumes the persisted deadline countdown after a page refresh", () => {
  const hours = { textContent: "" };
  const countdown = {
    dataset: { deadline: "2026-11-20T10:30:00.000Z" },
    textContent: "—",
  };
  const root = {
    querySelector(selector) {
      if (selector === "#tt-clock-hours") return hours;
      if (selector === "[data-tt-auto-clockout-countdown]") return countdown;
      return null;
    },
  };
  assert.equal(syncTimeTrackerClock(root, "2026-11-20T10:10:00.000Z"), true);
  assert.equal(countdown.textContent, "00:20:00");
  syncTimeTrackerClock(root, "2026-11-20T10:30:00.000Z");
  assert.equal(countdown.textContent, "Due now");
});
