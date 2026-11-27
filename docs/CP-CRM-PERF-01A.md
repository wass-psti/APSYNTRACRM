# CP-CRM-PERF-01A — signed runtime and sustained workload

This checkpoint extends CP-CRM-PERF-01 with a genuine signed, disposable TimeTracker OT fixture. It is not a full-platform certification. The existing production browser is read-only; the available staging branches did not establish migration parity during CP-CRM-PERF-01. No production data, credentials, authorization, deployment architecture or operational application code changes are required.

## Measurement protocol

- Reuse the existing isolated GoTrue, PostgreSQL and PostgREST OT fixture and its signed functional assertions.
- Chromium performs a real signed Auth user read and OT snapshot, validates the signed actor, and renders using the existing OT presentation module.
- Smoke: 30 cold and 30 warm fixture starts for each Employee/HR and desktop/mobile viewport combination (240 fixture starts), plus two polling-eligible pages for 35 seconds. Cache eligibility is not full CRM session restoration. API bytes are decoded response bytes and latency includes local proxy overhead.
- Sustained single and dual: separate fresh CI runners with the same fixture setup, same commit and identical ten-minute idle, interaction and idle-recovery phases (30 minutes per cohort). Each eligible page runs the actual 30-second PlatformSync fallback timer and a signed OT snapshot on reconciliation. The interaction phase clicks actual OT filter controls with a fixture-local listener, not the full application dispatcher. Both tabs are deliberately treated as visible; this is a conservative concurrent polling workload.
- Numeric renderer metrics, host CPU counter deltas and sampled Docker service CPU/memory are retained; host CPU includes the CI runner and is not production CPU. Each mode has a 45-minute timeout. Failures are not silently ignored.
- The actual OT request and audit table content is compared before and after benchmarking, without exporting hashes or row data. Auth and business fixture mutations performed before the benchmark are isolated to disposable containers. No production RPCs or business mutations are permitted during performance measurement.
- A 30-minute cohort is not verified until its completed artifact and integrity check are inspected. Separate runners can differ in physical capacity; any comparison must disclose this and compare per-window request counts and rates, not infer causality from host CPU alone.

## Remaining platform-wide scope

The canonical inventory is included in the report; only TimeTracker OT is covered by this specific signed benchmark. Full application login/restore, actual CRM navigation, all other native/integrated applications, genuine Realtime transport and matched representative platform-wide backend load still require an environment with verified full migration and fixture parity. Do not treat a signed renderer fixture as a complete authenticated CRM session. No additional authorization restrictions or permanent telemetry are introduced; no training or model parameter changes.
