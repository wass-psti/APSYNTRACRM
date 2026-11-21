import test from "node:test";
import assert from "node:assert/strict";
import { createGenuineStagingRunner } from "../ws02d-genuine-staging-runner.mjs";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const member = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspace = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const invitationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const token = invitationId + "." + "ab".repeat(32);
const inviterJwt = "owner." + "A".repeat(85) + ".signature";
const recipientJwt = "recipient." + "B".repeat(85) + ".signature";
const publishableKey = "sb_publishable_staging_test_not_real";
const recipientEmail = "recipient@staging.example.invalid";
function fixture({
  confirmed = true,
  identical = false,
  sendStatus = 200,
  receiptToken = false,
  readinessReady = true,
  deliveryState = "submitted",
  alreadyAccepted = false,
} = {}) {
  const calls = [];
  let accepted = alreadyAccepted;
  const fetchImpl = async (url, options) => {
    assert.ok(url.startsWith("https://jeqwjlxubntsddeauvqa.supabase.co/"));
    assert.ok(!url.includes("jtlusodorfnyzgyuewkz"));
    const jwt = options.headers.authorization.slice(7);
    const route = url.slice(url.lastIndexOf("/") + 1);
    calls.push({
      route,
      method: options.method,
      body: options.body ? JSON.parse(options.body) : null,
      jwt,
    });
    if (url.endsWith("/auth/v1/user"))
      return new Response(
        JSON.stringify({
          id: jwt === inviterJwt ? owner : identical ? owner : member,
          email:
            jwt === inviterJwt
              ? "owner@staging.example.invalid"
              : identical
                ? "owner@staging.example.invalid"
                : recipientEmail,
          email_confirmed_at: confirmed ? "2026-11-20T00:00:00Z" : null,
          is_anonymous: false,
        }),
        { status: 200 },
      );
    if (url.endsWith("ws02d-invite"))
      return new Response(
        JSON.stringify({
          state: "delivery-submitted",
          invitationId,
          ...(receiptToken ? { token } : {}),
        }),
        { status: sendStatus },
      );
    if (url.endsWith("ws02d-accept")) {
      accepted = true;
      return new Response(
        JSON.stringify({
          state: "accepted",
          role: "member",
          switched: false,
          workspaceId: workspace,
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("ws02d-manage"))
      return new Response(
        JSON.stringify(
          JSON.parse(options.body || "{}")?.operation === "readiness"
            ? {
                schemaVersion: 1,
                authorized: true,
                workspaceId: workspace,
                ready: readinessReady,
                reason: readinessReady
                  ? "ready"
                  : "invitation_feature_disabled",
              }
            : {
                schemaVersion: 1,
                authorized: true,
                workspaceId: workspace,
                invitations: [
                  {
                    id: invitationId,
                    state: accepted ? "accepted" : "pending",
                  },
                ],
                delivery: [{ invitationId, deliveryState }],
              },
        ),
        { status: 200 },
      );
    throw Error("Unknown route");
  };
  return { runner: createGenuineStagingRunner({ fetchImpl }), calls };
}
const inviterOnly = {
  inviterJwt,
  publishableKey,
  workspaceId: workspace,
  requestId,
  recipientEmail,
};
const recipientOnly = { recipientJwt, publishableKey, token };
test("optional pairing diagnostic verifies two distinct confirmed GoTrue identities before reporting PASS", async () => {
  const valid = fixture();
  const pair = await valid.runner.pair({
    inviterJwt,
    recipientJwt,
    publishableKey,
  });
  assert.equal(pair.inviter.id, owner);
  assert.equal(pair.recipient.id, member);
  assert.equal(valid.calls.length, 2);
  for (const opts of [{ confirmed: false }, { identical: true }]) {
    const f = fixture(opts);
    await assert.rejects(
      f.runner.pair({ inviterJwt, recipientJwt, publishableKey }),
    );
  }
});
test("inviter-only session can issue an invitation to a distinct confirmed email without recipient JWT", async () => {
  const f = fixture();
  const result = await f.runner.send(inviterOnly);
  assert.deepEqual(result, {
    state: "delivery-submitted",
    invitationId,
    providerAccepted: true,
    invitationState: "pending",
    deliveryState: "submitted",
    inboxDelivered: false,
  });
  const endpoints = f.calls.filter((x) => x.route.startsWith("ws02d-"));
  assert.deepEqual(
    endpoints.map((x) => x.route),
    ["ws02d-manage", "ws02d-invite", "ws02d-manage"],
  );
  assert.ok(endpoints.every((x) => x.jwt === inviterJwt));
  assert.equal(f.calls.filter((x) => x.route === "auth").length, 0);
  assert.equal(f.calls.filter((x) => x.route === "user").length, 2);
  assert.deepEqual(endpoints[0].body, {
    operation: "readiness",
    workspaceId: workspace,
  });
  assert.deepEqual(endpoints[1].body, {
    workspaceId: workspace,
    requestId,
    email: recipientEmail,
    role: "member",
    message: "",
  });
  assert.deepEqual(endpoints[2].body, {
    operation: "list",
    workspaceId: workspace,
  });
});
test("inviter cannot invite their own account and no invitation is issued", async () => {
  const f = fixture();
  await assert.rejects(
    f.runner.send({
      ...inviterOnly,
      recipientEmail: "owner@staging.example.invalid",
    }),
    /own account/i,
  );
  assert.equal(
    f.calls.some((x) => x.route === "ws02d-invite"),
    false,
  );
});
test("unready staging delivery preflight prevents invitation send", async () => {
  const f = fixture({ readinessReady: false });
  await assert.rejects(f.runner.send(inviterOnly), /not ready/i);
  assert.equal(
    f.calls.some((x) => x.route === "ws02d-invite"),
    false,
  );
});
test("uncertain provider delivery ledger never reports a successful invitation", async () => {
  const f = fixture({ deliveryState: "uncertain" });
  await assert.rejects(
    f.runner.send(inviterOnly),
    /delivery ledger is not confirmed submitted/i,
  );
  assert.equal(f.calls.filter((x) => x.route === "ws02d-invite").length, 1);
  assert.equal(f.calls.at(-1).body.operation, "list");
});
test("ambiguous send or provider bearer-token response is rejected without automatic retry", async () => {
  for (const opts of [{ sendStatus: 503 }, { receiptToken: true }]) {
    const f = fixture(opts);
    await assert.rejects(f.runner.send(inviterOnly));
    assert.equal(f.calls.filter((x) => x.route === "ws02d-invite").length, 1);
  }
});
test("recipient-only session accepts the inbox token without inviter JWT or manager readback", async () => {
  const f = fixture();
  await assert.rejects(f.runner.accept({ ...recipientOnly, token: "invalid" }));
  assert.equal(f.calls.length, 0);
  const receipt = await f.runner.accept(recipientOnly);
  assert.deepEqual(receipt, {
    state: "accepted",
    invitationId,
    workspaceId: workspace,
    switched: false,
    invitationState: "accepted",
    inviterReadback: "pending",
  });
  const acceptCall = f.calls.find((x) => x.route === "ws02d-accept");
  assert.deepEqual(acceptCall.body, { token });
  assert.equal(acceptCall.jwt, recipientJwt);
  assert.equal(f.calls.filter((x) => x.route === "ws02d-manage").length, 0);
});
test("inviter can independently verify acceptance later using only inviter JWT", async () => {
  const f = fixture({ alreadyAccepted: true });
  const result = await f.runner.verifyAcceptance({
    inviterJwt,
    publishableKey,
    workspaceId: workspace,
    invitationId,
  });
  assert.deepEqual(result, {
    verified: true,
    invitationId,
    workspaceId: workspace,
    state: "accepted",
  });
  assert.equal(
    f.calls.some((x) => x.jwt === recipientJwt),
    false,
  );
  assert.equal(f.calls.at(-1).route, "ws02d-manage");
});
test("inviter readback does not certify a still-pending invitation", async () => {
  const f = fixture();
  await assert.rejects(
    f.runner.verifyAcceptance({
      inviterJwt,
      publishableKey,
      workspaceId: workspace,
      invitationId,
    }),
    /not confirmed/i,
  );
});
test("manager listing remains inviter-scoped and does not expose token material", async () => {
  const f = fixture();
  const list = await f.runner.list({
    inviterJwt,
    publishableKey,
    workspaceId: workspace,
  });
  assert.deepEqual(list, {
    authorized: true,
    workspaceId: workspace,
    invitations: [{ id: invitationId, state: "pending" }],
    delivery: [{ invitationId, deliveryState: "submitted" }],
    states: ["pending"],
  });
  assert.equal(f.calls.at(-1).route, "ws02d-manage");
  assert.equal(f.calls.at(-1).jwt, inviterJwt);
});
