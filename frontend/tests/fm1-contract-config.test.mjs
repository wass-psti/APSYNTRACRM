import test from "node:test";
import assert from "node:assert/strict";
import { FM1_CONTRACT, FM1_SLA_TARGETS } from "../fm1/constants.js";

test("FM1 contract baseline matches the FDS initial configuration", () => {
  assert.equal(FM1_CONTRACT.client, "BIOTECH Farms, Inc.");
  assert.equal(FM1_CONTRACT.site, "FM1");
  assert.equal(FM1_CONTRACT.timezone, "Asia/Manila");
  assert.equal(FM1_CONTRACT.termStart, "2027-01-01T00:00:00+08:00");
  assert.equal(FM1_CONTRACT.termEndExclusive, "2028-01-01T00:00:00+08:00");
  assert.equal(FM1_CONTRACT.monthlyRetainerPhp, 110000);
  assert.equal(FM1_CONTRACT.annualRetainerPhp, 1320000);
  assert.equal(FM1_CONTRACT.monthlyMinorAdjustmentAllowanceMinutes, 240);
  assert.equal(FM1_CONTRACT.p1p2Coverage, "24/7");
  assert.equal(FM1_CONTRACT.coveredCorrectiveSupportPerTicketHourCap, null);
  assert.deepEqual(FM1_CONTRACT.routineCalendar.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(FM1_CONTRACT.routineCalendar.startHour, 8);
  assert.equal(FM1_CONTRACT.routineCalendar.endHour, 17);
});

test("declared FM1 I/O allocation reconciles to 1,275 without inventing points", () => {
  const { profibus, physical, hammerPelletMill, total } = FM1_CONTRACT.io;
  assert.equal(profibus + physical + hammerPelletMill, total);
  assert.equal(total, 1275);
});

test("contract and P3/P4 update targets remain inactive/proposed until acceptance", () => {
  assert.equal(FM1_CONTRACT.executionStatus, "AWAITING_ACCEPTANCE");
  assert.equal(FM1_SLA_TARGETS.P3.publicUpdate.proposed, true);
  assert.equal(FM1_SLA_TARGETS.P4.publicUpdate.proposed, true);
});
