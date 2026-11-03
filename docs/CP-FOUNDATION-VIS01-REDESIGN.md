# CP-FOUNDATION-VIS01 — Signed 12-board Foundation UI modernization

**Date:** 2026-11-03  
**Scope:** 13 annotated areas of the signed \`#/foundation\` page: foundation main surface, signed breadcrumb/topbar and session indicator, overview heading and readiness action, the four structural verification cards, provisioning/QA acceptance panel, readiness heading and table, and restricted-domain security notice.

## Approved architecture and constraints

- APSYNTRA CRM production currently serves static ES modules/CSS via GitHub Pages; it does **not** contain a Vite/TypeScript build pipeline. This checkpoint intentionally preserves the current architecture and uses typed JSDoc, native CSS custom properties, SVG and the Web Animations API. It does **not** force a Vite migration or add Motion for JavaScript, Three.js/WebGL2 or GLSL to this persistent operational table. Added GPU rendering here would be a performance regression risk without a justifiable functional benefit.
- **No database migration, production-data mutation, credentials, role, permission, RPC contract, board type, test fixture or workflow change.**
- Readiness metrics still derive only from \`summarizeFoundation(rows)\`, which is filled by existing authorized signed board inspection. Contract version still comes from \`BOARD_CONTRACT_VERSION\`. The page does not fabricate readiness, operational QA passes or application acceptance.
- Provisioning and twelve-board QA actions retain their exact \`data-action\` hooks, existing \`canProvision\`/busy gating, platform role checks, explicit typed confirmation steps, signed SDK operations, negative test/empty-board boundaries and audit behavior.
- The table reuses \`BOARD_MODULES\`, \`boardColumns()\`, escaped runtime board IDs, status and note fields. Protected TimeTracker and other restricted source fields remain described as unavailable until backend-enforced field authorization exists.

## Implementation

- \`frontend/board-foundation-ui.js\`: wraps current content in \`.aps-foundation\`, adds a semantic hero and decorative static SVG, four metrics with safe constant SVG icons, semantic section headings and table column scopes, styles the two existing actions, and preserves the full restricted-data note and escaped errors. No new actions or status claims.
- \`frontend/foundation-visuals.js\`: allowlisted static SVG icons and a short interruptible one-shot native entrance effect. Nothing runs when the document is hidden or under \`prefers-reduced-motion\`. Re-rendering the same view cancels animations and never replays the entrance; sign-out cancels all effects. No graphics canvas, telemetry, polling or continuous animation loop.
- \`frontend/foundation-experience.css\`: all rules scoped to \`#app .aps-foundation\` or \`#app .aps-foundation-shell\`, including the topbar. Refined blue-violet enterprise styling consistent with Overview/My boards; polished metrics, provisioning panel, acceptance summary, 12-domain readiness table, horizontally scrollable table on smaller devices, readable security notice, contrast/focus states and 1250/820/650/395px breakpoints.
- \`frontend/app.js\`: toggles \`.aps-foundation-shell\` only on the Foundation route and mounts/cancels presentation-only native animations; no changes to signed route, role, backend or confirmation logic.
- \`index.html\`: loads the new same-origin stylesheet; no CSP changes.
- \`frontend/tests/foundation-experience.test.mjs\`: checks scoping, live data provenance, gating, 12 typed rows, link policy, safe escaping, static SVG, reduced motion and lifecycle cleanup.
- \`scripts/pages-smoke.mjs\`: exact SHA comparison of both new assets served by GitHub Pages.

## Acceptance gates

Automated validation includes all existing frontend suites, database test workflows, production Pages build and exact-commit CDN smoke against the new assets. These establish implementation and deployment evidence only when all checks pass.

Remaining **signed-browser acceptance**: desktop/mobile screenshot comparison; actual signed bootstrap administrator and ordinary-role denial states; Refresh reading authorized board state; tab navigation and focus; authorized provisioning and operational checks only under separately approved nonproduction fixture controls (do not run against populated production boards); reachable readiness links; table scroll/contrast/zoom; reduced-motion and long-session cleanup. **120 FPS target is not verified** until real frame-pacing measurements on a compatible 120Hz device.

**Reporting rule:** Classify implementation, CI, deploy and signed-browser independently. No production readiness claim based on only compilation or AI review.
