# CP-CRM-NATIVE-CORE-02B — Genuine Signed Session and Cross-Window Acceptance

**Date:** November 20, 2026 (Asia/Manila)
**Disposition:** PARTIAL. Local implementation/test coverage is verified; genuine signed production acceptance is BLOCKED by the absent employee QA session.

## Production evidence

The authorized Mac is connected and local `main` contains CP-CRM-NATIVE-CORE-02 (`62d61567`). Chromium CDP `127.0.0.1:9222` has one APSYNTRA CRM tab at the TradeLink native route. It shows the sign-in form, with no currently signed employee. Its stale `window.__APSYNTRA_STARTUP.state === 'AUTHENTICATED'` reflects the last startup outcome and **does not** establish a current authenticated session. The acceptance harness uses signed UI **and** signed RPC results instead of this diagnostic flag.

No production credentials, tokens, accounts, roles, permissions, RLS, schema, or business data were read/modified. Prior read-only Board/cache tests verify scope isolation and BroadcastChannel delivery, but cannot replace an actual authenticated production browser.

## Delivered executable acceptance

`scripts/cp-crm-native-core-02b-crosswindow.mjs` accepts one already authenticated local Chromium browser, an authoritative SHA-256 pseudonymous account key, and one of the existing native module IDs (`time-tracker`, `fund-released-tracker`, `fueltrack-plus`, `tradelink`).

Example (only after the designated assigned employee signs in directly on the authorized Mac):

```sh
node scripts/cp-crm-native-core-02b-crosswindow.mjs \
  --cdp-url=http://127.0.0.1:9222 \
  --module=tradelink \
  --expected-user-key=<account-key-from-authoritative-inventory>
```

The harness performs only read-only work:

1. **Initial:** navigate to the assigned native route, observe a real `native_application_board_context` RPC and native UI, and validate the exact signed user, workspace, module and canonical Board ID.
2. **Refresh:** independently repeat the signed server check after a browser reload.
3. **Second tab:** open a new tab in the same authorized signed browser context and independently verify its native startup. This is *one signed identity in two tabs*, not impersonation or proof of another employee's login.
4. **Cross-window reconciliation:** send a synthetic, same-scope `BroadcastChannel` cache-invalidation **hint containing only user/workspace/Board identifiers**. Verify a fresh signed native resolver read in the second tab with the same user, workspace, module, and Board. No application record is written.

The script closes the test tab and restores the original tab URL. It emits `NATIVE_SYNC_ACCEPTANCE` with separately classified `initial`, `refresh`, `reopen`, and `crossWindow` results. Any missing signed session or mismatch fails closed with `BLOCKED`. This is a *read-only synchronization and initialization probe*, not validation of a committed data mutation or every permitted business workflow.

## Validation and limitations

- Unit tests check absence of false sign-in evidence, exact Board/workspace/user identity, immutable invalidation-envelope semantics, and absence of login, storage, business writes, or permission changes.
- Existing `frontend/tests/board-cache-channel.test.mjs` covers real channel delivery, wrong-scope rejection, cache invalidation and signed lifecycle hooks.
- **BLOCKED:** production signed initial/refresh/second-tab runtime results for the four applications. The Mac QA browser is signed out. No employee sign-in was automated and no credentials were requested/extracted.
- **PENDING:** genuine permitted native workflow readback after a signed employee returns, and post-merge CI/deployment evidence.

## Continuation gate

Resume **CP-CRM-NATIVE-CORE-02B signed runtime closeout** after an assigned employee signs in directly to the existing Chromium QA tab. Run the existing four-app initial/refresh domain runner together with this cross-window acceptance runner, using the actual expected user key and assignment list. Implement further code changes only if they reveal reproducible failures. The separate future eight native conversions are excluded.
