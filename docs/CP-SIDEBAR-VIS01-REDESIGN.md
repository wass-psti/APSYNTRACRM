# CP-SIDEBAR-VIS01 — Signed APSYNTRA CRM sidebar modernization

**Date:** 2026-11-03  
**Scope:** Five browser annotations identify \`aside.sidebar\` and its branding, Work Management indicator, primary navigation and Recent boards. This checkpoint changes only the signed workspace sidebar presentation, its scoped CSS, and relevant regression/deployment evidence. No board, backend, auth, roles, data or access-policy changes.

## Architecture and decisions

- Repository currently runs **native ES modules + static HTML/CSS on GitHub Pages**, not Vite/TypeScript. This approved UI-only increment preserves that pipeline, with JSDoc types and preexisting module boundaries rather than a compiler migration.
- **Existing authoritative signed state only** feeds all labels, recent board IDs, board counts and role visibility. Bootstrap-only links remain gated by \`state.roleVerified===true\`; this is presentation-only and does not replace server authorization.
- Brand image remains the uploaded \`apsyntra-logo.webp\`. All navigation destinations, active route matching, sign-out \`data-action="logout"\` and links continue to use the existing hash-router; no new routes or credentials storage.
- **Scoped visual layer:** \`#app .aps-sidebar\` (new \`frontend/sidebar-experience.css\`) supplies a light indigo/navy palette, design tokens, workspace card, active rail, keyboard focus, recent-board initial badges, pinned identity/footer, and independently scrollable navigation. Existing main board scrolling is untouched.
- **SVG icons:** Static, allowlisted icon paths in \`frontend/sidebar-visuals.js\`; no remote assets, runtime HTML ingestion, inline styles, shader contexts or CSSOM injection.
- **Motion:** An optional 190ms one-shot native Web Animations API transition only when the signed view actually changes; on repeated rerenders it does not replay. It is cancellable, turns off under reduced motion and never delays route rendering.
- **Responsive:** At widths <=810px the existing narrow rail remains, with accessible \`aria-label\` and \`title\` on every link and sign-out. The scrollable region is between a fixed brand/workspace header and pinned user section; navigation focus and sign-out are accessible at short viewport heights.
- **GPU/extra libraries:** Three.js, WebGL 2, GLSL shaders, Motion for JavaScript and View Transition API are intentionally **not added** to persistent sidebar navigation: adding a 3D context or concurrent animation engines would increase GPU usage and conflict with the performance priority without helping task completion. The repository already has Three.js in isolated initialization/login graphics. 120 FPS remains a target, not a measured claim.

## Files
- \`frontend/app.js\`: replaces only the \`sidebar()\` presentation and adds a scoped native animation call in \`shell()\`, plus cleanup when switching to login; existing authenticated workflow untouched.
- \`frontend/sidebar-visuals.js\`: static SVG icons + minimal WAAPI.
- \`frontend/sidebar-experience.css\`: isolated desktop/rail responsive design.
- \`index.html\`: same-origin stylesheet link; **CSP unchanged**.
- \`frontend/tests/sidebar-experience.test.mjs\`: static route and role-gate safety checks, icon safety, reduced motion, animation cleanup, layout and signed-shell guard.
- \`scripts/pages-smoke.mjs\`: includes both new same-origin sidebar assets in exact-SHA CDN verification.

## Acceptance
1. All preexisting signed routes, bootstrap/nonbootstrap visibility and recent board destinations remain functional. Test an actual admin and denied-role account separately; both must be subject to server-side RBAC.
2. Confirm keyboard, screen reader labels, responsive 320px/810px/1094px/1440px, 200% zoom, focus indicator, tall and short viewports, scrollability of recent boards and account sign-out.
3. Check reduced-motion and animation cancellation. No infinite animation/graphics loop in sidebar.
4. Verify no main area scroll regression, no login/auth changes, and no data/permissions write.
5. CI validation and live Pages verification must be completed for **the final commit** before claiming deployment. 120 FPS requires actual frame-pacing measurement on a 120Hz-capable display; automated unit tests are not performance certification.

**Classification:** Implementation should be marked VERIFIED only for tested code and deployment; genuine signed-user browser acceptance, visual comparison and 120Hz measurement remain PENDING until captured.
