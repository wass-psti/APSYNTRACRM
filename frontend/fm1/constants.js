export const FM1_CONTRACT = Object.freeze({
  id: "BIOTECH-FM1-2027",
  client: "BIOTECH Farms, Inc.",
  site: "FM1",
  location: "Tantangan, South Cotabato",
  provider: "Watchdog Automation Sales & Services",
  timezone: "Asia/Manila",
  termStart: "2027-01-01T00:00:00+08:00",
  termEndExclusive: "2028-01-01T00:00:00+08:00",
  executionStatus: "AWAITING_ACCEPTANCE",
  monthlyRetainerPhp: 110000,
  annualRetainerPhp: 1320000,
  monthlyMinorAdjustmentAllowanceMinutes: 240,
  p1p2Coverage: "24/7",
  coveredCorrectiveSupportPerTicketHourCap: null,
  controller: "Siemens S7-1516-3 PN/DP",
  scada: "WinCC Professional",
  io: Object.freeze({
    profibus: 227,
    physical: 837,
    hammerPelletMill: 211,
    total: 1275,
  }),
  routineCalendar: Object.freeze({
    startHour: 8,
    endHour: 17,
    weekdays: Object.freeze([1, 2, 3, 4, 5]),
    holidays: Object.freeze([]),
  }),
});

const elapsed = (seconds) => Object.freeze({ mode: "elapsed", seconds });
const support = (hours, proposed = false) =>
  Object.freeze({
    mode: "support",
    seconds: hours * 3600,
    ...(proposed ? { proposed: true } : {}),
  });

export const FM1_SLA_TARGETS = Object.freeze({
  P1: Object.freeze({
    response: elapsed(1800),
    engineeringStart: elapsed(3600),
    restoration: elapsed(14400),
    publicUpdate: elapsed(3600),
  }),
  P2: Object.freeze({
    response: elapsed(3600),
    engineeringStart: elapsed(7200),
    restoration: elapsed(28800),
    publicUpdate: elapsed(7200),
  }),
  P3: Object.freeze({
    response: support(4),
    engineeringStart: support(8),
    restoration: support(27),
    publicUpdate: support(9, true),
  }),
  P4: Object.freeze({
    response: support(9),
    engineeringStart: support(27),
    agreedPlan: support(45),
    publicUpdate: support(45, true),
  }),
});

export const FM1_NAVIGATION = Object.freeze([
  { key: "overview", label: "Overview" },
  { key: "tickets", label: "Tickets" },
  { key: "assets", label: "Assets & I/O" },
  { key: "preventive", label: "Preventive" },
  { key: "engineering", label: "Engineering" },
  { key: "commercial", label: "Commercial" },
  { key: "reports", label: "Reports" },
]);

export const FM1_DRAFT_DB = Object.freeze({
  name: "apsyntra-fm1-local-drafts",
  version: 2,
  store: "intakeDrafts",
});
