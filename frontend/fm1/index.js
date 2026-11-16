export { mountFm1Application, unmountFm1Application } from "./components.js";

export { FM1_CONTRACT, FM1_SLA_TARGETS, FM1_NAVIGATION } from "./constants.js";
export {
  buildSupportIntervals,
  supportSecondsBetween,
  mergeIntervals,
  getSlaTarget,
  metricAllowsHold,
  calculateSlaDeadline,
  calculateSlaElapsed,
} from "./domain/sla-clock.js";
export {
  fm1IntakeSchema,
  parseFm1Intake,
  createFm1LocalDraft,
} from "./domain/intake-schema.js";

export {
  Fm1ApiClient,
  createFm1IdempotencyKey,
  validateFm1Ticket,
} from "./api-client.js";
