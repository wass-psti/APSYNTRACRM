import { FM1_CONTRACT, FM1_NAVIGATION, FM1_SLA_TARGETS } from "./constants.js";
import { fm1Store } from "./state.js";
import { listFm1Drafts, saveFm1Draft, deleteFm1Draft } from "./draft-store.js";
import { createFm1LocalDraft, parseFm1Intake } from "./domain/intake-schema.js";
import { Fm1ApiClient, createFm1IdempotencyKey } from "./api-client.js";

const NEXT_STATUSES = Object.freeze({
  New: ["Triaged", "Duplicate", "Cancelled"],
  Triaged: ["Assigned", "Duplicate", "Cancelled"],
  Assigned: ["In Progress", "Waiting", "Duplicate", "Cancelled"],
  "In Progress": ["Waiting", "Restored", "Duplicate", "Cancelled"],
  Waiting: ["In Progress", "Restored", "Duplicate", "Cancelled"],
  Restored: ["Resolution Review", "Reopened", "Duplicate", "Cancelled"],
  "Resolution Review": ["Closed", "Reopened", "Duplicate", "Cancelled"],
  Closed: ["Reopened"],
  Reopened: [
    "Triaged",
    "Assigned",
    "In Progress",
    "Waiting",
    "Restored",
    "Duplicate",
    "Cancelled",
  ],
  Duplicate: [],
  Cancelled: [],
});

const statusTone = (status) => {
  if (["Closed", "Restored"].includes(status)) return "success";
  if (["Cancelled", "Duplicate"].includes(status)) return "neutral";
  if (["Waiting", "Resolution Review"].includes(status)) return "warning";
  if (["In Progress", "Assigned"].includes(status)) return "success";
  return "neutral";
};

const metricLabel = (metric) =>
  ({
    human_response: "Human response",
    engineering_start: "Engineering start",
    restoration: "Restoration",
    agreed_plan: "Agreed plan",
    public_update: "Public update",
  })[metric] || metric;

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const updateStore = (patch) => fm1Store.set({ ...fm1Store.get(), ...patch });

const formatPhp = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (value) => {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: FM1_CONTRACT.timezone,
    }).format(new Date(value));
  } catch {
    return "Date unavailable";
  }
};

const targetLabel = (target) => {
  if (!target) return "—";
  if (target.mode === "elapsed") {
    const minutes = target.seconds / 60;
    return minutes < 60
      ? minutes + " elapsed min"
      : minutes / 60 + " elapsed hr";
  }
  return target.seconds / 3600 + " support hr";
};

const metricCard = ({ label, value, detail, symbol = "•" }) =>
  '<article class="fm1-metric-card">' +
  '<div class="fm1-metric-top"><span>' +
  escapeHtml(label) +
  '</span><span class="fm1-metric-symbol" aria-hidden="true">' +
  escapeHtml(symbol) +
  "</span></div><strong>" +
  escapeHtml(value) +
  "</strong><p>" +
  escapeHtml(detail) +
  "</p></article>";

const statusBadge = (label = "Status", tone = "neutral") => {
  const safeTone = ["neutral", "warning", "success", "danger"].includes(tone)
    ? tone
    : "neutral";
  return (
    '<span class="fm1-badge fm1-badge-' +
    safeTone +
    '">' +
    escapeHtml(label) +
    "</span>"
  );
};

class Fm1Application {
  get scopeKey() {
    return this.userId + "::" + this.workspaceId;
  }

  constructor(root, { userId, workspaceId, api } = {}) {
    this.root = root;
    this.userId = userId || "unscoped";
    this.workspaceId = workspaceId || "unscoped";
    this.api = api ? new Fm1ApiClient(api) : null;
    this.handleClick = this.handleClick.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.unsubscribe = null;
  }

  connect() {
    const scopeKey = this.scopeKey;
    if (fm1Store.get().scopeKey !== scopeKey) {
      fm1Store.set({
        ...fm1Store.get(),
        scopeKey,
        view: "overview",
        drafts: [],
        draftsLoaded: false,
        busy: false,
        notice: "",
        error: "",
        serviceStatus: null,
        serverTickets: [],
        serverTotal: 0,
        notifications: [],
        notificationUnreadTotal: 0,
        notificationLoading: false,
        serverLoading: false,
        serverBusy: false,
        serverError: "",
        selectedTicketId: null,
        selectedTicketDetail: null,
        pendingIntake: null,
      });
    }
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("submit", this.handleSubmit);
    this.unsubscribe = fm1Store.subscribe(() => this.render());
    if (!fm1Store.get().draftsLoaded) void this.hydrateDrafts();
    if (this.api) void this.loadServerData();
    else updateStore({ serverError: "FM1 server connection is unavailable." });
  }

  disconnect() {
    this.root?.removeEventListener("click", this.handleClick);
    this.root?.removeEventListener("submit", this.handleSubmit);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async hydrateDrafts() {
    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;
    try {
      const drafts = await listFm1Drafts(scopeKey);
      if (!isCurrentScope()) return;
      updateStore({ drafts, error: "" });
    } catch (error) {
      if (!isCurrentScope()) return;
      fm1Store.setKey(
        "error",
        error?.message || "Local draft storage is unavailable.",
      );
    } finally {
      if (isCurrentScope()) fm1Store.setKey("draftsLoaded", true);
    }
  }

  async loadServerData() {
    if (!this.api || !this.workspaceId || this.workspaceId === "unscoped")
      return;
    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;
    updateStore({
      serverLoading: true,
      notificationLoading: true,
      serverError: "",
    });
    try {
      const [serviceStatus, queue, inbox] = await Promise.all([
        this.api.serviceStatus(this.workspaceId),
        this.api.listTickets({
          workspaceId: this.workspaceId,
          limit: 50,
          offset: 0,
        }),
        this.api.notificationInbox(this.workspaceId, { limit: 50, offset: 0 }),
      ]);
      if (!isCurrentScope()) return;
      updateStore({
        serviceStatus,
        serverTickets: queue.items,
        serverTotal: queue.total,
        notifications: inbox.items,
        notificationUnreadTotal: inbox.unread_total,
        notificationLoading: false,
        serverLoading: false,
        serverError: "",
      });
    } catch (error) {
      if (!isCurrentScope()) return;
      updateStore({
        notificationLoading: false,
        serverLoading: false,
        serverError:
          error?.message || "Unable to load the FM1 incident service.",
      });
    }
  }

  async loadTicket(ticketId) {
    if (!this.api || !ticketId) return;
    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;
    updateStore({
      view: "ticket-detail",
      selectedTicketId: ticketId,
      selectedTicketDetail: null,
      serverLoading: true,
      serverError: "",
    });
    try {
      const detail = await this.api.ticketDetail(this.workspaceId, ticketId);
      if (!isCurrentScope() || fm1Store.get().selectedTicketId !== ticketId)
        return;
      updateStore({ selectedTicketDetail: detail, serverLoading: false });
    } catch (error) {
      if (!isCurrentScope()) return;
      updateStore({
        serverLoading: false,
        serverError: error?.message || "Unable to load this FM1 ticket.",
      });
    }
  }

  async refreshTicketAndQueue(ticketId) {
    await this.loadServerData();
    if (ticketId) await this.loadTicket(ticketId);
  }

  handleClick(event) {
    const tab = event.target.closest("[data-fm1-view]");
    if (tab) {
      updateStore({
        view: tab.dataset.fm1View,
        notice: "",
        error: "",
        serverError: "",
        selectedTicketId: null,
        selectedTicketDetail: null,
      });
      return;
    }
    const action = event.target.closest("[data-fm1-action]");
    if (!action) return;
    const kind = action.dataset.fm1Action;
    if (kind === "new-ticket") {
      updateStore({
        view: "new-ticket",
        notice: "",
        error: "",
        serverError: "",
      });
    } else if (kind === "back-to-tickets") {
      updateStore({
        view: "tickets",
        notice: "",
        error: "",
        selectedTicketId: null,
        selectedTicketDetail: null,
      });
    } else if (kind === "refresh-drafts") {
      void this.hydrateDrafts();
    } else if (kind === "save-draft") {
      void this.saveCurrentDraft();
    } else if (kind === "refresh-server") {
      void this.loadServerData();
    } else if (kind === "view-ticket") {
      void this.loadTicket(action.dataset.id);
    } else if (kind === "open-notification-ticket") {
      void this.loadTicket(action.dataset.ticketId);
    } else if (kind === "mark-notification-read") {
      void this.markNotificationRead(action.dataset.id);
    } else if (kind === "delete-draft") {
      void this.removeDraft(action.dataset.id);
    }
  }

  async markNotificationRead(notificationId) {
    if (!this.api || !notificationId) return;
    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;
    updateStore({ notificationLoading: true, serverError: "" });
    try {
      await this.api.markNotificationRead(this.workspaceId, notificationId);
      if (!isCurrentScope()) return;
      await this.loadServerData();
      if (isCurrentScope())
        updateStore({ notice: "Notification marked as read." });
    } catch (error) {
      if (!isCurrentScope()) return;
      updateStore({
        notificationLoading: false,
        serverError:
          error?.message || "Unable to update this FM1 notification.",
      });
    }
  }

  async saveCurrentDraft() {
    const form = this.root.querySelector("[data-fm1-intake-form]");
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    const parsed = parseFm1Intake({
      requesterName: data.get("requesterName"),
      callbackNumber: data.get("callbackNumber"),
      subject: data.get("subject"),
      description: data.get("description"),
      priority: data.get("priority"),
      productionImpact: data.get("productionImpact"),
      productionStopped: data.get("productionStopped") === "on",
      safetyConcern: data.get("safetyConcern") === "on",
      channel: data.get("channel"),
      assetReference: data.get("assetReference") || "",
    });
    if (!parsed.ok) {
      fm1Store.setKey(
        "error",
        parsed.errors[0]?.message || "Check the intake details.",
      );
      return;
    }
    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;
    updateStore({ busy: true, error: "", notice: "" });
    try {
      const draft = createFm1LocalDraft(parsed.data, { scopeKey });
      await saveFm1Draft(draft);
      const drafts = await listFm1Drafts(scopeKey);
      if (!isCurrentScope()) return;
      updateStore({
        view: "tickets",
        drafts,
        busy: false,
        error: "",
        notice:
          "Saved as a browser-local draft. No live incident was submitted.",
      });
    } catch (error) {
      if (!isCurrentScope()) return;
      updateStore({
        busy: false,
        error:
          error?.message ||
          "The draft could not be saved. No incident was submitted.",
      });
    }
  }

  async removeDraft(id) {
    if (!id) return;
    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;
    fm1Store.setKey("busy", true);
    try {
      const removed = await deleteFm1Draft(id, scopeKey);
      if (!removed)
        throw new Error(
          "This local draft no longer exists in the current workspace.",
        );
      const drafts = await listFm1Drafts(scopeKey);
      if (isCurrentScope())
        updateStore({ drafts, notice: "Local draft deleted.", error: "" });
    } catch (error) {
      if (isCurrentScope())
        fm1Store.setKey(
          "error",
          error?.message || "Unable to delete the local draft.",
        );
    } finally {
      if (isCurrentScope()) fm1Store.setKey("busy", false);
    }
  }

  async handleSubmit(event) {
    const form = event.target.closest(
      "[data-fm1-intake-form], [data-fm1-transition-form], [data-fm1-milestone-form], [data-fm1-priority-form], [data-fm1-hold-form], [data-fm1-hold-review-form], [data-fm1-hold-end-form], [data-fm1-assignment-form], [data-fm1-conversation-form]",
    );
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!this.api) {
      updateStore({ serverError: "FM1 server connection is unavailable." });
      return;
    }

    const scopeKey = this.scopeKey;
    const isCurrentScope = () =>
      this.root?.isConnected === true &&
      this.scopeKey === scopeKey &&
      fm1Store.get().scopeKey === scopeKey;

    if (form.matches("[data-fm1-intake-form]")) {
      const data = new FormData(form);
      const parsed = parseFm1Intake({
        requesterName: data.get("requesterName"),
        callbackNumber: data.get("callbackNumber"),
        subject: data.get("subject"),
        description: data.get("description"),
        priority: data.get("priority"),
        productionImpact: data.get("productionImpact"),
        productionStopped: data.get("productionStopped") === "on",
        safetyConcern: data.get("safetyConcern") === "on",
        channel: data.get("channel"),
        assetReference: data.get("assetReference") || "",
      });
      if (!parsed.ok) {
        fm1Store.setKey(
          "error",
          parsed.errors[0]?.message || "Check the intake details.",
        );
        return;
      }
      const fingerprint = JSON.stringify(parsed.data);
      const pending = fm1Store.get().pendingIntake;
      const key =
        pending?.fingerprint === fingerprint
          ? pending.key
          : createFm1IdempotencyKey();
      updateStore({
        pendingIntake: { key, fingerprint },
        serverBusy: true,
        error: "",
        serverError: "",
        notice: "",
      });
      try {
        const receipt = await this.api.createTicket(
          this.workspaceId,
          parsed.data,
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          pendingIntake: null,
          serverBusy: false,
          view: "ticket-detail",
          selectedTicketId: receipt.ticket.id,
          selectedTicketDetail: null,
          notice:
            "Incident recorded as " +
            receipt.ticket.ticket_number +
            ". SLA activation: " +
            receipt.sla_activation_state +
            ".",
        });
        await this.refreshTicketAndQueue(receipt.ticket.id);
      } catch (error) {
        if (!isCurrentScope()) return;
        updateStore({
          serverBusy: false,
          serverError:
            error?.message ||
            "Ticket submission could not be confirmed. Retry using the same intake details.",
        });
      }
      return;
    }

    const ticket = fm1Store.get().selectedTicketDetail?.ticket;
    if (!ticket) {
      updateStore({
        serverError: "Reload the ticket before recording a change.",
      });
      return;
    }

    const data = new FormData(form);
    const operation = form.matches("[data-fm1-transition-form]")
      ? "transition"
      : form.matches("[data-fm1-milestone-form]")
        ? "milestone"
        : form.matches("[data-fm1-priority-form]")
          ? "priority"
          : form.matches("[data-fm1-hold-form]")
            ? "hold-request"
            : form.matches("[data-fm1-hold-review-form]")
              ? "hold-review"
              : form.matches("[data-fm1-assignment-form]")
                ? "assignment"
                : form.matches("[data-fm1-conversation-form]")
                  ? "conversation"
                  : "hold-end";
    const payload = Object.fromEntries(data.entries());
    const fingerprint = JSON.stringify({
      operation,
      ticketId: ticket.id,
      payload,
    });
    const key =
      form.dataset.idempotencyFingerprint === fingerprint &&
      form.dataset.idempotencyKey
        ? form.dataset.idempotencyKey
        : createFm1IdempotencyKey();
    form.dataset.idempotencyFingerprint = fingerprint;
    form.dataset.idempotencyKey = key;
    const submitButton =
      event.submitter || form.querySelector('button[type="submit"]');
    const originalSubmitLabel = submitButton?.textContent || "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving…";
    }
    try {
      if (operation === "transition") {
        const nextStatus = String(data.get("nextStatus") || "");
        const reason = String(data.get("reason") || "").trim();
        const evidence =
          String(data.get("closureSummary") || "").trim() || null;
        await this.api.transitionTicket(
          this.workspaceId,
          ticket,
          nextStatus,
          reason,
          nextStatus === "Closed" ? evidence : null,
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice: "Ticket status updated to " + nextStatus + ".",
          serverBusy: false,
        });
      } else if (operation === "milestone") {
        const metric = String(data.get("metric") || "");
        await this.api.recordMilestone(
          this.workspaceId,
          ticket,
          {
            metric,
            channel: String(data.get("channel") || "portal"),
            evidence: String(data.get("evidence") || "").trim(),
            humanConfirmed: data.get("humanConfirmed") === "on",
            clientOperator: String(data.get("clientOperator") || "").trim(),
          },
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice: metricLabel(metric) + " milestone recorded.",
          serverBusy: false,
        });
      } else if (operation === "priority") {
        await this.api.recordPriority(
          this.workspaceId,
          ticket,
          {
            requested: String(data.get("requestedPriority") || ""),
            effective: String(data.get("effectivePriority") || ""),
            confirmed: String(data.get("confirmedPriority") || "") || null,
          },
          String(data.get("reason") || "").trim(),
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice:
            "Priority event recorded. SLA recalculation follows the current D03 decision state.",
          serverBusy: false,
        });
      } else if (operation === "hold-request") {
        await this.api.requestHold(
          this.workspaceId,
          ticket.id,
          {
            metric: String(data.get("metric") || ""),
            reason: String(data.get("reason") || ""),
            externalOwner: String(data.get("externalOwner") || "").trim(),
            requiredAction: String(data.get("requiredAction") || "").trim(),
            evidence: String(data.get("evidence") || "").trim(),
            expectedReviewAt: data.get("expectedReviewAt")
              ? new Date(String(data.get("expectedReviewAt"))).toISOString()
              : null,
          },
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice:
            "Dependency hold request recorded. No SLA clock was paused pending validation.",
          serverBusy: false,
        });
      } else if (operation === "assignment") {
        const assigneeId = String(data.get("assigneeId") || "").trim() || null;
        await this.api.assignTicket(this.workspaceId, ticket, assigneeId, key);
        if (!isCurrentScope()) return;
        updateStore({
          notice: assigneeId
            ? "Ticket assignment updated."
            : "Ticket unassigned.",
          serverBusy: false,
        });
      } else if (operation === "conversation") {
        const visibility = String(data.get("visibility") || "internal");
        await this.api.addConversation(
          this.workspaceId,
          ticket,
          visibility,
          String(data.get("body") || "").trim(),
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice:
            visibility === "customer_update"
              ? "Customer update recorded. External delivery is not configured."
              : "Internal conversation recorded.",
          serverBusy: false,
        });
      } else if (operation === "hold-review") {
        await this.api.validateHold(
          this.workspaceId,
          String(form.dataset.holdId || ""),
          String(data.get("decision") || ""),
          String(data.get("evidence") || "").trim(),
          data.get("diagnosisBlocked") === "on",
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice: "Dependency hold review recorded.",
          serverBusy: false,
        });
      } else {
        await this.api.endHold(
          this.workspaceId,
          String(form.dataset.holdId || ""),
          String(data.get("reason") || "").trim(),
          key,
        );
        if (!isCurrentScope()) return;
        updateStore({
          notice:
            "Dependency hold ended and the eligible SLA clock was recalculated.",
          serverBusy: false,
        });
      }
      await this.refreshTicketAndQueue(ticket.id);
    } catch (error) {
      if (!isCurrentScope()) return;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalSubmitLabel;
      }
      form.querySelector("[data-fm1-inline-error]")?.remove();
      form.insertAdjacentHTML(
        "afterbegin",
        '<p class="fm1-error" role="alert" data-fm1-inline-error>' +
          escapeHtml(
            error?.message ||
              "The FM1 change could not be confirmed. Retry without changing the form to reuse the same request key.",
          ) +
          "</p>",
      );
    }
  }

  renderTabs(view) {
    return FM1_NAVIGATION.map(
      (
        item,
      ) => `<button type="button" class="fm1-tab ${view === item.key ? "is-active" : ""}"
      data-fm1-view="${item.key}" ${view === item.key ? 'aria-current="page"' : ""}>${escapeHtml(item.label)}</button>`,
    ).join("");
  }

  renderOverview(state) {
    const p1 = FM1_SLA_TARGETS.P1;
    const p2 = FM1_SLA_TARGETS.P2;
    const p3 = FM1_SLA_TARGETS.P3;
    const p4 = FM1_SLA_TARGETS.P4;
    const metrics = state.serviceStatus?.metrics || {};
    const p1p2 =
      metrics.p1p2_tickets ??
      state.serverTickets.filter((ticket) =>
        ["P1", "P2"].includes(ticket.priority_effective),
      ).length;
    const slaActive =
      metrics.sla_active_tickets ??
      state.serverTickets.filter(
        (ticket) => ticket.sla_activation_state === "ACTIVE",
      ).length;
    return `<section class="fm1-overview" aria-label="FM1 service overview">
      <div class="fm1-metric-grid">
        ${metricCard({ label: "Live tickets", value: state.serverLoading ? "…" : (metrics.total_tickets ?? state.serverTotal), detail: "Authoritative server ticket count", symbol: "▤" })}
        ${metricCard({ label: "P1 / P2 incidents", value: p1p2, detail: "High-priority open incidents", symbol: "!" })}
        ${metricCard({ label: "SLA-active tickets", value: slaActive, detail: state.serviceStatus?.contract_active ? "Server-authoritative SLA service active" : "Contract/readiness activation pending", symbol: "◷" })}
        ${metricCard({ label: "Unread notifications", value: state.notificationUnreadTotal, detail: "Signed-user FM1 inbox", symbol: "♧" })}
      </div>

      <section class="fm1-contract-panel">
        <div class="fm1-panel-heading">
          <div><span class="fm1-eyebrow">CONTRACT CONFIGURATION</span><h2>BIOTECH Farms · FM1</h2>
            <p>${escapeHtml(FM1_CONTRACT.location)} · 2027 remote-support term</p></div>
          ${statusBadge(
            state.serviceStatus?.contract_active
              ? "SLA service active"
              : "Awaiting acceptance",
            state.serviceStatus?.contract_active ? "success" : "warning",
          )}
        </div>
        <div class="fm1-contract-grid">
          <div><span>Provider</span><strong>${escapeHtml(FM1_CONTRACT.provider)}</strong></div>
          <div><span>Monthly base fee</span><strong>${formatPhp(FM1_CONTRACT.monthlyRetainerPhp)} <small>excluding VAT</small></strong></div>
          <div><span>Annual base value</span><strong>${formatPhp(FM1_CONTRACT.annualRetainerPhp)} <small>excluding VAT</small></strong></div>
          <div><span>Minor adjustment allowance</span><strong>${FM1_CONTRACT.monthlyMinorAdjustmentAllowanceMinutes} minutes / month <small>no carryover</small></strong></div>
          <div><span>P1 / P2 coverage</span><strong>${escapeHtml(FM1_CONTRACT.p1p2Coverage)} <small>including weekends and holidays</small></strong></div>
          <div><span>Routine support calendar</span><strong>Mon–Fri, ${String(FM1_CONTRACT.routineCalendar.startHour).padStart(2, "0")}:00–${String(FM1_CONTRACT.routineCalendar.endHour).padStart(2, "0")}:00 <small>holiday calendar pending</small></strong></div>
          <div><span>Covered corrective support</span><strong>${FM1_CONTRACT.coveredCorrectiveSupportPerTicketHourCap === null ? "No per-ticket hour cap" : escapeHtml(FM1_CONTRACT.coveredCorrectiveSupportPerTicketHourCap + " hours")}</strong></div>
          <div><span>Covered controller</span><strong>${escapeHtml(FM1_CONTRACT.controller)}</strong></div>
          <div><span>SCADA</span><strong>${escapeHtml(FM1_CONTRACT.scada)}</strong></div>
        </div>
        <p class="fm1-contract-note">The source agreement is offered, not recorded as executed. This workspace does not activate contractual clocks, guarantees, or client notifications.</p>
      </section>

      <div class="fm1-content-grid">
        <section class="fm1-panel">
          <div class="fm1-panel-heading"><div><span class="fm1-eyebrow">SERVICE TARGETS</span><h2>Proposed SLA reference</h2></div>
            <span class="fm1-inline-note">Preview only</span></div>
          <p class="fm1-muted">Targets from FDS FM1 001 v1.0. P3/P4 use the configured weekday support-calendar preview; P3/P4 update intervals and the holiday calendar remain subject to service-owner approval.</p>
          <div class="fm1-table-wrap"><table class="fm1-table">
            <thead><tr><th>Priority</th><th>Response</th><th>Engineering start</th><th>Restoration / plan</th><th>Public update</th></tr></thead>
            <tbody>
              <tr><th scope="row">P1 Critical</th><td>${targetLabel(p1.response)}</td><td>${targetLabel(p1.engineeringStart)}</td><td>${targetLabel(p1.restoration)}</td><td>${targetLabel(p1.publicUpdate)}</td></tr>
              <tr><th scope="row">P2 High</th><td>${targetLabel(p2.response)}</td><td>${targetLabel(p2.engineeringStart)}</td><td>${targetLabel(p2.restoration)}</td><td>${targetLabel(p2.publicUpdate)}</td></tr>
              <tr><th scope="row">P3 Normal</th><td>${targetLabel(p3.response)}</td><td>${targetLabel(p3.engineeringStart)}</td><td>${targetLabel(p3.restoration)}</td><td>${targetLabel(p3.publicUpdate)} · proposed</td></tr>
              <tr><th scope="row">P4 Request</th><td>${targetLabel(p4.response)}</td><td>${targetLabel(p4.engineeringStart)}</td><td>${targetLabel(p4.agreedPlan)}</td><td>${targetLabel(p4.publicUpdate)} · proposed</td></tr>
            </tbody>
          </table></div>
        </section>
        <section class="fm1-panel fm1-quick-panel">
          <span class="fm1-eyebrow">INTAKE</span><h2>Record a service request</h2>
          <p>Submit a service incident to the server-backed FM1 ticket queue.</p>
          <button type="button" class="fm1-primary-button" data-fm1-action="new-ticket">＋ New ticket</button>
          <p class="fm1-muted">The server assigns the ticket number and authoritative receipt timestamp.</p>
        </section>
      </div>
      <section class="fm1-panel">
        <div class="fm1-panel-heading"><div><span class="fm1-eyebrow">ASSET BASELINE</span><h2>Declared I/O allocation</h2></div>
          <span class="fm1-inline-note">Reconciliation pending</span></div>
        <div class="fm1-io-grid">
          <div><strong>${FM1_CONTRACT.io.profibus}</strong><span>PROFIBUS</span></div>
          <div><strong>${FM1_CONTRACT.io.physical}</strong><span>Physical</span></div>
          <div><strong>${FM1_CONTRACT.io.hammerPelletMill}</strong><span>Hammer / Pellet Mill</span></div>
          <div><strong>${FM1_CONTRACT.io.total.toLocaleString("en-PH")}</strong><span>Declared total</span></div>
        </div>
      </section>
    </section>`;
  }

  renderDrafts(drafts) {
    if (!drafts.length)
      return `<div class="fm1-empty-state"><span aria-hidden="true">▤</span>
      <h3>No intake drafts yet</h3><p>Use New ticket intake to prepare a browser-local draft.</p>
      <button type="button" class="fm1-primary-button" data-fm1-action="new-ticket">＋ New ticket intake</button></div>`;
    return `<div class="fm1-draft-list">${drafts
      .map(
        (draft) => `<article class="fm1-draft-row">
      <div class="fm1-draft-main"><div class="fm1-draft-top"><strong>${escapeHtml(draft.subject)}</strong>
        ${statusBadge("Local draft · Not submitted", "neutral")}</div>
        <span>${escapeHtml(draft.reference)} · ${escapeHtml(draft.priority)} · ${escapeHtml(draft.requesterName)}</span>
        <small>Saved ${escapeHtml(formatDate(draft.createdAt))} · ${escapeHtml(draft.channel)}</small></div>
      <button type="button" class="fm1-quiet-button fm1-danger-button" data-fm1-action="delete-draft"
        data-id="${escapeHtml(draft.id)}" ${fm1Store.get().busy ? "disabled" : ""}>Delete draft</button>
    </article>`,
      )
      .join("")}</div>`;
  }

  renderTickets(state) {
    const assignees = state.serviceStatus?.assignees || [];
    const rows = state.serverTickets
      .map((ticket) => {
        const assignee = assignees.find(
          (member) => member.id === ticket.assigned_to,
        );
        return `<tr>
      <td><button type="button" class="fm1-link-button" data-fm1-action="view-ticket" data-id="${escapeHtml(ticket.id)}">${escapeHtml(ticket.ticket_number)}</button></td>
      <td><strong>${escapeHtml(ticket.subject)}</strong><small>${escapeHtml(ticket.requester_name)}</small></td>
      <td>${statusBadge(ticket.priority_effective, ticket.priority_effective === "P1" ? "danger" : ticket.priority_effective === "P2" ? "warning" : "neutral")}</td>
      <td>${statusBadge(ticket.status, statusTone(ticket.status))}</td>
      <td>${escapeHtml(assignee?.display_name || (ticket.assigned_to ? "Former workspace member" : "Unassigned"))}</td>
      <td>${escapeHtml(formatDate(ticket.received_at))}</td>
      <td>${statusBadge(ticket.sla_activation_state || "NOT_ACTIVE", ticket.sla_activation_state === "ACTIVE" ? "success" : "warning")}</td>
      <td><button type="button" class="fm1-quiet-button" data-fm1-action="view-ticket" data-id="${escapeHtml(ticket.id)}">Open</button></td>
    </tr>`;
      })
      .join("");
    return `<section class="fm1-page-section">
      <div class="fm1-section-heading"><div><span class="fm1-eyebrow">SERVICE DESK</span><h2>Authoritative ticket queue</h2>
        <p>${state.serverTotal} server ticket(s) · latest 50 loaded</p></div>
        <div class="fm1-inline-actions"><button type="button" class="fm1-quiet-button" data-fm1-action="refresh-server" ${state.serverLoading ? "disabled" : ""}>↻ Refresh</button>
        <button type="button" class="fm1-primary-button" data-fm1-action="new-ticket">＋ New ticket</button></div></div>
      ${state.notice ? `<p class="fm1-notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
      ${state.serverError ? `<p class="fm1-error" role="alert">${escapeHtml(state.serverError)}</p>` : ""}
      ${state.serverLoading && !state.serverTickets.length ? '<div class="fm1-empty-state">Loading authoritative FM1 tickets…</div>' : ""}
      ${
        !state.serverLoading && !state.serverTickets.length
          ? `<div class="fm1-empty-state"><span aria-hidden="true">▤</span>
        <h3>No server tickets yet</h3><p>New incidents submitted from this workspace will receive an FM1 ticket number and immutable receipt event.</p>
        <button type="button" class="fm1-primary-button" data-fm1-action="new-ticket">＋ Create first ticket</button></div>`
          : ""
      }
      ${
        state.serverTickets.length
          ? `<div class="fm1-table-wrap"><table class="fm1-table fm1-ticket-table">
        <thead><tr><th>Ticket</th><th>Incident</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Received</th><th>SLA</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
          : ""
      }
      <section class="fm1-panel fm1-local-drafts-panel">
        <div class="fm1-panel-heading"><div><span class="fm1-eyebrow">UNSUBMITTED WORK</span><h2>Browser-local drafts</h2></div>
          <span class="fm1-inline-note">${state.drafts.length} saved</span></div>
        <p class="fm1-muted">Drafts remain separate from authoritative incidents and do not start SLA measurement.</p>
        ${this.renderDrafts(state.drafts)}
      </section>
    </section>`;
  }

  renderTicketDetail(state) {
    const detail = state.selectedTicketDetail;
    if (!detail) {
      return `<section class="fm1-page-section"><p>${state.serverLoading ? "Loading ticket details…" : "Ticket details are unavailable."}</p>
        <button type="button" class="fm1-quiet-button" data-fm1-action="back-to-tickets">← Back to tickets</button>
        ${state.serverError ? `<p class="fm1-error" role="alert">${escapeHtml(state.serverError)}</p>` : ""}</section>`;
    }
    const ticket = detail.ticket;
    const assignees = state.serviceStatus?.assignees || [];
    const currentAssignee = assignees.find(
      (member) => member.id === ticket.assigned_to,
    );
    const conversations = (detail.conversations || [])
      .map((message) => {
        const customer = message.visibility === "customer_update";
        return `<article class="fm1-hold-card">
        <div class="fm1-panel-heading"><strong>${escapeHtml(message.actor_display_name || "CRM member")}</strong>
          ${statusBadge(customer ? "Customer update · not delivered" : "Internal note", customer ? "warning" : "neutral")}</div>
        <p>${escapeHtml(message.body)}</p>
        <small>${escapeHtml(formatDate(message.created_at))}</small>
      </article>`;
      })
      .join("");
    const obligations = detail.obligations
      .map(
        (item) => `<tr>
      <td>${escapeHtml(metricLabel(item.metric))}${item.sequence > 1 ? " #" + item.sequence : ""}</td>
      <td>${escapeHtml(item.priority)}</td>
      <td>${item.due_at ? escapeHtml(formatDate(item.due_at)) : "Not calculated"}</td>
      <td>${statusBadge(item.status, item.status === "breached" ? "danger" : item.status === "met" ? "success" : "warning")}</td>
      <td>${escapeHtml(item.decision_state)}</td>
    </tr>`,
      )
      .join("");
    const events = detail.events
      .map(
        (item) => `<tr>
      <td>${escapeHtml(formatDate(item.occurred_at))}</td>
      <td>${escapeHtml(item.event_type)}</td>
      <td>${escapeHtml(item.source)}</td>
      <td>${escapeHtml(JSON.stringify(item.payload || {}))}</td>
    </tr>`,
      )
      .join("");
    const audit = detail.audit
      .map(
        (item) => `<tr>
      <td>${escapeHtml(item.sequence)}</td>
      <td>${escapeHtml(item.event_type)}</td>
      <td><code>${escapeHtml(item.event_hash.slice(0, 16))}…</code></td>
      <td>${item.previous_hash ? `<code>${escapeHtml(item.previous_hash.slice(0, 16))}…</code>` : "Genesis"}</td>
    </tr>`,
      )
      .join("");
    const nextStatuses = NEXT_STATUSES[ticket.status] || [];
    return `<section class="fm1-page-section">
      <div class="fm1-section-heading"><div><span class="fm1-eyebrow">SERVER INCIDENT · ${escapeHtml(ticket.ticket_number)}</span>
        <h2>${escapeHtml(ticket.subject)}</h2><p>${escapeHtml(ticket.requester_name)} · Received ${escapeHtml(formatDate(ticket.received_at))}</p></div>
        <button type="button" class="fm1-quiet-button" data-fm1-action="back-to-tickets">← Back to queue</button></div>
      ${state.notice ? `<p class="fm1-notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
      ${state.serverError ? `<p class="fm1-error" role="alert">${escapeHtml(state.serverError)}</p>` : ""}
      <section class="fm1-panel">
        <div class="fm1-panel-heading"><div><span class="fm1-eyebrow">INCIDENT LIFECYCLE</span><h2>${escapeHtml(ticket.ticket_number)}</h2></div>
          ${statusBadge(ticket.status, statusTone(ticket.status))}</div>
        <div class="fm1-contract-grid">
          <div><span>Priority</span><strong>${escapeHtml(ticket.priority_effective)} <small>requested ${escapeHtml(ticket.priority_requested)}</small></strong></div>
          <div><span>Production impact</span><strong>${escapeHtml(ticket.production_impact)}</strong></div>
          <div><span>Production stopped</span><strong>${ticket.production_stopped ? "Yes" : "No"}</strong></div>
          <div><span>Safety concern</span><strong>${ticket.safety_concern ? "Yes" : "No"}</strong></div>
          <div><span>Reporting channel</span><strong>${escapeHtml(ticket.reporting_channel)}</strong></div>
          <div><span>Asset reference</span><strong>${escapeHtml(ticket.asset_reference || "Not supplied")}</strong></div>
          <div><span>SLA activation</span><strong>${escapeHtml(ticket.sla_activation_state)}</strong></div>
          <div><span>Revision</span><strong>${escapeHtml(ticket.revision)}</strong></div>
        </div>
        <p class="fm1-muted">${escapeHtml(ticket.description)}</p>
      </section>
      <section class="fm1-panel">
        <span class="fm1-eyebrow">ASSIGNMENT & RESPONSIBILITY</span><h2>Current owner</h2>
        <p class="fm1-muted">${escapeHtml(currentAssignee?.display_name || (ticket.assigned_to ? "Assigned profile is no longer an active workspace member" : "Unassigned"))}</p>
        <form class="fm1-form" data-fm1-assignment-form>
          <div class="fm1-form-grid"><label class="fm1-field-wide">Assign to workspace member
            <select name="assigneeId"><option value="">Unassigned</option>${assignees.map((member) => `<option value="${escapeHtml(member.id)}" ${ticket.assigned_to === member.id ? "selected" : ""}>${escapeHtml(member.display_name)}${member.email ? " · " + escapeHtml(member.email) : ""}</option>`).join("")}</select>
          </label></div>
          <div class="fm1-form-footer"><p>Assignment changes are revision-checked and recorded in immutable ticket history.</p>
            <button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>Save assignment</button></div>
        </form>
      </section>
      <section class="fm1-panel">
        <span class="fm1-eyebrow">INCIDENT CONVERSATION</span><h2>Updates and notes</h2>
        ${conversations || '<p class="fm1-muted">No conversation messages recorded.</p>'}
        <form class="fm1-form" data-fm1-conversation-form>
          <div class="fm1-form-grid">
            <label>Message type<select name="visibility"><option value="internal">Internal note</option><option value="customer_update">Customer update</option></select></label>
            <label class="fm1-field-wide">Message<textarea name="body" required minlength="1" maxlength="4000" rows="4" placeholder="Record an incident update or response"></textarea></label>
          </div>
          <div class="fm1-form-footer"><p>Customer updates are stored as records. External email or messaging delivery is not configured.</p>
            <button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>Post update</button></div>
        </form>
      </section>
      <section class="fm1-panel"><div class="fm1-panel-heading"><div><span class="fm1-eyebrow">SLA OBLIGATIONS</span><h2>Server-calculated deadlines</h2></div></div>
        <div class="fm1-table-wrap"><table class="fm1-table"><thead><tr><th>Metric</th><th>Priority</th><th>Due</th><th>State</th><th>Calculation</th></tr></thead>
          <tbody>${obligations || '<tr><td colspan="5">No obligations recorded.</td></tr>'}</tbody></table></div>
      </section>
      ${this.renderPriorityAndHolds(ticket, detail, state)}
      ${
        nextStatuses.length
          ? `<section class="fm1-panel"><span class="fm1-eyebrow">LIFECYCLE ACTION</span><h2>Update ticket status</h2>
        <form class="fm1-form" data-fm1-transition-form>
          <div class="fm1-form-grid"><label>Next status<select name="nextStatus">${nextStatuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}</select></label>
            <label class="fm1-field-wide">Reason<input name="reason" required minlength="3" maxlength="1000" placeholder="Operational reason for this transition" /></label>
            <label class="fm1-field-wide">Closure summary <span class="fm1-optional">Required only when closing</span><textarea name="closureSummary" minlength="8" maxlength="4000" rows="3" placeholder="Resolution and handover summary"></textarea></label></div>
          <div class="fm1-form-footer"><p>Updates use the current server revision. Concurrent changes require a refresh before retrying.</p>
            <button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>${state.serverBusy ? "Updating…" : "Update status"}</button></div>
        </form>
      </section>`
          : ""
      }
      ${
        !["Closed", "Cancelled", "Duplicate"].includes(ticket.status)
          ? `<section class="fm1-panel"><span class="fm1-eyebrow">OPERATIONAL MILESTONE</span><h2>Record verified event</h2>
        <form class="fm1-form" data-fm1-milestone-form>
          <div class="fm1-form-grid"><label>Milestone<select name="metric">
            <option value="human_response">Human response</option><option value="engineering_start">Engineering start</option>
            <option value="public_update">Public update</option><option value="restoration">Restoration</option></select></label>
            <label>Evidence channel<select name="channel"><option value="portal">Portal</option><option value="email">Email</option><option value="telephone">Telephone</option></select></label>
            <label class="fm1-field-wide">Evidence / work performed<textarea name="evidence" required minlength="8" maxlength="4000" rows="3" placeholder="Record the actual action and supporting evidence"></textarea></label>
            <label>Client operator <span class="fm1-optional">Required for restoration</span><input name="clientOperator" maxlength="120" placeholder="Client operator name" /></label>
          </div>
          <div class="fm1-checkbox-row"><label><input type="checkbox" name="humanConfirmed" /> Human milestone confirmed by the reporting party / Client operator</label></div>
          <div class="fm1-form-footer"><p>Server receipt time is authoritative. Backdated or unconfirmed milestones are retained for review and do not satisfy the SLA.</p>
            <button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>${state.serverBusy ? "Recording…" : "Record milestone"}</button></div>
        </form>
      </section>`
          : ""
      }
      <section class="fm1-panel"><span class="fm1-eyebrow">IMMUTABLE EVENT HISTORY</span><h2>Incident events</h2>
        <div class="fm1-table-wrap"><table class="fm1-table"><thead><tr><th>Occurred</th><th>Event</th><th>Source</th><th>Recorded detail</th></tr></thead>
          <tbody>${events || '<tr><td colspan="4">No events recorded.</td></tr>'}</tbody></table></div>
      </section>
      <section class="fm1-panel"><span class="fm1-eyebrow">AUDIT INTEGRITY</span><h2>Append-only audit chain</h2>
        <div class="fm1-table-wrap"><table class="fm1-table"><thead><tr><th>Sequence</th><th>Event</th><th>SHA-256</th><th>Previous hash</th></tr></thead>
          <tbody>${audit || '<tr><td colspan="4">No audit events recorded.</td></tr>'}</tbody></table></div>
      </section>
    </section>`;
  }

  renderPriorityAndHolds(ticket, detail, state) {
    const terminal = ["Closed", "Cancelled", "Duplicate"].includes(
      ticket.status,
    );
    const priorities = ["P1", "P2", "P3", "P4"];
    const options = (selected) =>
      priorities
        .map(
          (value) =>
            `<option value="${value}" ${selected === value ? "selected" : ""}>${value}</option>`,
        )
        .join("");
    const holds = (detail.holds || [])
      .map((hold) => {
        const tone =
          hold.validation_state === "validated"
            ? "success"
            : hold.validation_state === "rejected"
              ? "danger"
              : "warning";
        const review =
          hold.validation_state === "pending"
            ? `<form class="fm1-form" data-fm1-hold-review-form data-hold-id="${escapeHtml(hold.id)}">
            <div class="fm1-form-grid">
              <label>Review decision<select name="decision"><option value="validated">Validate hold</option><option value="rejected">Reject hold</option></select></label>
              <label class="fm1-field-wide">Review evidence<textarea name="evidence" required minlength="8" maxlength="4000" rows="2" placeholder="Document the review decision"></textarea></label>
            </div>
            ${hold.metric === "engineering_start" ? '<div class="fm1-checkbox-row"><label><input type="checkbox" name="diagnosisBlocked" /> Remote and guided diagnosis are blocked</label></div>' : ""}
            <div class="fm1-form-footer"><p>Pending requests do not pause SLA clocks. Engineering-start holds require evidence that remote and guided diagnosis are blocked.</p><button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>Save hold review</button></div>
          </form>`
            : "";
        const end =
          hold.validation_state === "validated"
            ? `<form class="fm1-form" data-fm1-hold-end-form data-hold-id="${escapeHtml(hold.id)}">
            <label class="fm1-field-wide">Resume reason<input name="reason" required minlength="3" maxlength="500" placeholder="Explain why the dependency is resolved" /></label>
            <div class="fm1-form-footer"><p>Ending a validated hold resumes the eligible clock and recalculates its due time.</p><button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>End hold and resume clock</button></div>
          </form>`
            : "";
        return `<article class="fm1-hold-card">
        <div class="fm1-panel-heading"><strong>${escapeHtml(metricLabel(hold.metric))} · ${escapeHtml(hold.reason.replaceAll("_", " "))}</strong>${statusBadge(hold.validation_state, tone)}</div>
        <p><strong>External owner:</strong> ${escapeHtml(hold.external_owner)} · <strong>Requested:</strong> ${escapeHtml(formatDate(hold.requested_at))}</p>
        <p><strong>Required action:</strong> ${escapeHtml(hold.required_action)}</p>
        <p><strong>Evidence:</strong> ${escapeHtml(hold.evidence)}</p>
        <p><strong>Review due:</strong> ${hold.expected_review_at ? escapeHtml(formatDate(hold.expected_review_at)) : "Not specified"} · <strong>Resumed:</strong> ${hold.resumed_at ? escapeHtml(formatDate(hold.resumed_at)) : "—"}</p>
        ${review}${end}
      </article>`;
      })
      .join("");
    const priorityForm = !terminal
      ? `<form class="fm1-form" data-fm1-priority-form>
          <div class="fm1-form-grid">
            <label>Requested priority<select name="requestedPriority">${options(ticket.priority_requested)}</select></label>
            <label>Effective priority<select name="effectivePriority">${options(ticket.priority_effective)}</select></label>
            <label>Confirmed priority <span class="fm1-optional">Optional</span><select name="confirmedPriority"><option value="">Not confirmed</option>${priorities.map((v) => `<option value="${v}">${v}</option>`).join("")}</select></label>
            <label class="fm1-field-wide">Reason<input name="reason" required minlength="3" maxlength="1000" placeholder="Explain the priority decision" /></label>
          </div>
          <div class="fm1-form-footer"><p>Records a new priority revision and preserves the previous priority in history.</p><button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>Record priority</button></div>
        </form>`
      : '<p class="fm1-muted">Priority changes are unavailable for terminal tickets.</p>';
    const holdForm = !terminal
      ? `<form class="fm1-form" data-fm1-hold-form>
          <div class="fm1-form-grid">
            <label>Obligation<select name="metric"><option value="engineering_start">Engineering start</option><option value="restoration">Restoration</option></select></label>
            <label>Dependency reason<select name="reason"><option value="missing_access">Missing access</option><option value="client_authorization">Client authorization</option><option value="essential_evidence">Essential evidence</option><option value="site_action">Site action</option><option value="spares">Spare parts</option><option value="oem_response">OEM response</option><option value="agreed_shutdown">Agreed shutdown</option></select></label>
            <label>External owner<input name="externalOwner" required minlength="2" maxlength="160" placeholder="Person or organization" /></label>
            <label>Expected review time <span class="fm1-optional">Optional</span><input type="datetime-local" name="expectedReviewAt" /></label>
            <label class="fm1-field-wide">Required action<input name="requiredAction" required minlength="3" maxlength="1000" placeholder="Specific dependency action" /></label>
            <label class="fm1-field-wide">Supporting evidence<textarea name="evidence" required minlength="8" maxlength="4000" rows="3" placeholder="Explain why this dependency blocks the obligation"></textarea></label>
          </div>
          <div class="fm1-form-footer"><p>A request is pending until reviewed and does not pause any SLA clock.</p><button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>Request dependency hold</button></div>
        </form>`
      : "";
    return `<section class="fm1-panel">
      <span class="fm1-eyebrow">PRIORITY MANAGEMENT</span><h2>Record priority decision</h2>
      <p class="fm1-muted">Priority changes are recorded with their reason. SLA recalculation remains subject to the configured D03 decision.</p>
      ${priorityForm}
    </section>
    <section class="fm1-panel">
      <span class="fm1-eyebrow">DEPENDENCY HOLDS</span><h2>Hold requests and review history</h2>
      ${holds || '<p class="fm1-muted">No dependency holds recorded.</p>'}
      ${holdForm}
    </section>`;
  }

  renderIntake(state) {
    return `<section class="fm1-page-section">
      <div class="fm1-section-heading"><div><span class="fm1-eyebrow">RAPID INTAKE</span><h2>New service request</h2>
        <p>Submit the incident to the authoritative FM1 service record.</p></div>
        <button type="button" class="fm1-quiet-button" data-fm1-action="back-to-tickets">← Back to tickets</button></div>
      ${state.error ? `<p class="fm1-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      <form class="fm1-form" data-fm1-intake-form>
        <div class="fm1-form-context"><span>Site <strong>FM1 · ${escapeHtml(FM1_CONTRACT.location)}</strong></span>
          <span>Receipt timestamp <strong>Assigned by the server on submission</strong></span></div>
        <div class="fm1-form-grid">
          <label>Requester name<input name="requesterName" autocomplete="name" required minlength="2" maxlength="120" /></label>
          <label>Callback number<input name="callbackNumber" type="tel" autocomplete="tel" required minlength="7" maxlength="32" /></label>
          <label class="fm1-field-wide">Short subject<input name="subject" required minlength="4" maxlength="160" placeholder="Briefly describe the issue" /></label>
          <label>Proposed priority<select name="priority" required>
            <option value="P1">P1 · Critical</option><option value="P2">P2 · High</option>
            <option value="P3" selected>P3 · Normal</option><option value="P4">P4 · Request</option>
          </select></label>
          <label>Reporting channel<select name="channel" required>
            <option value="portal">Portal</option><option value="email">Email</option><option value="telephone">Telephone</option>
          </select></label>
          <label>Production impact<select name="productionImpact" required>
            <option value="critical">Critical operational impact</option><option value="degraded">Production degraded</option>
            <option value="no-impact">No production impact</option>
          </select></label>
          <label>Asset / station / I/O reference <span class="fm1-optional">Optional</span>
            <input name="assetReference" maxlength="160" placeholder="Unknown is allowed at intake" /></label>
          <label class="fm1-field-wide">Symptoms and business impact<textarea name="description" required minlength="10" maxlength="4000" rows="5" placeholder="Describe symptoms, impact, recent changes and available evidence."></textarea></label>
        </div>
        <div class="fm1-checkbox-row">
          <label><input type="checkbox" name="productionStopped" /> Production is currently stopped</label>
          <label><input type="checkbox" name="safetyConcern" /> Safe-condition concern exists</label>
        </div>
        <div class="fm1-form-footer"><p>Submitting creates a server-backed incident and immutable receipt event. SLA clocks remain inactive until contract and service readiness are confirmed.</p>
          <div class="fm1-inline-actions">
            <button type="button" class="fm1-quiet-button" data-fm1-action="save-draft" ${state.busy ? "disabled" : ""}>${state.busy ? "Saving…" : "Save local draft"}</button>
            <button type="submit" class="fm1-primary-button" ${state.serverBusy ? "disabled" : ""}>${state.serverBusy ? "Submitting…" : "Submit incident"}</button>
          </div></div>
      </form>
    </section>`;
  }

  renderNotifications(state) {
    const rows = (state.notifications || [])
      .map(
        (notification) => `
      <article class="fm1-hold-card">
        <div class="fm1-panel-heading"><strong>${escapeHtml(notification.title)}</strong>
          ${statusBadge(notification.read_at ? "Read" : "Unread", notification.read_at ? "neutral" : "warning")}</div>
        <p>${escapeHtml(notification.message)}</p>
        <small>${escapeHtml(notification.ticket_number)} · ${escapeHtml(notification.subject)} · ${escapeHtml(formatDate(notification.created_at))}</small>
        <div class="fm1-inline-actions">
          <button type="button" class="fm1-quiet-button" data-fm1-action="open-notification-ticket" data-ticket-id="${escapeHtml(notification.ticket_id)}">Open incident</button>
          ${notification.read_at ? "" : `<button type="button" class="fm1-quiet-button" data-fm1-action="mark-notification-read" data-id="${escapeHtml(notification.id)}" ${state.notificationLoading ? "disabled" : ""}>Mark read</button>`}
        </div>
      </article>`,
      )
      .join("");
    return `<section class="fm1-page-section">
      <div class="fm1-section-heading"><div><span class="fm1-eyebrow">IN-APP DELIVERY</span><h2>Notification inbox</h2>
        <p>${state.notificationUnreadTotal} unread notification(s) · latest 50 loaded</p></div>
        <button type="button" class="fm1-quiet-button" data-fm1-action="refresh-server" ${state.notificationLoading ? "disabled" : ""}>↻ Refresh</button></div>
      ${state.notificationLoading && !state.notifications?.length ? '<div class="fm1-empty-state">Loading notifications…</div>' : ""}
      ${rows || '<div class="fm1-empty-state"><h3>No notifications yet</h3><p>Incident assignments, updates and SLA breach escalations will appear here after outbox delivery.</p></div>'}
      <p class="fm1-muted">This inbox records internal APSYNTRA CRM delivery. Email, SMS and external customer delivery remain unconfigured.</p>
    </section>`;
  }

  renderDuty(state) {
    const metrics = state.serviceStatus?.metrics || {};
    const urgentUnassigned = state.serviceStatus?.unassigned_urgent || [];
    const delivery = state.serviceStatus?.notification_delivery || {};
    const escalations = (state.notifications || []).filter(
      (item) => item.event_type === "SlaObligationBreached",
    );
    const roster = state.serviceStatus?.assignees || [];
    return `<section class="fm1-page-section">
      <div class="fm1-metric-grid">
        ${metricCard({ label: "Unassigned P1 / P2", value: metrics.unassigned_p1p2 ?? urgentUnassigned.length, detail: "High-priority open incidents", symbol: "!" })}
        ${metricCard({ label: "Workspace coverage", value: roster.length, detail: "Active CRM workspace members", symbol: "♙" })}
        ${metricCard({ label: "Unread alerts", value: state.notificationUnreadTotal, detail: "In-app notifications", symbol: "♧" })}
        ${metricCard({ label: "Breach escalations", value: metrics.breached_obligations ?? escalations.length, detail: "Server-recorded breached obligations", symbol: "◷" })}
      </div>
      <section class="fm1-panel"><span class="fm1-eyebrow">PRIORITY COVERAGE</span><h2>Unassigned P1 / P2 incidents</h2>
        ${urgentUnassigned.length ? `<div class="fm1-draft-list">${urgentUnassigned.map((ticket) => `<article class="fm1-draft-row"><div class="fm1-draft-main"><strong>${escapeHtml(ticket.ticket_number)} · ${escapeHtml(ticket.subject)}</strong><span>${escapeHtml(ticket.priority_effective)} · ${escapeHtml(ticket.status)} · ${escapeHtml(formatDate(ticket.received_at))}</span></div><button type="button" class="fm1-quiet-button" data-fm1-action="view-ticket" data-id="${escapeHtml(ticket.id)}">Assign / open</button></article>`).join("")}</div>` : '<p class="fm1-muted">No unassigned P1 / P2 incidents in the loaded queue.</p>'}
      </section>
      <section class="fm1-panel"><span class="fm1-eyebrow">WORKSPACE COVERAGE</span><h2>Assignable CRM members</h2>
        ${roster.map((member) => `<article class="fm1-draft-row"><div class="fm1-draft-main"><strong>${escapeHtml(member.display_name)}</strong><span>${escapeHtml(member.email || "")}</span></div></article>`).join("") || '<p class="fm1-muted">No active workspace members were returned.</p>'}
      </section>
      <section class="fm1-panel"><span class="fm1-eyebrow">SLA ESCALATIONS</span><h2>Recent breach notifications</h2>
        ${escalations.map((item) => `<article class="fm1-draft-row"><div class="fm1-draft-main"><strong>${escapeHtml(item.ticket_number)} · ${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)} · ${escapeHtml(formatDate(item.created_at))}</span></div><button type="button" class="fm1-quiet-button" data-fm1-action="open-notification-ticket" data-ticket-id="${escapeHtml(item.ticket_id)}">Open</button></article>`).join("") || '<p class="fm1-muted">No breach escalation notifications in the latest inbox page.</p>'}
      </section>
      <section class="fm1-panel"><span class="fm1-eyebrow">NOTIFICATION DELIVERY</span><h2>Internal outbox status</h2>
        <div class="fm1-contract-grid">
          <div><span>Queued</span><strong>${escapeHtml(delivery.queued ?? 0)}</strong></div>
          <div><span>Failed / retrying</span><strong>${escapeHtml(delivery.failed ?? 0)}</strong></div>
          <div><span>Delivered</span><strong>${escapeHtml(delivery.delivered ?? 0)}</strong></div>
        </div>
      </section>
      <p class="fm1-muted">Approaching-deadline alert thresholds and duty escalation rosters require the service calendar and operational policy to be configured. Contractual SLA clocks remain inactive until acceptance and readiness are recorded.</p>
    </section>`;
  }

  renderModule(view) {
    const modules = {
      duty: [
        "Duty dashboard",
        "Primary and backup roster coverage, unowned P1/P2 incidents, live deadline queues, failed notification delivery and overdue public updates will be connected here.",
      ],
      approvals: [
        "Approval inbox",
        "Version-bound engineering changes, operational decisions, IT/safety reviews and commercial quotations will be presented here with their recorded evidence.",
      ],
      administration: [
        "FM1 administration",
        "Contract/calendar versions, named contacts, duty roster, approved channels, templates, retention settings and integration health will be configured here.",
      ],
      assets: [
        "Asset & I/O register",
        "Controller, SCADA, station, equipment and I/O relationships will use the FM1 baseline. The declared 1,275-point allocation is shown for reference; actual point records remain unreconciled.",
      ],
      preventive: [
        "Preventive service calendar",
        "Monthly and quarterly service tasks, backup verification, reports, coaching and evidence-based completion are part of the FM1 workflow.",
      ],
      engineering: [
        "Engineering & remote sessions",
        "Change requests, technical review, Client approvals, remote-session records, test evidence and handover will be connected in the engineering workflow.",
      ],
      commercial: [
        "Commercial workspace",
        "Allowance ledger, quotations, approved work logs, expense records, billing drafts and service-credit claims will be connected to the approved contract version.",
      ],
      reports: [
        "Reports & service reviews",
        "Response, engineering-start, update and restoration metrics will be published from authoritative server events and versioned report snapshots.",
      ],
    };
    const [title, description] = modules[view] || modules.assets;
    return `<section class="fm1-page-section"><span class="fm1-eyebrow">FM1 MODULE</span>
      <h2>${escapeHtml(title)}</h2><p class="fm1-module-description">${escapeHtml(description)}</p>
      <div class="fm1-info-banner"><strong>Foundation connected</strong><span>This section is part of the CRM-native FM1 module. Live records and write operations are not yet connected; no sample operational records are fabricated.</span></div>
    </section>`;
  }

  render() {
    const state = fm1Store.get();
    const view = state.view || "overview";
    const title =
      view === "new-ticket"
        ? "New ticket intake"
        : view === "ticket-detail"
          ? state.selectedTicketDetail?.ticket?.ticket_number ||
            "Ticket details"
          : FM1_NAVIGATION.find((item) => item.key === view)?.label ||
            "FM1 Ticketing";
    this.root.innerHTML = `<section class="fm1-app" aria-label="FM1 SLA Ticketing application">
      <header class="fm1-app-header">
        <div><span class="fm1-eyebrow">WATCHDOG AUTOMATION · BIOTECH FARMS</span>
          <h1>FM1 <span>SLA Ticketing</span></h1>
          <p>Remote-support service workspace · ${escapeHtml(FM1_CONTRACT.location)}</p></div>
        <div class="fm1-header-status">${statusBadge(
          state.serviceStatus?.contract_active
            ? "SLA service active"
            : "Awaiting acceptance",
          state.serviceStatus?.contract_active ? "success" : "warning",
        )}
          <span>2027 contract configuration</span></div>
      </header>
      <nav class="fm1-tabs" aria-label="FM1 application sections">
        ${this.renderTabs(view)}
      </nav>
      <div class="fm1-page-heading"><div><span class="fm1-eyebrow">FM1 SERVICE OPERATIONS</span><h2>${escapeHtml(title)}</h2></div>
        ${view !== "new-ticket" ? '<button type="button" class="fm1-primary-button" data-fm1-action="new-ticket">＋ New ticket</button>' : ""}
      </div>
      ${state.notice && view !== "tickets" ? `<p class="fm1-notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
      ${state.error && view !== "new-ticket" ? `<p class="fm1-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      ${state.serverError && !["tickets", "ticket-detail"].includes(view) ? `<p class="fm1-error" role="alert">${escapeHtml(state.serverError)}</p>` : ""}
      ${
        view === "overview"
          ? this.renderOverview(state)
          : view === "tickets"
            ? this.renderTickets(state)
            : view === "ticket-detail"
              ? this.renderTicketDetail(state)
              : view === "new-ticket"
                ? this.renderIntake(state)
                : view === "duty"
                  ? this.renderDuty(state)
                  : view === "notifications"
                    ? this.renderNotifications(state)
                    : this.renderModule(view)
      }
      <footer class="fm1-app-footer"><span>APSYNTRA CRM · FM1 foundation</span>
        <span>Asia/Manila (UTC+8) · Server-backed incident records</span></footer>
    </section>`;
  }
}

let mountedApplication = null;

export function mountFm1Application(root, scope = {}) {
  if (!root) return null;
  const scopeKey =
    (scope.userId || "unscoped") + "::" + (scope.workspaceId || "unscoped");
  if (
    mountedApplication?.root === root &&
    mountedApplication.scopeKey === scopeKey
  ) {
    return mountedApplication;
  }
  mountedApplication?.disconnect();
  mountedApplication = new Fm1Application(root, scope);
  mountedApplication.connect();
  return mountedApplication;
}

export function unmountFm1Application() {
  mountedApplication?.disconnect();
  mountedApplication = null;
}
