import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateIndependentSessions } from "../../scripts/cp-crm-native04b4-independent-session-preflight.mjs";

const fixture = () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const c = "33333333-3333-4333-8333-333333333333";
  return {
    manifest: {
      identities: {
        tradeAuthor: a,
        tradePrimaryReviewer: b,
        tradeSecondaryReviewer: c,
      },
    },
    observations: [
      {
        role: "tradeAuthor",
        port: 9225,
        subject: a,
        authenticated: true,
        secure: true,
        route: "#/tradelink/documents",
        requestFailures: 0,
        pageErrors: 0,
      },
      {
        role: "tradePrimaryReviewer",
        port: 9226,
        subject: b,
        authenticated: true,
        secure: true,
        route: "#/tradelink/documents",
        requestFailures: 0,
        pageErrors: 0,
      },
    ],
  };
};

test("two genuine distinct signed profile identities match designated actors, but never authorize writes", () => {
  const { manifest, observations } = fixture();
  const result = evaluateIndependentSessions(manifest, observations);
  assert.deepEqual(result.issues, []);
  assert.equal(result.status, "INDEPENDENT_SIGNED_IDENTITIES_VERIFIED");
  assert.equal(result.independentlyVerifiedAccounts, 2);
  assert.equal(result.productionWritesAuthorized, false);
  assert.equal(result.productionBusinessWrites, 0);
  assert.equal(result.transactionReadback, "NOT_TESTED");
  assert.equal(result.domainRoleChecks, "NOT_TESTED");
});

test("same subject or reused browser port cannot masquerade as independent reviewer", () => {
  const { manifest, observations } = fixture();
  observations[1].subject = observations[0].subject;
  observations[1].port = observations[0].port;
  const result = evaluateIndependentSessions(manifest, observations);
  assert.equal(result.status, "BLOCKED");
  assert.match(result.issues.join("; "), /reuse one browser endpoint/);
  assert.match(result.issues.join("; "), /distinct authenticated users/);
  assert.equal(result.productionWritesAuthorized, false);
});

test("unsigned, foreign, missing, malformed or mismatched session identity is blocked", () => {
  const changes = [
    (x) => {
      x[1].subject = null;
    },
    (x) => {
      x[1].subject = "not-a-uuid";
    },
    (x) => {
      x[1].subject = "44444444-4444-4444-8444-444444444444";
    },
    (x) => {
      x[1].authenticated = false;
    },
    (x) => {
      x[1].secure = false;
    },
    (x) => {
      x[1].route = "#/fund-tracker";
    },
    (x) => {
      x[1].requestFailures = 1;
    },
    (x) => {
      x[1].pageErrors = 1;
    },
    (x) => {
      x[1].role = "unrecognizedActor";
    },
  ];
  for (const change of changes) {
    const { manifest, observations } = fixture();
    change(observations);
    const result = evaluateIndependentSessions(manifest, observations);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.productionWritesAuthorized, false);
  }
});

test("single actor and duplicate role cannot meet independent acceptance", () => {
  const { manifest, observations } = fixture();
  assert.equal(
    evaluateIndependentSessions(manifest, observations.slice(0, 1)).status,
    "BLOCKED",
  );
  observations[1].role = "tradeAuthor";
  assert.equal(
    evaluateIndependentSessions(manifest, observations).status,
    "BLOCKED",
  );
});

test("CLI rejects absent approval manifest, one profile and nonloopback browser endpoints", () => {
  const file = fileURLToPath(
    new URL(
      "../../scripts/cp-crm-native04b4-independent-session-preflight.mjs",
      import.meta.url,
    ),
  );
  const inputs = [
    [],
    ["--session=tradeAuthor:http://127.0.0.1:9225"],
    [
      "--manifest=/missing/private-plan.json",
      "--session=tradeAuthor:http://127.0.0.1:9225",
    ],
    [
      "--manifest=/missing/private-plan.json",
      "--session=tradeAuthor:http://192.0.2.10:9225",
      "--session=tradePrimaryReviewer:http://127.0.0.1:9226",
    ],
    [
      "--manifest=/missing/private-plan.json",
      "--session=tradeAuthor:http://127.0.0.1:9225",
      "--session=tradePrimaryReviewer:http://127.0.0.1:9225",
    ],
  ];
  for (const input of inputs) {
    const result = spawnSync(process.execPath, [file, ...input], {
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(result.status, 2, JSON.stringify(input));
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /Bearer\s|access_token|refresh_token/,
    );
  }
});

test("source has no browser credentials, storage, mutation or token-extraction behavior", () => {
  const source = readFileSync(
    new URL(
      "../../scripts/cp-crm-native04b4-independent-session-preflight.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /auth\/v1\/user/);
  assert.match(source, /response\.json\(\)/);
  assert.match(source, /const \{ chromium \} = await import\("playwright"\)/);
  assert.match(source, /connectOverCDP/);
  assert.match(source, /\.goto\(originalRoute/);
  assert.doesNotMatch(
    source,
    /(?:localStorage|sessionStorage|document\.cookie)(?:\[|\.|\()/,
  );
  assert.doesNotMatch(source, /\.request\.(?:post|put|delete|patch)\s*\(/);
  assert.doesNotMatch(source, /page\.(?:click|fill|press|type)\s*\(/);
  assert.doesNotMatch(source, /\.locator\([^)]*\)\.click\s*\(/);
  assert.doesNotMatch(
    source,
    /console\.log\(identity\)|console\.log\(observations\)/,
  );
});
