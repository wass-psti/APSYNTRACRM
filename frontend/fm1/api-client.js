import { requireUuid } from "../data.js";
import { ApiError } from "../session.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);
const STATUSES = new Set([
  "New",
  "Triaged",
  "Assigned",
  "In Progress",
  "Waiting",
  "Restored",
  "Resolution Review",
  "Closed",
  "Reopened",
  "Duplicate",
  "Cancelled",
]);
const METRICS = new Set([
  "human_response",
  "engineering_start",
  "public_update",
  "restoration",
]);

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(message, 409, "INVALID_FM1_RESPONSE");
  }
  return value;
}

function assertTicket(value) {
  const ticket = assertObject(value, "FM1 returned an invalid ticket receipt.");
  if (
    !UUID.test(ticket.id || "") ||
    !/^FM1-\d{4}-\d{6}$/.test(ticket.ticket_number || "") ||
    !UUID.test(ticket.workspace_id || "") ||
    !Number.isSafeInteger(ticket.revision) ||
    !Number.isFinite(Date.parse(ticket.received_at || "")) ||
    !STATUSES.has(ticket.status)
  ) {
    throw new ApiError(
      "FM1 ticket receipt could not be verified.",
      409,
      "INVALID_FM1_TICKET",
    );
  }
  return ticket;
}

function idempotencyKey() {
  const key = globalThis.crypto?.randomUUID?.();
  if (!key)
    throw new ApiError("This browser cannot create a safe request identifier.");
  return key;
}

export class Fm1ApiClient {
  constructor(api) {
    if (!api || typeof api.rpc !== "function") {
      throw new TypeError("FM1 requires the existing APSYNTRA DomainApi.");
    }
    this.api = api;
    // Session-local, bounded guard: a revision already rejected by the server
    // cannot become current until an authoritative ticket reload supplies
    // a newer revision. Never persist revisions or cache permission decisions.
    this.staleTicketEdits = new Set();
  }

  async serviceStatus(workspaceId) {
    const result = await this.api.rpc("fm1_service_status_v1", {
      p_workspace_id: requireUuid(workspaceId),
    });
    assertObject(result, "FM1 service status is unavailable.");
    if (
      !result.service ||
      !Array.isArray(result.decisions) ||
      !Array.isArray(result.assignees) ||
      !result.metrics ||
      !Array.isArray(result.unassigned_urgent) ||
      !result.notification_delivery
    ) {
      throw new ApiError(
        "FM1 service status response is incomplete.",
        409,
        "INVALID_FM1_STATUS",
      );
    }
    return result;
  }

  async listTickets({
    workspaceId,
    limit = 50,
    offset = 0,
    search = "",
    status = null,
    priority = null,
  } = {}) {
    const result = await this.api.rpc("fm1_list_tickets_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_limit: limit,
      p_offset: offset,
      p_search: search.trim() || null,
      p_status: status || null,
      p_priority: priority || null,
    });
    assertObject(result, "FM1 ticket queue is unavailable.");
    if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total)) {
      throw new ApiError(
        "FM1 ticket queue response is invalid.",
        409,
        "INVALID_FM1_QUEUE",
      );
    }
    return { ...result, items: result.items.map(assertTicket) };
  }

  async ticketDetail(workspaceId, ticketId) {
    const result = await this.api.rpc("fm1_ticket_detail_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: requireUuid(ticketId),
    });
    assertObject(result, "FM1 ticket details are unavailable.");
    result.ticket = assertTicket(result.ticket);
    for (const key of [
      "obligations",
      "events",
      "milestones",
      "holds",
      "audit",
      "conversations",
    ]) {
      if (!Array.isArray(result[key])) {
        throw new ApiError(
          "FM1 ticket detail is missing " + key + ".",
          409,
          "INVALID_FM1_DETAIL",
        );
      }
    }
    return result;
  }

  async createTicket(workspaceId, input, key = idempotencyKey()) {
    const result = await this.api.rpc("fm1_create_ticket_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_idempotency_key: key,
      p_requester_name: input.requesterName,
      p_callback_number: input.callbackNumber,
      p_subject: input.subject,
      p_description: input.description,
      p_priority: input.priority,
      p_production_impact: input.productionImpact,
      p_production_stopped: input.productionStopped === true,
      p_safety_concern: input.safetyConcern === true,
      p_channel: input.channel,
      p_asset_reference: input.assetReference || null,
      p_reported_occurred_at: input.reportedOccurredAt || null,
    });
    assertObject(result, "FM1 ticket submission returned no receipt.");
    result.ticket = assertTicket(result.ticket);
    if (
      result.ticket.workspace_id !== workspaceId ||
      typeof result.idempotent_replay !== "boolean"
    ) {
      throw new ApiError(
        "FM1 ticket submission receipt does not match this workspace.",
        409,
        "INVALID_FM1_RECEIPT",
      );
    }
    return { ...result, idempotencyKey: key };
  }

  async transitionTicket(
    workspaceId,
    ticket,
    nextStatus,
    reason,
    evidence = null,
    key = idempotencyKey(),
  ) {
    assertTicket(ticket);
    if (!STATUSES.has(nextStatus))
      throw new ApiError("Select a valid FM1 status.");
    const result = await this.api.rpc("fm1_transition_ticket_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: ticket.id,
      p_expected_revision: ticket.revision,
      p_next_status: nextStatus,
      p_reason: reason,
      p_idempotency_key: key,
      p_client_operator: null,
      p_evidence: evidence,
    });
    assertObject(result, "FM1 transition receipt is unavailable.");
    result.ticket = assertTicket(result.ticket);
    return result;
  }

  async recordMilestone(
    workspaceId,
    ticket,
    milestone,
    key = idempotencyKey(),
  ) {
    assertTicket(ticket);
    if (!METRICS.has(milestone.metric))
      throw new ApiError("Select a valid FM1 milestone.");
    const result = await this.api.rpc("fm1_record_milestone_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: ticket.id,
      p_expected_revision: ticket.revision,
      p_metric: milestone.metric,
      p_channel: milestone.channel,
      p_evidence: milestone.evidence,
      p_idempotency_key: key,
      p_human_confirmed: milestone.humanConfirmed === true,
      p_client_operator: milestone.clientOperator || null,
      p_occurred_at: milestone.occurredAt || null,
    });
    assertObject(result, "FM1 milestone receipt is unavailable.");
    if (!result.milestone || !UUID.test(result.milestone.id || "")) {
      throw new ApiError(
        "FM1 milestone receipt could not be verified.",
        409,
        "INVALID_FM1_MILESTONE",
      );
    }
    return result;
  }

  async recordPriority(
    workspaceId,
    ticket,
    priority,
    reason,
    key = idempotencyKey(),
  ) {
    assertTicket(ticket);
    if (
      !PRIORITIES.has(priority.requested) ||
      !PRIORITIES.has(priority.effective) ||
      (priority.confirmed && !PRIORITIES.has(priority.confirmed))
    ) {
      throw new ApiError("Select valid FM1 priority values.");
    }
    return this.api.rpc("fm1_record_priority_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: ticket.id,
      p_expected_revision: ticket.revision,
      p_requested_priority: priority.requested,
      p_effective_priority: priority.effective,
      p_confirmed_priority: priority.confirmed || null,
      p_reason: reason,
      p_idempotency_key: key,
    });
  }

  async assignTicket(workspaceId, ticket, assigneeId, key = idempotencyKey()) {
    assertTicket(ticket);
    return this.api.rpc("fm1_assign_ticket_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: ticket.id,
      p_expected_revision: ticket.revision,
      p_assignee_id: assigneeId ? requireUuid(assigneeId) : null,
      p_idempotency_key: key,
    });
  }

  async addConversation(
    workspaceId,
    ticket,
    visibility,
    body,
    key = idempotencyKey(),
  ) {
    assertTicket(ticket);
    if (!["internal", "customer_update"].includes(visibility)) {
      throw new ApiError("Select a valid FM1 conversation type.");
    }
    const message = String(body || "").trim();
    if (message.length < 1 || message.length > 4000) {
      throw new ApiError(
        "Conversation messages must contain 1–4,000 characters.",
      );
    }
    return this.api.rpc("fm1_add_conversation_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: ticket.id,
      p_expected_revision: ticket.revision,
      p_visibility: visibility,
      p_body: message,
      p_idempotency_key: key,
    });
  }

  async updateTicket(workspaceId, ticket, input, key = idempotencyKey()) {
    assertTicket(ticket);
    const revisionKey = workspaceId + ":" + ticket.id + ":" + ticket.revision;
    if (this.staleTicketEdits.has(revisionKey)) {
      throw new ApiError(
        "FM1 ticket revision changed; refresh before retrying",
        409,
        "40001",
      );
    }
    if (ticket.workspace_id !== workspaceId) {
      throw new ApiError(
        "FM1 incident does not belong to the active workspace.",
        409,
        "FM1_WORKSPACE_MISMATCH",
      );
    }
    const fields = {
      requesterName: String(input.requesterName || "").trim(),
      callbackNumber: String(input.callbackNumber || "").trim(),
      subject: String(input.subject || "").trim(),
      description: String(input.description || "").trim(),
      productionImpact: String(input.productionImpact || ""),
      productionStopped: input.productionStopped === true,
      safetyConcern: input.safetyConcern === true,
      assetReference: String(input.assetReference || "").trim() || null,
    };
    if (
      fields.requesterName.length < 2 ||
      fields.requesterName.length > 120 ||
      fields.callbackNumber.length < 7 ||
      fields.callbackNumber.length > 32 ||
      fields.subject.length < 4 ||
      fields.subject.length > 160 ||
      fields.description.length < 10 ||
      fields.description.length > 4000 ||
      !["critical", "degraded", "no-impact"].includes(
        fields.productionImpact,
      ) ||
      (fields.assetReference && fields.assetReference.length > 160)
    ) {
      throw new ApiError("Check the incident details and field lengths.");
    }
    let result;
    try {
      result = await this.api.rpc("fm1_update_ticket_v1", {
        p_workspace_id: requireUuid(workspaceId),
        p_ticket_id: ticket.id,
        p_expected_revision: ticket.revision,
        p_requester_name: fields.requesterName,
        p_callback_number: fields.callbackNumber,
        p_subject: fields.subject,
        p_description: fields.description,
        p_production_impact: fields.productionImpact,
        p_production_stopped: fields.productionStopped,
        p_safety_concern: fields.safetyConcern,
        p_asset_reference: fields.assetReference,
        p_idempotency_key: key,
      });
    } catch (error) {
      // A confirmed optimistic-concurrency mismatch is deterministic for
      // this revision. Do not create another rollback by resubmitting it.
      // Network timeouts, serialization failures with other causes and
      // unknown outcomes must remain retriable with the same request key.
      if (
        error?.code === "40001" &&
        error.message?.includes("FM1 ticket revision changed")
      ) {
        if (this.staleTicketEdits.size >= 128)
          this.staleTicketEdits.delete(
            this.staleTicketEdits.values().next().value,
          );
        this.staleTicketEdits.add(revisionKey);
      }
      throw error;
    }
    assertObject(result, "FM1 incident update receipt is unavailable.");
    result.ticket = assertTicket(result.ticket);
    if (
      result.ticket.workspace_id !== workspaceId ||
      typeof result.idempotent_replay !== "boolean"
    ) {
      throw new ApiError(
        "FM1 incident update receipt does not match this workspace.",
        409,
        "INVALID_FM1_UPDATE",
      );
    }
    return { ...result, idempotencyKey: key };
  }

  async operationalReport(workspaceId) {
    const result = await this.api.rpc("fm1_operational_report_v1", {
      p_workspace_id: requireUuid(workspaceId),
    });
    assertObject(result, "FM1 operational report is unavailable.");
    const arrays = [
      "assignee_breakdown",
      "unassigned_urgent",
      "current_assignments",
      "sla_active_incidents",
      "approaching_deadlines",
      "breached_obligations",
      "recent_escalations",
      "recent_lifecycle_history",
    ];
    if (
      !result.metrics ||
      !result.metrics.status_breakdown ||
      !result.metrics.priority_breakdown ||
      !result.metrics.assignment_breakdown ||
      !result.metrics.obligation_breakdown ||
      !result.metrics.milestone_breakdown ||
      arrays.some((key) => !Array.isArray(result[key])) ||
      !result.notification_delivery
    ) {
      throw new ApiError(
        "FM1 operational report response is incomplete.",
        409,
        "INVALID_FM1_REPORT",
      );
    }
    return result;
  }

  async deadlineWarningPolicy(workspaceId) {
    const result = await this.api.rpc("fm1_deadline_warning_policy_v1", {
      p_workspace_id: requireUuid(workspaceId),
    });
    assertObject(result, "FM1 deadline warning policy is unavailable.");
    if (
      result.workspace_id !== workspaceId ||
      typeof result.enabled !== "boolean" ||
      !["NOT_CONFIGURED", "INACTIVE", "ACTIVE"].includes(result.policy_state)
    ) {
      throw new ApiError(
        "FM1 deadline warning policy response is invalid.",
        409,
        "INVALID_FM1_WARNING_POLICY",
      );
    }
    return result;
  }

  async updateDeadlineWarningPolicy(workspaceId, policy) {
    const seconds = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200) {
        throw new ApiError(
          "Warning thresholds must be between 1 and 43,200 minutes.",
        );
      }
      return minutes * 60;
    };
    const enabled = policy.enabled === true;
    const thresholds = {
      human: seconds(policy.humanResponseMinutes),
      engineering: seconds(policy.engineeringStartMinutes),
      restoration: seconds(policy.restorationMinutes),
    };
    if (enabled && Object.values(thresholds).every((value) => value === null)) {
      throw new ApiError(
        "Set at least one deadline threshold before enabling warnings.",
      );
    }
    const result = await this.api.rpc("fm1_update_deadline_warning_policy_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_enabled: enabled,
      p_human_response_before_seconds: thresholds.human,
      p_engineering_start_before_seconds: thresholds.engineering,
      p_restoration_before_seconds: thresholds.restoration,
    });
    assertObject(
      result,
      "FM1 deadline warning policy update was not confirmed.",
    );
    if (
      result.workspace_id !== workspaceId ||
      typeof result.enabled !== "boolean" ||
      !["NOT_CONFIGURED", "INACTIVE", "ACTIVE"].includes(result.policy_state)
    ) {
      throw new ApiError(
        "FM1 deadline warning policy update response is invalid.",
        409,
        "INVALID_FM1_WARNING_POLICY",
      );
    }
    return result;
  }

  async notificationInbox(workspaceId, { limit = 50, offset = 0 } = {}) {
    const result = await this.api.rpc("fm1_notification_inbox_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_limit: limit,
      p_offset: offset,
    });
    assertObject(result, "FM1 notification inbox is unavailable.");
    if (
      !Array.isArray(result.items) ||
      !Number.isSafeInteger(result.unread_total)
    ) {
      throw new ApiError(
        "FM1 notification inbox response is invalid.",
        409,
        "INVALID_FM1_NOTIFICATIONS",
      );
    }
    return result;
  }

  async markNotificationRead(workspaceId, notificationId) {
    const result = await this.api.rpc("fm1_notification_mark_read_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_notification_id: requireUuid(notificationId),
    });
    assertObject(result, "FM1 notification receipt is unavailable.");
    if (
      !UUID.test(result.notification?.id || "") ||
      !result.notification.read_at
    ) {
      throw new ApiError(
        "FM1 notification read receipt is invalid.",
        409,
        "INVALID_FM1_NOTIFICATION",
      );
    }
    return result;
  }

  async requestHold(workspaceId, ticketId, hold, key = idempotencyKey()) {
    return this.api.rpc("fm1_request_hold_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_ticket_id: requireUuid(ticketId),
      p_metric: hold.metric,
      p_reason: hold.reason,
      p_external_owner: hold.externalOwner,
      p_required_action: hold.requiredAction,
      p_evidence: hold.evidence,
      p_expected_review_at: hold.expectedReviewAt || null,
      p_idempotency_key: key,
    });
  }

  async validateHold(
    workspaceId,
    holdId,
    decision,
    evidence,
    diagnosisBlocked,
    key = idempotencyKey(),
  ) {
    return this.api.rpc("fm1_validate_hold_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_hold_id: requireUuid(holdId),
      p_decision: decision,
      p_evidence: evidence,
      p_remote_and_guided_diagnosis_blocked: diagnosisBlocked === true,
      p_idempotency_key: key,
    });
  }

  async endHold(workspaceId, holdId, reason, key = idempotencyKey()) {
    return this.api.rpc("fm1_end_hold_v1", {
      p_workspace_id: requireUuid(workspaceId),
      p_hold_id: requireUuid(holdId),
      p_end_reason: reason,
      p_idempotency_key: key,
    });
  }
}

export {
  idempotencyKey as createFm1IdempotencyKey,
  assertTicket as validateFm1Ticket,
};
