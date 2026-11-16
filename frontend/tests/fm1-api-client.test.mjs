import test from "node:test";
import assert from "node:assert/strict";
import { Fm1ApiClient, validateFm1Ticket } from "../fm1/api-client.js";
import { ApiError } from "../session.js";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const TICKET_ID = "00000000-0000-4000-8000-000000000002";
const KEY = "00000000-0000-4000-8000-000000000003";

const ticket = (patch = {}) => ({
  id: TICKET_ID,
  ticket_number: "FM1-2026-000001",
  workspace_id: WORKSPACE,
  revision: 1,
  status: "New",
  received_at: "2026-11-16T06:00:00Z",
  ...patch,
});

function fakeApi(responses = {}) {
  const calls = [];
  return {
    calls,
    api: {
      async rpc(name, args) {
        calls.push({ name, args });
        const response = responses[name];
        if (response instanceof Error) throw response;
        return typeof response === "function" ? response(args) : response;
      },
    },
  };
}

test("FM1 service status uses the active workspace and validates server readiness shape", async () => {
  const fake = fakeApi({
    fm1_service_status_v1: {
      service: {
        execution_state: "awaiting_acceptance",
        readiness_state: "pending",
      },
      decisions: [],
      contract_active: false,
      external_notifications_enabled: false,
    },
  });
  const client = new Fm1ApiClient(fake.api);
  const result = await client.serviceStatus(WORKSPACE);
  assert.equal(result.contract_active, false);
  assert.deepEqual(fake.calls[0], {
    name: "fm1_service_status_v1",
    args: { p_workspace_id: WORKSPACE },
  });
});

test("FM1 ticket queue validates authoritative ticket IDs and pagination counts", async () => {
  const fake = fakeApi({
    fm1_list_tickets_v1: { items: [ticket()], total: 1, limit: 50, offset: 0 },
  });
  const client = new Fm1ApiClient(fake.api);
  const result = await client.listTickets({
    workspaceId: WORKSPACE,
    limit: 50,
    search: " PLC ",
    status: "New",
    priority: "P1",
  });
  assert.equal(result.items[0].ticket_number, "FM1-2026-000001");
  assert.equal(fake.calls[0].args.p_search, "PLC");
  assert.equal(fake.calls[0].args.p_status, "New");
  assert.equal(fake.calls[0].args.p_priority, "P1");
});

test("FM1 ticket submission preserves a caller-supplied idempotency key", async () => {
  const fake = fakeApi({
    fm1_create_ticket_v1: {
      ticket: ticket(),
      idempotent_replay: false,
      sla_activation_state: "NOT_ACTIVE",
    },
  });
  const client = new Fm1ApiClient(fake.api);
  const result = await client.createTicket(
    WORKSPACE,
    {
      requesterName: "Operator",
      callbackNumber: "09171234567",
      subject: "PLC alarm",
      description: "Production line has intermittent PLC alarms.",
      priority: "P1",
      productionImpact: "degraded",
      productionStopped: false,
      safetyConcern: false,
      channel: "portal",
      assetReference: "",
    },
    KEY,
  );
  assert.equal(result.idempotencyKey, KEY);
  assert.equal(fake.calls[0].args.p_idempotency_key, KEY);
  assert.equal(fake.calls[0].args.p_asset_reference, null);
  assert.equal(fake.calls[0].args.p_workspace_id, WORKSPACE);
});

test("FM1 rejects ticket receipts from a different workspace or malformed server identity", async () => {
  assert.throws(
    () => validateFm1Ticket(ticket({ workspace_id: "invalid" })),
    ApiError,
  );
  const fake = fakeApi({
    fm1_create_ticket_v1: {
      ticket: ticket({ workspace_id: "00000000-0000-4000-8000-000000000099" }),
      idempotent_replay: false,
      sla_activation_state: "NOT_ACTIVE",
    },
  });
  const client = new Fm1ApiClient(fake.api);
  await assert.rejects(
    client.createTicket(
      WORKSPACE,
      {
        requesterName: "Operator",
        callbackNumber: "09171234567",
        subject: "PLC alarm",
        description: "Production line has intermittent PLC alarms.",
        priority: "P1",
        productionImpact: "degraded",
        productionStopped: false,
        safetyConcern: false,
        channel: "portal",
      },
      KEY,
    ),
    /does not match this workspace/,
  );
});

test("FM1 ticket detail requires obligations, events, milestones, holds and audit history", async () => {
  const fake = fakeApi({
    fm1_ticket_detail_v1: {
      ticket: ticket(),
      obligations: [],
      events: [],
      milestones: [],
      holds: [],
      audit: [],
    },
  });
  const client = new Fm1ApiClient(fake.api);
  const detail = await client.ticketDetail(WORKSPACE, TICKET_ID);
  assert.equal(detail.ticket.id, TICKET_ID);
  assert.deepEqual(detail.audit, []);
  assert.equal(fake.calls[0].name, "fm1_ticket_detail_v1");
});

test("FM1 lifecycle and milestone writes carry the authoritative revision", async () => {
  const fake = fakeApi({
    fm1_transition_ticket_v1: {
      ticket: ticket({ status: "Triaged", revision: 2 }),
    },
    fm1_record_milestone_v1: {
      milestone: { id: KEY, metric: "human_response" },
      ticket_revision: 3,
    },
  });
  const client = new Fm1ApiClient(fake.api);
  await client.transitionTicket(
    WORKSPACE,
    ticket(),
    "Triaged",
    "Initial triage",
    null,
    KEY,
  );
  await client.recordMilestone(
    WORKSPACE,
    ticket({ revision: 2 }),
    {
      metric: "human_response",
      channel: "portal",
      evidence: "Technician acknowledged and contacted the requester.",
      humanConfirmed: true,
    },
    KEY,
  );
  assert.equal(fake.calls[0].args.p_expected_revision, 1);
  assert.equal(fake.calls[0].args.p_idempotency_key, KEY);
  assert.equal(fake.calls[1].args.p_expected_revision, 2);
  assert.equal(fake.calls[1].args.p_human_confirmed, true);
});

test("FM1 hold operations use explicit hold evidence and do not add role-specific UI gates", async () => {
  const fake = fakeApi({
    fm1_request_hold_v1: { hold: { id: KEY, validation_state: "pending" } },
    fm1_validate_hold_v1: { hold: { id: KEY, validation_state: "validated" } },
    fm1_end_hold_v1: { hold: { id: KEY, validation_state: "ended" } },
  });
  const client = new Fm1ApiClient(fake.api);
  await client.requestHold(
    WORKSPACE,
    TICKET_ID,
    {
      metric: "engineering_start",
      reason: "missing_access",
      externalOwner: "Client maintenance",
      requiredAction: "Restore the controller cabinet access",
      evidence: "Access was unavailable at the time of the service visit.",
    },
    KEY,
  );
  await client.validateHold(
    WORKSPACE,
    KEY,
    "validated",
    "Access dependency confirmed.",
    true,
    KEY,
  );
  await client.endHold(WORKSPACE, KEY, "Site access restored.", KEY);
  assert.deepEqual(
    fake.calls.map((call) => call.name),
    ["fm1_request_hold_v1", "fm1_validate_hold_v1", "fm1_end_hold_v1"],
  );
});
