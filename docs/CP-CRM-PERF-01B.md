# CP-CRM-PERF-01B — partial signed baseline expansion and bottleneck attribution

Source: GitHub Actions run 45969692580, commit 996c7430cfe5bf52a2257bd3764c9f0054f119ab. Three completed successful jobs, 21 unit tests and 81 signed HTTP/SQL checks per job. Retained artifacts: smoke 15184382008, single 15185379149, dual 15185603476.

| Cohort | Duration | Snapshot requests | Response bytes | Filter interactions | Interaction p95 |
|---|---:|---:|---:|---:|---:|
| Single | 30m | 59 | 379016 | 40 | 30.8ms |
| Dual | 30m | 97 | 623225 | 80 | 2031.1ms |

Both preserved OT request/audit integrity, with zero request errors. Dual interaction timing confounds background animation frame scheduling. Commit 4edbb069eb39540299d8949bd883e9ac42cbba0c introduces foreground visibility checks; follow-up run 45976010253 must be inspected separately. Do not compare fixture runner CPU with production CPU or imply a causal reduction from different runners.

## FuelTrans fixture

Reuse existing disposable GoTrue and PostgREST environment and actual native module, with explicitly emulated CRM host handshake. Thirty dashboard-to-queue and queue-to-dashboard cycles per desktop/mobile viewport. Automatic refresh off only inside the test. Count and list read calls, response body bytes and navigation ready time. Validate actual destination DOM, block write requests during the benchmark, compare ticket contents before/after. Report numeric-only evidence; no real production account or data. Source dashboard issues six independent count requests plus one list request; queue issues one list request.

## Full-host environment remains unverified

Do not label app-specific fixtures as platform-wide signed acceptance. Material Sourcing integration is evolving concurrently; re-read the canonical inventory at certification. Existing prior nonproduction branches lack registered production migration parity; do not modify them or copy private records without approval. Full signed startup, sidebar navigation, all other app flows and genuine Realtime require a verified representative environment with synthetic records and actual installed migration contracts. No production app, authorization, training or model changes.
