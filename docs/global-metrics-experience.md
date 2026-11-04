# APSYNTRA CRM — Global Metrics Experience

Milestone: CP-CRM-METRIC-01. This is a shared frontend presentation enhancement, not a data source or chart migration.

## Scope and baseline

Preserves the authoritative value, formatting, access scope, and server contract of every existing KPI, including Workspace Overview, Foundation, Role Management, Finance, TimeTracker Overview/Reports/Calendar/OT/My Hours/Team/Monitor/GPS, and existing report charts. The JavaScript does not alter KPI textContent, recompute attendance values, fetch records, write data, or replace the original visualization contracts. Unavailable, formatted ratios, role labels, timestamps, and non-numeric metrics retain their exact rendered text and are never guessed.

A shared ESM module observes explicitly selected metric values/cards/charts through a single MutationObserver; the global CSS includes responsive spacing, accessible contrast and reduced-motion rules. IntersectionObserver defers one-shot card reveal to the first viewport entry. ResizeObserver resizes *decorative* Canvas gauges on supported compact percent cards. requestAnimationFrame animates percentage gauges for no more than 450 ms, with a maximum of twelve concurrent animated KPI surfaces and 60 FPS / 30 FPS frame budgets for full/lite motion. No continuous animation or monitoring runs after completion.

## Full technology mapping

- Vanilla JavaScript ES Modules + HTML5 + CSS3 + CSS Custom Properties: the existing UI plus scoped progressive metric classes; no virtual DOM, rewrite, or new build tool
- Motion for JS 12.38.0: pinned lazy UMD from the already approved unpkg script origin; only one-shot visible card opacity enhancement
- GSAP 3.15.0: pinned lazy UMD from the same approved origin; only numerical progress tweening of a standalone object used to draw a Canvas gauge, never direct CSS writes
- SVG: a compact decorative radial meter using the already displayed exact 0–100% value, never a fabricated timeseries
- Canvas 2D: compact radial percent meter on selected TimeTracker KPI types, with DPR capped at 2 and one-time render/resize; no offscreen workers or global drawing loop
- Web Animations API: short compositor-friendly card entrance fallback, with cancellation when removed
- IntersectionObserver / ResizeObserver: first-view deferred animation and Canvas size management
- requestAnimationFrame: bounded progress interpolation, cancelled on route removal or hidden tab
- Adaptive Motion: reduced-motion, Save Data, hidden-tab, CPU/memory profile and frame-budget checks
- Accessible live regions: one polite summary is triggered only by an explicit authorized refresh control followed by a new metric render; never announce every animation frame or reveal identities/values
- Performance Profiling: opt-in, bounded in-memory samples of Canvas draw duration; a callback is invoked only when supplied, with no console logging, persistent storage or telemetry

Both animation libraries are loaded **only when** a visible percent metric is eligible for full motion and the relevant enhancement is enabled. Basic cards, numeric text, charts, or fallback devices do not require external dependencies. The optional libraries are non-blocking and have WAAPI/RAF/CSS fallback if unavailable. Motion and GSAP are not imported into the initial critical render path.

## Data integrity and security

A decorative progress ring is shown only for exact signed metric text that parses as a number from 0 to 100 followed by %. It uses that percentage as the entire available data input. It is aria-hidden so screen readers hear the original canonical text, not duplicate or intermediate animation values. Existing access restrictions, signed session, RBAC, RLS, clock restrictions, board contracts, report/filter semantics and backend calls are untouched.

The original Content Security Policy remains unchanged, including style-src-attr none. No direct style attributes, unsafe HTML, eval, new worker or inline scripts. The extra dependencies use the already allowlisted unpkg.com script source. Verify their availability in a production authenticated browser; compilation and smoke checks alone do not prove the optional scripts or GPU/frame-rate performance.

## Acceptance and remaining gates

Automated tests verify component coverage, parsing, missing-data denial, SVG and Canvas percent integrity, adaptive controls, opt-in profile bounds, pinned dependencies, strict CSP, progressive lifecycle and exact Pages manifest registration. The frontend build, disposable DB checks and live Pages asset hashes are independent gates. Signed-user visual acceptance, assistive technology testing, reduced-motion on real browsers, third-party library load verification, and a genuine FPS measurement remain outstanding until observed.
