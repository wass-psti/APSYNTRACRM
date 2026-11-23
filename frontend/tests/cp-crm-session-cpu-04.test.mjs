import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldPreserveSignedSessionOnContextFailure } from "../platform-sync.js";

test("workspace-context denials preserve a separately verified signed Auth session", () => {
  for (const error of [
    Object.assign(new Error("workspace context denied"), { status: 401 }),
    Object.assign(new Error("workspace context denied"), { status: 403 }),
    Object.assign(new Error("insufficient privilege"), { code: "42501" }),
  ]) {
    assert.equal(
      shouldPreserveSignedSessionOnContextFailure(error, {
        authSignedIn: true,
      }),
      true,
    );
  }
});

test("workspace-context failures do not preserve a session that is not signed in", () => {
  for (const error of [
    Object.assign(new Error("workspace context denied"), { status: 401 }),
    Object.assign(new Error("workspace context denied"), { status: 403 }),
    Object.assign(new Error("insufficient privilege"), { code: "42501" }),
  ]) {
    assert.equal(
      shouldPreserveSignedSessionOnContextFailure(error, {
        authSignedIn: false,
      }),
      false,
    );
  }
});

test("unrelated workspace read failures use normal retry/reconnect handling", () => {
  for (const error of [
    Object.assign(new Error("temporary outage"), { status: 503 }),
    Object.assign(new Error("request timed out"), { code: "REQUEST_TIMEOUT" }),
    Object.assign(new Error("network unavailable"), {
      code: "NETWORK_UNAVAILABLE",
    }),
  ]) {
    assert.equal(
      shouldPreserveSignedSessionOnContextFailure(error, {
        authSignedIn: true,
      }),
      false,
    );
  }
});

test("platform reconciliation isolates Auth identity verification from workspace-context reads", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf("async function reconcilePlatformSync(");
  const end = app.indexOf("\nlet workspaceRelationReadGeneration", start);
  const reconcile = app.slice(start, end);
  assert.ok(
    start >= 0 && end > start,
    "reconciliation function boundaries must exist",
  );

  assert.match(reconcile, /who=await auth\.getVerifiedUser\(\)/);
  assert.match(reconcile, /current=await db\.context\(\)/);
  assert.match(
    reconcile,
    /if\(isCurrent\(\)&&\[401,403\]\.includes\(Number\(error\?\.status\)\)\)\s*invalidateSignedSyncView\(\)/,
  );
  assert.match(
    reconcile,
    /shouldPreserveSignedSessionOnContextFailure\(error,\{\s*authSignedIn:auth\.isSignedIn\s*\}\)/,
  );
  assert.match(
    reconcile,
    /invalidateSignedSyncView\(\{preserveAuth:true,error\}\)/,
  );

  const contextCatchStart = reconcile.indexOf("current=await db.context()");
  const contextCatch = reconcile.slice(
    contextCatchStart,
    reconcile.indexOf("if(!isCurrent())return false;", contextCatchStart),
  );
  assert.doesNotMatch(contextCatch, /auth\.clear\(/);
});

test("workspace-context recovery keeps the Auth session and presents the bounded retry UI", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf("function invalidateSignedSyncView(");
  const end = app.indexOf("\nasync function reconcilePlatformSync(", start);
  const recovery = app.slice(start, end);
  assert.ok(
    start >= 0 && end > start,
    "signed sync recovery function boundaries must exist",
  );
  assert.match(recovery, /if\(preserveAuth&&auth\.isSignedIn\)\{/);
  assert.match(recovery, /renderBootstrapFailure\(error\|\|new ApiError/);
  assert.match(
    recovery,
    /return;\s*\}\s*platformSync\.stop\(\);\s*auth\.clear\(\)/,
  );
  assert.doesNotMatch(
    recovery,
    /platformSync\.stop\(\)[\s\S]*?if\(preserveAuth/,
  );
  assert.match(recovery, /renderLogin\('Your signed workspace access changed/);

  const bootstrapStart = app.indexOf("function renderBootstrapFailure(");
  const bootstrapEnd = app.indexOf("\nasync function login(", bootstrapStart);
  const bootstrap = app.slice(bootstrapStart, bootstrapEnd);
  assert.ok(bootstrapStart >= 0 && bootstrapEnd > bootstrapStart);
  assert.match(bootstrap, /platformSync\.stop\(\)/);
});

test("genuine Auth identity denial retains the existing sign-in recovery path", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf("async function reconcilePlatformSync(");
  const end = app.indexOf("\nlet workspaceRelationReadGeneration", start);
  const reconcile = app.slice(start, end);
  assert.match(
    reconcile,
    /auth\.getVerifiedUser\(\)[\s\S]*?invalidateSignedSyncView\(\)/,
  );
  assert.match(
    reconcile,
    /current=await db\.context\(\)[\s\S]*?invalidateSignedSyncView\(\{preserveAuth:true,error\}\)/,
  );
});
