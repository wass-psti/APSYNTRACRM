/** Isolated staging-only invitation transport with independent account sessions.
 * Inviter issuance and recipient acceptance never require the other account's JWT.
 * No account creation, credential persistence, or production URL is permitted.
 */
const BASE = "https://jeqwjlxubntsddeauvqa.supabase.co";
const ORIGIN = "https://wass-psti.github.io";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const READINESS_REASONS = new Set([
  "ready",
  "invitation_feature_disabled",
  "delivery_configuration_missing",
]);
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
const json = async (r) => {
  try {
    return await r.json();
  } catch {
    return null;
  }
};
function ensureNoBearerOutput(data) {
  if (
    data &&
    typeof data === "object" &&
    ("token" in data || "access_token" in data || "refresh_token" in data)
  )
    throw Error("Unsafe bearer-secret response");
}
export function createGenuineStagingRunner({
  fetchImpl = fetch,
  origin = ORIGIN,
} = {}) {
  async function request(
    path,
    { jwt, publishableKey, body, method = "GET" } = {},
  ) {
    assert(
      typeof publishableKey === "string" && publishableKey.length > 8,
      "Staging publishable key required",
    );
    assert(
      typeof jwt === "string" && jwt.length > 50,
      "Signed staging JWT required",
    );
    const res = await fetchImpl(BASE + path, {
      method,
      headers: {
        authorization: "Bearer " + jwt,
        apikey: publishableKey,
        origin,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status, data: await json(res) };
  }
  async function identity({ jwt, publishableKey }) {
    const res = await request("/auth/v1/user", { jwt, publishableKey });
    assert(res.status === 200, "GoTrue signed-user verification denied");
    assert(
      UUID.test(res.data?.id) && typeof res.data?.email === "string",
      "GoTrue identity was invalid",
    );
    assert(
      res.data?.email_confirmed_at && res.data?.is_anonymous !== true,
      "GoTrue account not confirmed",
    );
    return { id: res.data.id, email: res.data.email.trim().toLowerCase() };
  }
  async function pair({ inviterJwt, recipientJwt, publishableKey }) {
    const inviter = await identity({ jwt: inviterJwt, publishableKey });
    const recipient = await identity({ jwt: recipientJwt, publishableKey });
    assert(
      inviter.id !== recipient.id && inviter.email !== recipient.email,
      "Two independent signed staging users required",
    );
    return { inviter, recipient };
  }
  async function signedReadiness({ inviterJwt, publishableKey, workspaceId }) {
    assert(UUID.test(workspaceId), "Valid workspace ID required");
    const inviter = await identity({ jwt: inviterJwt, publishableKey });
    const response = await request("/functions/v1/ws02d-manage", {
      jwt: inviterJwt,
      publishableKey,
      method: "POST",
      body: { operation: "readiness", workspaceId },
    });
    assert(response.status === 200, "Signed invitation readiness unavailable");
    ensureNoBearerOutput(response.data);
    assert(
      response.data?.schemaVersion === 1 &&
        response.data?.workspaceId === workspaceId &&
        response.data?.authorized === true &&
        typeof response.data?.ready === "boolean" &&
        READINESS_REASONS.has(response.data?.reason) &&
        response.data.ready === (response.data.reason === "ready"),
      "Signed invitation readiness response invalid",
    );
    return {
      inviter,
      ready: response.data.ready,
      reason: response.data.reason,
    };
  }
  async function readiness(args) {
    const { ready, reason } = await signedReadiness(args);
    return { ready, reason };
  }
  async function send({
    inviterJwt,
    publishableKey,
    workspaceId,
    requestId,
    recipientEmail,
  }) {
    assert(
      UUID.test(workspaceId) && UUID.test(requestId),
      "Valid workspace and idempotency IDs required",
    );
    assert(
      typeof recipientEmail === "string" && EMAIL.test(recipientEmail.trim()),
      "Valid recipient email required",
    );
    const preflight = await signedReadiness({
      inviterJwt,
      publishableKey,
      workspaceId,
    });
    const normalizedEmail = recipientEmail.trim().toLowerCase();
    assert(
      normalizedEmail !== preflight.inviter.email,
      "Inviter cannot invite their own account",
    );
    assert(
      preflight.ready === true,
      `Invitation delivery not ready: ${preflight.reason}`,
    );
    const response = await request("/functions/v1/ws02d-invite", {
      jwt: inviterJwt,
      publishableKey,
      method: "POST",
      body: {
        workspaceId,
        requestId,
        email: normalizedEmail,
        role: "member",
        message: "",
      },
    });
    assert(
      response.status === 200,
      "Invitation issue/delivery not confirmed; reconcile manager listing",
    );
    ensureNoBearerOutput(response.data);
    assert(
      UUID.test(response.data?.invitationId) &&
        ["delivery-submitted", "already-issued"].includes(response.data?.state),
      "Invalid trusted invitation receipt",
    );
    const listing = await list({ inviterJwt, publishableKey, workspaceId });
    assert(
      listing.invitations.some(
        (item) =>
          item.id === response.data.invitationId && item.state === "pending",
      ),
      "Invitation provider receipt was returned but pending invitation persistence is not confirmed",
    );
    const delivery = listing.delivery.find(
      (item) => item.invitationId === response.data.invitationId,
    );
    assert(
      delivery?.deliveryState === "submitted",
      "Invitation is pending but provider delivery ledger is not confirmed submitted",
    );
    return {
      state: response.data.state,
      invitationId: response.data.invitationId,
      providerAccepted: response.data.state === "delivery-submitted",
      invitationState: "pending",
      deliveryState: delivery.deliveryState,
      inboxDelivered: false,
    };
  }
  async function accept({ recipientJwt, publishableKey, token }) {
    assert(
      TOKEN.test(token),
      "Token must come from confirmed recipient inbox link",
    );
    await identity({ jwt: recipientJwt, publishableKey });
    const response = await request("/functions/v1/ws02d-accept", {
      jwt: recipientJwt,
      publishableKey,
      method: "POST",
      body: { token },
    });
    assert(
      response.status === 200,
      "Invitation acceptance denied or ambiguous",
    );
    ensureNoBearerOutput(response.data);
    assert(
      response.data?.state === "accepted" &&
        response.data?.role === "member" &&
        response.data?.switched === false &&
        UUID.test(response.data?.workspaceId),
      "Trusted acceptance receipt invalid",
    );
    return {
      state: "accepted",
      invitationId: token.slice(0, token.indexOf(".")),
      workspaceId: response.data.workspaceId,
      switched: false,
      invitationState: "accepted",
      inviterReadback: "pending",
    };
  }
  async function verifyAcceptance({
    inviterJwt,
    publishableKey,
    workspaceId,
    invitationId,
  }) {
    assert(
      UUID.test(workspaceId) && UUID.test(invitationId),
      "Valid workspace and invitation IDs required",
    );
    const manager = await list({ inviterJwt, publishableKey, workspaceId });
    const invitation = manager.invitations.find(
      (item) => item.id === invitationId,
    );
    assert(
      invitation?.state === "accepted",
      "Inviter readback has not confirmed accepted invitation state",
    );
    return { verified: true, invitationId, workspaceId, state: "accepted" };
  }
  async function list({ inviterJwt, publishableKey, workspaceId }) {
    assert(UUID.test(workspaceId), "Workspace ID required");
    await identity({ jwt: inviterJwt, publishableKey });
    const response = await request("/functions/v1/ws02d-manage", {
      jwt: inviterJwt,
      publishableKey,
      method: "POST",
      body: { operation: "list", workspaceId },
    });
    assert(response.status === 200, "Trusted manager listing unavailable");
    assert(
      response.data?.authorized === true &&
        response.data?.workspaceId === workspaceId &&
        Array.isArray(response.data?.invitations),
      "Invalid manager scoped readback",
    );
    const invitations = response.data.invitations.map((v) => ({
      id: v.id,
      state: v.state,
    }));
    assert(
      invitations.every((v) => UUID.test(v.id) && typeof v.state === "string"),
      "Manager invitation state readback invalid",
    );
    assert(
      Array.isArray(response.data.delivery),
      "Manager delivery ledger readback unavailable",
    );
    const delivery = response.data.delivery.map((v) => ({
      invitationId: v.invitationId,
      deliveryState: v.deliveryState,
    }));
    assert(
      delivery.every(
        (v) => UUID.test(v.invitationId) && typeof v.deliveryState === "string",
      ),
      "Manager delivery ledger readback invalid",
    );
    return {
      authorized: true,
      workspaceId,
      invitations,
      delivery,
      states: invitations.map((v) => v.state),
    };
  }
  return Object.freeze({
    identity,
    pair,
    readiness,
    send,
    accept,
    verifyAcceptance,
    list,
  });
}
